package model

import (
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// Shared settlement for real (money paid) top-ups.
//
// Each payment channel keeps its own signature verification, amount confirmation
// and webhook contract, but the state transition itself — pending -> success,
// the quota credit and the once-per-user first top-up bonus — happens only here,
// inside one database transaction that locks the order row and then the user
// row. The user row lock is what makes the bonus unique per user across payment
// channels and across gateway instances; the controller level order locks only
// serialize one order inside one process.

// ErrTopUpUserMissing is returned when the user referenced by a paid order no
// longer exists. The whole settlement rolls back so an order is never marked
// success without its credit landing somewhere.
var ErrTopUpUserMissing = errors.New("充值用户不存在")

// realTopUpProviders are the payment providers whose orders are real, paid
// top-ups. The list is explicit on purpose: "not balance" is not a safe proxy,
// because subscription settlement and any future non-payment source also write
// top_up rows and must neither grant nor consume the first top-up bonus.
var realTopUpProviders = []string{
	PaymentProviderEpay,
	PaymentProviderStripe,
	PaymentProviderCreem,
	PaymentProviderPayPal,
	PaymentProviderWaffo,
	PaymentProviderWaffoPancake,
}

// firstTopUpHistoryStatuses are the order states that prove the user already
// completed a real top-up. A refunded order still proves the payment happened,
// so refunding an order never gives the first top-up qualification back.
var firstTopUpHistoryStatuses = []string{common.TopUpStatusSuccess, common.TopUpStatusRefunded}

// legacyUnassignedRealTopUpFilter is the SQL fragment that recognises a row
// settled before the payment_provider audit field existed (added 2026-04):
// payment_provider was left at its default ” and Amount carried the order's
// dollar value. Rows with Amount=0 (subscriptions, balance adjustments) and
// rows whose provider is already set to a non-real value still fall through to
// the normal whitelist, so this predicate can be ORed into the history query
// without weakening any other rule.
const legacyUnassignedRealTopUpFilter = "(payment_provider = '' AND amount > 0)"

// firstTopUpHistoryPredicate is the SQL fragment that matches any row that
// counts toward the first top-up qualification: the new whitelisted providers
// OR a legacy unassigned real top-up.
var firstTopUpHistoryPredicate = fmt.Sprintf(
	"(payment_provider IN ? OR %s)",
	legacyUnassignedRealTopUpFilter,
)

// topUpReplayMode says what a settlement call against an already successful
// order means for the calling gateway. Every mode credits nothing, grants no
// bonus and writes no log; the modes only keep each channel's existing callback
// contract observable to the gateway.
type topUpReplayMode int

const (
	// replayIsNoOp acknowledges the duplicate (Waffo, Waffo Pancake, admin
	// manual completion, epay).
	replayIsNoOp topUpReplayMode = iota
	// replayIsStatusError rejects the duplicate, the way the Stripe and Creem
	// callbacks always did.
	replayIsStatusError
	// replayNeedsSameTransaction is PayPal: only the capture id that was already
	// credited may be replayed, any other capture is rejected.
	replayNeedsSameTransaction
)

// topUpSettleSpec describes one settlement request from a payment channel. It
// carries what the gateway confirmed, not how to talk to the gateway.
type topUpSettleSpec struct {
	// tradeNo is the pending order to settle.
	tradeNo string
	// provider must equal the stored order's payment_provider. An empty value
	// skips the check and is used only by the admin manual completion, which has
	// always been able to settle a pending order regardless of its gateway.
	provider string
	replay   topUpReplayMode
	// transaction is the gateway transaction id to record (PayPal capture id).
	transaction string
	// requireTransaction rejects a settlement that carries no transaction id.
	requireTransaction bool
	// payerEmail is stored on the user only when the account still has none.
	payerEmail string
	// userFields are extra user columns committed with the same credit, for
	// example stripe_customer.
	userFields map[string]interface{}
	// paymentMethod overrides the recorded payment method when the gateway
	// reports the concrete method the user actually paid with (epay).
	paymentMethod string
}

// TopUpSettlement is the outcome of a real top-up settlement. Callers use it to
// build their own log line, so no channel re-derives quota after the commit.
type TopUpSettlement struct {
	UserId          int
	TradeNo         string
	PaymentMethod   string
	Amount          int64
	Money           float64
	BaseQuota       int
	BonusQuota      int
	CreditedQuota   int
	FirstTopUpBonus bool
	// Credited is false when the order had already been settled, which makes the
	// call an idempotent replay: no quota moved, no bonus was granted and no
	// top-up log may be written for it.
	Credited bool
}

// QuotaLogText renders the quota part of a top-up log line. It states the paid
// quota, and only when a bonus actually fired it also states the bonus and the
// total credited, so a disabled promotion or a replayed callback can never read
// like a grant.
func (s *TopUpSettlement) QuotaLogText() string {
	if s.BonusQuota <= 0 {
		return logger.FormatQuota(s.BaseQuota)
	}
	return fmt.Sprintf(
		"%s（首次充值赠送 %s，合计 %s）",
		logger.FormatQuota(s.BaseQuota),
		logger.FormatQuota(s.BonusQuota),
		logger.FormatQuota(s.CreditedQuota),
	)
}

// settleRealTopUp settles one real, paid top-up order in a single transaction.
func settleRealTopUp(spec topUpSettleSpec) (*TopUpSettlement, error) {
	if spec.tradeNo == "" {
		return nil, errors.New("未提供支付单号")
	}

	settlement := &TopUpSettlement{}
	err := DB.Transaction(func(tx *gorm.DB) error {
		result, err := settleRealTopUpTx(tx, spec)
		if err != nil {
			return err
		}
		*settlement = *result
		return nil
	})
	if err != nil {
		return nil, err
	}

	// Fast path: mirror the actual credit to the user quota hash via
	// applyUserQuotaHashDelta. Redis HINCRBY is atomic and supports
	// negative deltas, so it is safe for both the positive first-top-up
	// credit and any later refund that drops the user below zero. The
	// shared helper also owns the safe-failure policy: in batch-update
	// mode a HINCRBY failure pins the cache Quota to MinQuota (a
	// "do-not-consume" sentinel) instead of deleting the row, so a
	// pending batch delta is never clobbered by a rebuild; in the
	// non-batch path a HINCRBY failure invalidates the cache so the
	// next GetUserCache rebuilds from the database row.
	if settlement.Credited {
		applyUserQuotaHashDelta(settlement.UserId, int64(settlement.CreditedQuota))
	}
	return settlement, nil
}

// settleRealTopUpTx performs the transactional part of settleRealTopUp. The
// whole body must run on tx: any error rolls back the order status, the bonus
// and the quota credit together.
func settleRealTopUpTx(tx *gorm.DB, spec topUpSettleSpec) (*TopUpSettlement, error) {
	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	var topUp TopUp
	if err := lockForUpdate(tx).Where(refCol+" = ?", spec.tradeNo).First(&topUp).Error; err != nil {
		return nil, errors.New("充值订单不存在")
	}
	if spec.provider != "" && topUp.PaymentProvider != spec.provider {
		return nil, ErrPaymentMethodMismatch
	}

	result := &TopUpSettlement{
		UserId:        topUp.UserId,
		TradeNo:       topUp.TradeNo,
		PaymentMethod: topUp.PaymentMethod,
		Amount:        topUp.Amount,
		Money:         topUp.Money,
		BonusQuota:    topUp.BonusQuota,
	}

	// An already successful order is settled business: report it according to the
	// channel's contract without touching quota, bonus or logs.
	if topUp.Status == common.TopUpStatusSuccess {
		result.Credited = false
		switch spec.replay {
		case replayIsNoOp:
			return result, nil
		case replayNeedsSameTransaction:
			if spec.transaction != "" && topUp.TransactionId == spec.transaction {
				return result, nil
			}
			return nil, ErrTopUpStatusInvalid
		default:
			return nil, ErrTopUpStatusInvalid
		}
	}
	if topUp.Status != common.TopUpStatusPending {
		return nil, ErrTopUpStatusInvalid
	}

	if spec.requireTransaction && strings.TrimSpace(spec.transaction) == "" {
		return nil, ErrTopUpStatusInvalid
	}

	baseQuota, err := topUpBaseQuota(&topUp)
	if err != nil {
		return nil, err
	}
	if baseQuota <= 0 {
		return nil, errors.New("无效的充值额度")
	}
	result.BaseQuota = baseQuota

	// Lock the user row before any consistent read below. Two concurrent first
	// top-ups for the same user serialize here, so only the one that gets the
	// lock first can observe "no previous real top-up".
	//
	// The order matters on MySQL: the locking reads above read the latest row
	// versions without opening a consistent read view, so the first plain SELECT
	// below opens its view *after* the user lock was granted. That view therefore
	// includes the settlement that held the lock before. On PostgreSQL a stale
	// repeatable-read view cannot slip through either: its UPDATE of the
	// concurrently modified user row fails with a serialization error and the
	// whole settlement rolls back for the gateway to retry.
	var user User
	if err := lockForUpdate(tx).Where("id = ?", topUp.UserId).First(&user).Error; err != nil {
		// The paid order cannot be honoured without its account: roll the whole
		// settlement back so the order stays pending and the gateway can retry.
		return nil, ErrTopUpUserMissing
	}

	// A gateway transaction id may credit exactly one order. Reusing it on a
	// different pending order is a replay attempt, not a second payment.
	if spec.transaction != "" {
		var dupCount int64
		dupQuery := tx.Model(&TopUp{}).Where("transaction_id = ?", spec.transaction)
		if topUp.Id > 0 {
			dupQuery = dupQuery.Where("id <> ?", topUp.Id)
		}
		if err := dupQuery.Count(&dupCount).Error; err != nil {
			return nil, err
		}
		if dupCount > 0 {
			return nil, ErrTopUpStatusInvalid
		}
	}

	bonusQuota, err := firstTopUpBonusQuotaTx(tx, &topUp)
	if err != nil {
		return nil, err
	}
	creditedQuota, err := sumTopUpQuota(baseQuota, bonusQuota)
	if err != nil {
		return nil, err
	}
	// The quota columns are 32-bit, so a credit that cannot be represented must
	// fail the settlement instead of saturating or wrapping.
	if user.Quota > 0 && user.Quota > common.MaxQuota-creditedQuota {
		return nil, fmt.Errorf("用户剩余额度 %d 加上本次充值 %d 超出额度上限 %d", user.Quota, creditedQuota, common.MaxQuota)
	}

	if spec.paymentMethod != "" {
		topUp.PaymentMethod = spec.paymentMethod
	}
	if spec.transaction != "" {
		topUp.TransactionId = spec.transaction
	}
	topUp.CompleteTime = common.GetTimestamp()
	topUp.Status = common.TopUpStatusSuccess
	topUp.BaseQuota = baseQuota
	topUp.BonusQuota = bonusQuota

	// Update exactly the columns settlement owns, guarded by the expected prior
	// status. A full-row Save would also rewrite transaction_id, which is empty
	// for most gateways and carries a unique index; the guard additionally turns
	// a raced status change into a rollback instead of a blind overwrite.
	orderUpdates := map[string]interface{}{
		"status":        common.TopUpStatusSuccess,
		"complete_time": topUp.CompleteTime,
		"base_quota":    baseQuota,
		"bonus_quota":   bonusQuota,
	}
	if spec.transaction != "" {
		orderUpdates["transaction_id"] = spec.transaction
	}
	if spec.paymentMethod != "" {
		orderUpdates["payment_method"] = spec.paymentMethod
	}
	orderRes := tx.Model(&TopUp{}).
		Where("id = ? AND status = ?", topUp.Id, common.TopUpStatusPending).
		Updates(orderUpdates)
	if orderRes.Error != nil {
		return nil, orderRes.Error
	}
	if orderRes.RowsAffected != 1 {
		return nil, ErrTopUpStatusInvalid
	}

	userUpdates := map[string]interface{}{
		"quota": gorm.Expr("quota + ?", creditedQuota),
	}
	for column, value := range spec.userFields {
		userUpdates[column] = value
	}
	if spec.payerEmail != "" && user.Email == "" {
		userUpdates["email"] = spec.payerEmail
	}
	res := tx.Model(&User{}).Where("id = ?", topUp.UserId).Updates(userUpdates)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected != 1 {
		return nil, fmt.Errorf("用户额度更新未命中任何行: user_id=%d", topUp.UserId)
	}

	result.PaymentMethod = topUp.PaymentMethod
	result.BonusQuota = bonusQuota
	result.CreditedQuota = creditedQuota
	result.FirstTopUpBonus = bonusQuota > 0
	result.Credited = true
	return result, nil
}

// firstTopUpBonusQuotaTx returns the first top-up bonus to grant for the order
// being settled, or 0.
//
// It must run while the caller holds the user row lock. The history probe
// deliberately ignores the 30 day window the top-up list pages apply, because an
// older real payment still consumes the qualification, and it counts only the
// whitelisted paid providers, so balance purchases, subscription settlement,
// redemption codes, invitation rewards, check-ins and admin quota edits can
// neither grant nor consume the bonus.
func firstTopUpBonusQuotaTx(tx *gorm.DB, topUp *TopUp) (int, error) {
	bonus := common.QuotaForFirstTopUp
	if bonus == 0 {
		// The promotion is off. The order still settles as a real top-up and so
		// still consumes the user's one first top-up qualification: turning the
		// promotion on later must not pay out for an earlier payment.
		return 0, nil
	}
	if bonus < 0 || bonus > common.MaxQuota {
		// Out of range is a configuration error, not a bonus size. Fail the
		// settlement so nothing is credited at a saturated value.
		return 0, fmt.Errorf("首次充值赠送配额 %d 超出允许范围 0..%d", bonus, common.MaxQuota)
	}
	if !slices.Contains(realTopUpProviders, topUp.PaymentProvider) {
		// A row whose provider is not a whitelisted real payment channel is
		// never eligible for the promotion by itself. The legacy unassigned
		// shape (provider="" + Amount>0) is the only exception and is checked
		// here so the eligibility decision stays in one place.
		if !(topUp.PaymentProvider == "" && topUp.Amount > 0) {
			return 0, nil
		}
	}

	var priorCount int64
	if err := tx.Model(&TopUp{}).
		Where(
			"user_id = ? AND id <> ? AND status IN ? AND "+firstTopUpHistoryPredicate,
			topUp.UserId, topUp.Id, firstTopUpHistoryStatuses, realTopUpProviders,
		).
		Count(&priorCount).Error; err != nil {
		return 0, err
	}
	if priorCount > 0 {
		return 0, nil
	}
	return bonus, nil
}

// topUpBaseQuota converts a locked order into the quota its payment buys.
//
//   - Stripe and PayPal credit Money x QuotaPerUnit. The product is computed
//     in float64 and then truncated with common.QuotaFromFloatStrict: this
//     preserves the float64 truncation the Stripe checkout and the original
//     PayPal settlement used (int(8.03 * 500000) == 4_014_999) and fails
//     closed when the result would not fit in the 32-bit quota column.
//   - Creem stores the purchased quota directly in Amount.
//   - epay, Waffo and Waffo Pancake credit Amount x QuotaPerUnit, computed
//     in decimal to avoid float drift on small dollar amounts.
//   - A legacy unassigned row (payment_provider="", Amount>0) is settled the
//     same way as epay/Waffo: the Amount field was the dollar value, and
//     before the audit field existed that was always multiplied by
//     QuotaPerUnit. Subscription/balance rows (Amount==0) are not real
//     top-ups and never reach this function via the admin completion path.
func topUpBaseQuota(topUp *TopUp) (int, error) {
	switch topUp.PaymentProvider {
	case PaymentProviderStripe, PaymentProviderPayPal:
		return common.QuotaFromFloatStrict(topUp.Money * common.QuotaPerUnit)
	case PaymentProviderCreem:
		return common.QuotaFromDecimalStrict(decimal.NewFromInt(topUp.Amount))
	default:
		return quotaFromDecimalProduct(decimal.NewFromInt(topUp.Amount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
	}
}

func quotaFromDecimalProduct(d decimal.Decimal) (int, error) {
	quota, err := common.QuotaFromDecimalStrict(d.Truncate(0))
	if err != nil {
		return 0, err
	}
	if quota < 0 {
		return 0, fmt.Errorf("充值额度不能为负数: %d", quota)
	}
	return quota, nil
}

// sumTopUpQuota adds the first top-up bonus to the paid quota, failing closed
// when the total leaves the quota range the database can store. A saturated or
// wrapped total would silently mint or destroy quota, so the caller rolls back.
func sumTopUpQuota(baseQuota int, bonusQuota int) (int, error) {
	if baseQuota < 0 || bonusQuota < 0 {
		return 0, fmt.Errorf("充值额度不能为负数: base=%d bonus=%d", baseQuota, bonusQuota)
	}
	if bonusQuota > common.MaxQuota || baseQuota > common.MaxQuota-bonusQuota {
		return 0, fmt.Errorf("充值额度 %d 加上首次充值赠送 %d 超出额度上限 %d", baseQuota, bonusQuota, common.MaxQuota)
	}
	return baseQuota + bonusQuota, nil
}
