package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// PayPal settlement event types accepted by the settlement ledger.
const (
	PayPalSettlementRefunded = "PAYMENT.CAPTURE.REFUNDED"
	PayPalSettlementReversed = "PAYMENT.CAPTURE.REVERSED"
)

// Ledger error sentinels. They describe the failure class so callers (and the
// webhook layer) can distinguish a hard conflict from an invalid event without
// pattern-matching on error strings.
var (
	ErrPayPalSettlementInvalid       = errors.New("paypal settlement event is invalid")
	ErrPayPalSettlementConflict      = errors.New("paypal settlement event conflicts with an existing ledger entry")
	ErrPayPalSettlementNotApplicable = errors.New("paypal settlement event is not applicable to the order")
)

// PayPalSettlementEvent is the append-only ledger row for a PayPal settlement
// event (refund or reversal). It is the source of truth for settlement
// idempotency: a unique Event ID and a unique Resource Key make replay and
// cross-delivery deduplication deterministic and cross-database.
//
// Only payment-identifying data is stored. Raw webhook payloads, headers,
// payer PII, and credentials are intentionally never persisted here.
type PayPalSettlementEvent struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	EventID     string `json:"event_id" gorm:"uniqueIndex;type:varchar(255);not null"`
	EventType   string `json:"event_type" gorm:"type:varchar(64);not null"`
	ResourceID  string `json:"resource_id" gorm:"type:varchar(255);not null"`
	ResourceKey string `json:"resource_key" gorm:"uniqueIndex;type:varchar(255);not null"`
	TopUpID     int    `json:"top_up_id" gorm:"index;not null"`
	TradeNo     string `json:"trade_no" gorm:"type:varchar(255);index"`
	CaptureID   string `json:"capture_id" gorm:"type:varchar(255)"`
	Amount      string `json:"amount" gorm:"type:varchar(32)"`
	Currency    string `json:"currency" gorm:"type:varchar(8)"`
	CreateTime  int64  `json:"create_time"`
}

// TableName pins the GORM table name so cross-database migrations and test
// cleanup reference a single deterministic name regardless of naming strategy.
func (PayPalSettlementEvent) TableName() string {
	return "pay_pal_settlement_events"
}

// PayPalSettlementInput carries the validated fields a webhook settlement needs.
// ExpectedCurrency is the configured PayPal currency; the ledger validates the
// event currency against it inside the transaction so the check is bound to the
// locked order rather than to a pre-lock race.
type PayPalSettlementInput struct {
	EventID          string
	EventType        string
	ResourceID       string
	TradeNo          string
	CaptureID        string
	Amount           string
	Currency         string
	ExpectedCurrency string
}

// resourceKeyFor returns the canonical ledger key event_type + ":" + resource_id.
// The event_type prefix keeps a refund id and a capture id (which may collide on
// raw value) in separate key spaces, so a refund and a reversal on the same
// capture can both be recorded.
func resourceKeyFor(eventType, resourceID string) string {
	return eventType + ":" + resourceID
}

// isAcceptedSettlementEventType reports whether the event type is handled by the
// settlement ledger. Disputes and other capture events are intentionally
// excluded (P0-2B2).
func isAcceptedSettlementEventType(eventType string) bool {
	return eventType == PayPalSettlementRefunded || eventType == PayPalSettlementReversed
}

// validateSettlementInput performs the fail-closed field checks that do not
// require the locked order. Empty identifiers, unknown event types, and
// non-positive or unparseable amounts are rejected before any row lock.
func validateSettlementInput(in PayPalSettlementInput) error {
	if !isAcceptedSettlementEventType(in.EventType) {
		return fmt.Errorf("%w: unsupported event type %q", ErrPayPalSettlementInvalid, in.EventType)
	}
	if strings.TrimSpace(in.EventID) == "" {
		return fmt.Errorf("%w: event id is empty", ErrPayPalSettlementInvalid)
	}
	if strings.TrimSpace(in.ResourceID) == "" {
		return fmt.Errorf("%w: resource id is empty", ErrPayPalSettlementInvalid)
	}
	if strings.TrimSpace(in.TradeNo) == "" {
		return fmt.Errorf("%w: trade no is empty", ErrPayPalSettlementInvalid)
	}
	if strings.TrimSpace(in.CaptureID) == "" {
		return fmt.Errorf("%w: capture id is empty", ErrPayPalSettlementInvalid)
	}
	if strings.TrimSpace(in.Currency) == "" {
		return fmt.Errorf("%w: currency is empty", ErrPayPalSettlementInvalid)
	}
	if strings.TrimSpace(in.ExpectedCurrency) == "" {
		return fmt.Errorf("%w: expected currency is empty", ErrPayPalSettlementInvalid)
	}
	amt, err := decimal.NewFromString(in.Amount)
	if err != nil {
		return fmt.Errorf("%w: amount is not a valid decimal %q: %v", ErrPayPalSettlementInvalid, in.Amount, err)
	}
	if !amt.GreaterThan(decimal.Zero) {
		return fmt.Errorf("%w: amount must be positive: %s", ErrPayPalSettlementInvalid, amt.String())
	}
	return nil
}

// ledgerContentMatches reports whether an existing ledger row carries the same
// settlement content as the input. Content is every field that identifies the
// settlement (event type, resource id, order, capture, amount, currency). A
// matching row is an idempotent replay; a mismatch is a hard conflict. The
// TopUpID binding is checked by the caller against the locked order.
func ledgerContentMatches(row *PayPalSettlementEvent, in PayPalSettlementInput, resourceKey string) bool {
	if row.EventType != in.EventType {
		return false
	}
	if row.ResourceID != in.ResourceID {
		return false
	}
	if row.ResourceKey != resourceKey {
		return false
	}
	if row.TradeNo != in.TradeNo {
		return false
	}
	if row.CaptureID != in.CaptureID {
		return false
	}
	if row.Amount != in.Amount {
		return false
	}
	if row.Currency != in.Currency {
		return false
	}
	return true
}

// ApplyPayPalSettlement records a PayPal refund or reversal event and applies
// the quota deduction exactly once, in a single database transaction.
//
// Accepted event types are PAYMENT.CAPTURE.REFUNDED and PAYMENT.CAPTURE.REVERSED.
// For REFUNDED, ResourceID is the PayPal Refund ID; for REVERSED it is the
// Capture ID. The Resource Key is event_type + ":" + resource_id.
//
// Idempotency:
//   - A replayed Event ID with identical content is a no-op.
//   - The same Resource Key under a different Event ID with identical content is
//     a no-op.
//   - An Event ID or Resource Key reused with different content (including a
//     different order) is a hard failure (ErrPayPalSettlementConflict).
//
// A refund and a reversal on the same order may both be recorded (distinct
// Resource Keys), but the quota is deducted only once: the first settlement
// flips the order to refunded; the second records its ledger row without
// deducting. Any failure rolls back the entire transaction.
//
// The deduction uses the order's persisted BaseQuota + BonusQuota when
// BaseQuota is non-zero, so a refund matches the actual credit the settlement
// granted even after QuotaPerUnit is changed. For orders settled before
// BaseQuota was persisted, the deduction is recomputed from Money at the
// locked order's value (a best-effort fallback that the changelog documents as
// a known historical boundary). The user row is locked and the deduction
// checks int32 underflow before touching quota, so a refund never mints quota
// or races against a concurrent settlement.
//
// Returns the actual quota deducted by this call: 0 for a no-op replay or
// when the sibling event already settled, or quota > 0 when this call was the
// one that flipped the order. The caller mirrors it to the user quota cache
// only after a successful commit so a rolled-back transaction never leaves
// the cache ahead of the database.
func ApplyPayPalSettlement(in PayPalSettlementInput) (int, error) {
	if err := validateSettlementInput(in); err != nil {
		return 0, err
	}
	resourceKey := resourceKeyFor(in.EventType, in.ResourceID)

	var deducted int
	var deductedUserID int
	err := DB.Transaction(func(tx *gorm.DB) error {
		// 1. Lock the order row (SELECT ... FOR UPDATE on MySQL/PostgreSQL;
		//    no-op on SQLite, which serializes via the connection).
		var topUp TopUp
		if err := lockForUpdate(tx).Where("trade_no = ?", in.TradeNo).First(&topUp).Error; err != nil {
			return fmt.Errorf("%w: order not found trade_no=%s", ErrPayPalSettlementNotApplicable, in.TradeNo)
		}

		// Capture the real user id right after the order is loaded, so the
		// post-commit HINCRBY/HDECRBY fast path uses the real user no matter
		// which branch the idempotency check takes next. The replay/no-op
		// branches intentionally do NOT touch the cache; the user id is
		// not used there.
		deductedUserID = topUp.UserId

		// 2. Validate the order against the event, inside the lock.
		if topUp.PaymentProvider != PaymentProviderPayPal {
			return fmt.Errorf("%w: order is not a PayPal order", ErrPayPalSettlementNotApplicable)
		}
		if strings.TrimSpace(topUp.GetTransactionId()) == "" {
			return fmt.Errorf("%w: order has no captured transaction id", ErrPayPalSettlementNotApplicable)
		}
		if topUp.GetTransactionId() != in.CaptureID {
			return fmt.Errorf("%w: capture id mismatch local=%s event=%s", ErrPayPalSettlementNotApplicable, topUp.GetTransactionId(), in.CaptureID)
		}
		if in.Currency != in.ExpectedCurrency {
			return fmt.Errorf("%w: currency mismatch configured=%s event=%s", ErrPayPalSettlementNotApplicable, in.ExpectedCurrency, in.Currency)
		}
		amt, err := decimal.NewFromString(in.Amount)
		if err != nil {
			return fmt.Errorf("%w: amount is not a valid decimal %q", ErrPayPalSettlementInvalid, in.Amount)
		}
		expected := decimal.NewFromFloat(topUp.Money).Round(2)
		if !amt.Equal(expected) {
			return fmt.Errorf("%w: amount mismatch local=%s event=%s", ErrPayPalSettlementNotApplicable, expected.String(), amt.String())
		}

		// 3. Idempotency / conflict check against existing ledger rows.
		var byEventID PayPalSettlementEvent
		errEvent := tx.Where("event_id = ?", in.EventID).First(&byEventID).Error
		if errEvent != nil && !errors.Is(errEvent, gorm.ErrRecordNotFound) {
			return fmt.Errorf("query ledger by event id failed: %w", errEvent)
		}
		if errEvent == nil {
			// Same Event ID exists. Identical content -> idempotent no-op.
			// The cache is not touched on this path; see the post-commit
			// comment for the no-op contract.
			if ledgerContentMatches(&byEventID, in, resourceKey) && byEventID.TopUpID == topUp.Id {
				return nil
			}
			return fmt.Errorf("%w: event id %s reused with different content", ErrPayPalSettlementConflict, in.EventID)
		}

		var byKey PayPalSettlementEvent
		errKey := tx.Where("resource_key = ?", resourceKey).First(&byKey).Error
		if errKey != nil && !errors.Is(errKey, gorm.ErrRecordNotFound) {
			return fmt.Errorf("query ledger by resource key failed: %w", errKey)
		}
		if errKey == nil {
			// Same Resource Key under a different Event ID. Identical content
			// (including the same order) -> idempotent no-op.
			// The cache is not touched on this path; see the post-commit
			// comment for the no-op contract.
			if ledgerContentMatches(&byKey, in, resourceKey) && byKey.TopUpID == topUp.Id {
				return nil
			}
			return fmt.Errorf("%w: resource key %s reused with different content", ErrPayPalSettlementConflict, resourceKey)
		}

		// 4. Record the ledger row. This insert is the final concurrency guard:
		//    a racing delivery that slipped past the read above hits the unique
		//    index and the whole transaction rolls back (fail-closed).
		row := &PayPalSettlementEvent{
			EventID:     in.EventID,
			EventType:   in.EventType,
			ResourceID:  in.ResourceID,
			ResourceKey: resourceKey,
			TopUpID:     topUp.Id,
			TradeNo:     topUp.TradeNo,
			CaptureID:   in.CaptureID,
			Amount:      in.Amount,
			Currency:    in.Currency,
			CreateTime:  common.GetTimestamp(),
		}
		if err := tx.Create(row).Error; err != nil {
			return fmt.Errorf("%w: ledger insert failed: %v", ErrPayPalSettlementConflict, err)
		}

		// 5. Apply the quota deduction exactly once. The first settlement flips
		//    the order to refunded; a cross-delivery (refund+reversal) finds the
		//    order already refunded and records its event without deducting.
		switch topUp.Status {
		case common.TopUpStatusRefunded:
			// Already settled by the sibling event; this event is recorded
			// above. The cache is not touched on this path; see the
			// post-commit comment for the no-op contract.
			return nil
		case common.TopUpStatusSuccess:
			// The order was credited with its paid quota plus the first top-up bonus
			// it granted, so the settlement claws both back. Reusing the persisted
			// BaseQuota keeps the refund and the credit byte-identical instead of
			// re-deriving the product here.
			baseQuota, err := settlementBaseQuota(&topUp)
			if err != nil {
				return fmt.Errorf("%w: cannot compute refund quota: %v", ErrPayPalSettlementNotApplicable, err)
			}
			quota, err := refundQuotaWithBonus(&topUp, baseQuota)
			if err != nil {
				return fmt.Errorf("%w: %v", ErrPayPalSettlementNotApplicable, err)
			}
			if quota <= 0 {
				return fmt.Errorf("%w: non-positive settlement quota: %d", ErrPayPalSettlementNotApplicable, quota)
			}

			// Lock the user row before deducting so a concurrent settlement that
			// is still granting this user quota cannot be raced into minting.
			var user User
			if err := lockForUpdate(tx).Where("id = ?", topUp.UserId).First(&user).Error; err != nil {
				return ErrTopUpUserMissing
			}
			// Allow the balance to go negative; only fail when the post-refund
			// value would underflow the int32 quota column. The check runs in
			// int64 so the subtraction itself cannot wrap.
			if _, err := safeRefundPostBalance(user.Quota, quota); err != nil {
				return fmt.Errorf("%w: %v", ErrPayPalSettlementNotApplicable, err)
			}

			res := tx.Model(&User{}).Where("id = ?", topUp.UserId).Update("quota", gorm.Expr("quota - ?", quota))
			if res.Error != nil {
				return fmt.Errorf("deduct quota failed: %w", res.Error)
			}
			if res.RowsAffected != 1 {
				return fmt.Errorf("%w: quota update affected %d rows for user %d", ErrPayPalSettlementNotApplicable, res.RowsAffected, topUp.UserId)
			}
			// Conditional status flip success -> refunded. A plain Save could
			// re-insert if the primary key were ever zero and is not conditional on
			// the expected prior status; the WHERE guards against a raced status
			// change and RowsAffected==1 proves the flip landed on exactly this order.
			res = tx.Model(&TopUp{}).Where("id = ? AND status = ?", topUp.Id, common.TopUpStatusSuccess).Update("status", common.TopUpStatusRefunded)
			if res.Error != nil {
				return fmt.Errorf("mark order refunded failed: %w", res.Error)
			}
			if res.RowsAffected != 1 {
				return fmt.Errorf("%w: order status update affected %d rows for order %d", ErrPayPalSettlementNotApplicable, res.RowsAffected, topUp.Id)
			}
			deducted = quota
			return nil
		default:
			return fmt.Errorf("%w: order status not success trade_no=%s status=%s", ErrPayPalSettlementNotApplicable, topUp.TradeNo, topUp.Status)
		}
	})
	if err != nil {
		return 0, err
	}
	if deducted > 0 {
		// Mirror the committed deduction to the user quota cache using the
		// upstream guarded delta helper; failures only log and the next
		// cache miss rehydrates from the committed database row.
		if err := cacheDecrUserQuota(deductedUserID, int64(deducted)); err != nil {
			common.SysLog(fmt.Sprintf("failed to sync paypal settlement deduction to user quota cache: %s", err.Error()))
		}
	}
	// A replay (deducted == 0) is a true no-op for the cache: the order was
	// already settled and no quota was deducted this call.
	return deducted, nil
}

// settlementBaseQuota returns the BaseQuota the settlement's refund will
// deduct. The order's persisted value is preferred so the refund matches the
// actual credit the settlement granted; legacy orders that were settled
// before BaseQuota was persisted fall back to the locked Money x QuotaPerUnit
// product, which is the only record of how much quota the payment bought.
func settlementBaseQuota(topUp *TopUp) (int, error) {
	if topUp.BaseQuota > 0 {
		return topUp.BaseQuota, nil
	}
	return common.WalletQuotaFromFloatStrict(topUp.Money * common.QuotaPerUnit)
}

// CountPayPalSettlementEventsForOrder returns the number of ledger rows bound to
// a top-up id. Used by tests to assert that refund+reversal records two events.
func CountPayPalSettlementEventsForOrder(topUpID int) (int64, error) {
	var count int64
	if err := DB.Model(&PayPalSettlementEvent{}).Where("top_up_id = ?", topUpID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}
