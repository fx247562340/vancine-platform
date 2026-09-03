package model

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newSettlementTestOrder inserts an enabled user and a PayPal top-up that has
// already been captured (status=success, transaction_id=captureID), so a
// settlement event has a credited order to act on. Returns the top-up.
func newSettlementTestOrder(t *testing.T, tradeNo, captureID string, money float64, userID int) *TopUp {
	t.Helper()
	insertPayPalUserForTest(t, userID, 0)
	insertPendingPayPalTopUpForTest(t, tradeNo, userID, "ORDER-"+tradeNo, money)
	require.NoError(t, RechargePayPal(tradeNo, "", "", "127.0.0.1", captureID))
	topUp := GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, topUp)
	require.Equal(t, common.TopUpStatusSuccess, topUp.Status)
	return topUp
}

// baseSettlementInput returns a valid REFUNDED settlement input bound to the
// given order, with the configured USD currency. Individual tests override
// fields to exercise the failure paths.
func baseSettlementInput(topUp *TopUp, eventID, resourceID string) PayPalSettlementInput {
	return PayPalSettlementInput{
		EventID:          eventID,
		EventType:        PayPalSettlementRefunded,
		ResourceID:       resourceID,
		TradeNo:          topUp.TradeNo,
		CaptureID:        topUp.TransactionId,
		Amount:           fmt.Sprintf("%.2f", topUp.Money),
		Currency:         "USD",
		ExpectedCurrency: "USD",
	}
}

func TestApplyPayPalSettlement_FirstRefundDeductsOnceAndMarksRefunded(t *testing.T) {
	truncateTables(t)
	topUp := newSettlementTestOrder(t, "trade-set-001", "CAP-001", 9.99, 70)
	expectedQuota := int64(9.99 * common.QuotaPerUnit)
	require.Equal(t, int(expectedQuota), getPayPalUserQuotaForTest(t, 70))

	in := baseSettlementInput(topUp, "EVT-001", "REFUND-001")
	_, err := ApplyPayPalSettlement(in)
	require.NoError(t, err)

	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 70))
	assert.Equal(t, common.TopUpStatusRefunded, getPayPalTopUpStatusForTest(t, "trade-set-001"))

	count, err := CountPayPalSettlementEventsForOrder(topUp.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 1, count)
}

func TestApplyPayPalSettlement_FirstReversalDeductsOnceAndMarksRefunded(t *testing.T) {
	truncateTables(t)
	topUp := newSettlementTestOrder(t, "trade-set-002", "CAP-002", 9.99, 71)

	in := baseSettlementInput(topUp, "EVT-002", "CAP-002")
	in.EventType = PayPalSettlementReversed
	_, err := ApplyPayPalSettlement(in)
	require.NoError(t, err)

	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 71))
	assert.Equal(t, common.TopUpStatusRefunded, getPayPalTopUpStatusForTest(t, "trade-set-002"))
}

func TestApplyPayPalSettlement_EventIDReplayIsIdempotent(t *testing.T) {
	truncateTables(t)
	topUp := newSettlementTestOrder(t, "trade-set-003", "CAP-003", 9.99, 72)
	in := baseSettlementInput(topUp, "EVT-003", "REFUND-003")

	_, err := ApplyPayPalSettlement(in)
	require.NoError(t, err)
	// Replaying the same Event ID with identical content is a no-op.
	_, err = ApplyPayPalSettlement(in)
	require.NoError(t, err)
	_, err = ApplyPayPalSettlement(in)
	require.NoError(t, err)

	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 72))
	assert.Equal(t, common.TopUpStatusRefunded, getPayPalTopUpStatusForTest(t, "trade-set-003"))
	count, err := CountPayPalSettlementEventsForOrder(topUp.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 1, count, "ledger must hold exactly one row across replays")
}

func TestApplyPayPalSettlement_ResourceKeyReplayDifferentEventIDIsIdempotent(t *testing.T) {
	truncateTables(t)
	topUp := newSettlementTestOrder(t, "trade-set-004", "CAP-004", 9.99, 73)

	first := baseSettlementInput(topUp, "EVT-004A", "REFUND-004")
	_, err := ApplyPayPalSettlement(first)
	require.NoError(t, err)

	// Same Resource Key (same refund id), different Event ID, identical content.
	second := baseSettlementInput(topUp, "EVT-004B", "REFUND-004")
	_, err = ApplyPayPalSettlement(second)
	require.NoError(t, err)

	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 73))
	count, err := CountPayPalSettlementEventsForOrder(topUp.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 1, count, "identical content under the same resource key must not duplicate the ledger row")
}

func TestApplyPayPalSettlement_ResourceIDReusedWithDifferentContentHardFails(t *testing.T) {
	truncateTables(t)
	topUp := newSettlementTestOrder(t, "trade-set-005", "CAP-005", 9.99, 74)

	first := baseSettlementInput(topUp, "EVT-005A", "REFUND-005")
	_, err := ApplyPayPalSettlement(first)
	require.NoError(t, err)

	// Same Resource Key, different Event ID, but a different amount. The order
	// validation rejects the mismatched amount fail-closed before the ledger
	// conflict check runs; the cross-order Conflict path is covered separately.
	// Either way the replay must NOT silently succeed or duplicate the ledger.
	second := baseSettlementInput(topUp, "EVT-005B", "REFUND-005")
	second.Amount = "5.00"
	_, err = ApplyPayPalSettlement(second)
	require.Error(t, err)

	// Quota and ledger unchanged by the rejected second event.
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 74))
	count, err := CountPayPalSettlementEventsForOrder(topUp.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 1, count)
}

func TestApplyPayPalSettlement_EventIDReusedAcrossOrdersHardFails(t *testing.T) {
	truncateTables(t)
	topUpA := newSettlementTestOrder(t, "trade-set-006a", "CAP-006A", 9.99, 75)
	topUpB := newSettlementTestOrder(t, "trade-set-006b", "CAP-006B", 9.99, 76)

	inA := baseSettlementInput(topUpA, "EVT-REUSED", "REFUND-006A")
	_, err := ApplyPayPalSettlement(inA)
	require.NoError(t, err)

	// The same Event ID pointing at a different order/content must hard fail.
	inB := baseSettlementInput(topUpB, "EVT-REUSED", "REFUND-006B")
	_, err = ApplyPayPalSettlement(inB)

	require.ErrorIs(t, err, ErrPayPalSettlementConflict)

	// Order B is untouched.
	assert.Equal(t, int64(9.99*common.QuotaPerUnit), int64(getPayPalUserQuotaForTest(t, 76)))
	assert.Equal(t, common.TopUpStatusSuccess, getPayPalTopUpStatusForTest(t, "trade-set-006b"))
}

func TestApplyPayPalSettlement_CrossOrderResourceIDConflictHardFails(t *testing.T) {
	truncateTables(t)
	topUpA := newSettlementTestOrder(t, "trade-set-007a", "CAP-007", 9.99, 77)
	topUpB := newSettlementTestOrder(t, "trade-set-007b", "CAP-007B", 9.99, 78)

	// Refund REFUND-007 settled against order A.
	inA := baseSettlementInput(topUpA, "EVT-007A", "REFUND-007")
	_, err := ApplyPayPalSettlement(inA)
	require.NoError(t, err)

	// The same refund Resource Key pointed at order B (different order) must fail.
	inB := baseSettlementInput(topUpB, "EVT-007B", "REFUND-007")
	_, err = ApplyPayPalSettlement(inB)

	require.ErrorIs(t, err, ErrPayPalSettlementConflict)
	assert.Equal(t, common.TopUpStatusSuccess, getPayPalTopUpStatusForTest(t, "trade-set-007b"))
}

func TestApplyPayPalSettlement_CaptureAmountCurrencyProviderMismatchesFail(t *testing.T) {
	truncateTables(t)

	t.Run("capture id mismatch", func(t *testing.T) {
		truncateTables(t)
		topUp := newSettlementTestOrder(t, "trade-set-008c", "CAP-008C", 9.99, 80)
		in := baseSettlementInput(topUp, "EVT-008C", "REFUND-008C")
		in.CaptureID = "CAP-OTHER"
		_, err := ApplyPayPalSettlement(in)
		require.ErrorIs(t, err, ErrPayPalSettlementNotApplicable)
		assert.Equal(t, int64(9.99*common.QuotaPerUnit), int64(getPayPalUserQuotaForTest(t, 80)))
	})

	t.Run("amount mismatch", func(t *testing.T) {
		truncateTables(t)
		topUp := newSettlementTestOrder(t, "trade-set-008a", "CAP-008A", 9.99, 81)
		in := baseSettlementInput(topUp, "EVT-008A", "REFUND-008A")
		in.Amount = "5.00"
		_, err := ApplyPayPalSettlement(in)
		require.ErrorIs(t, err, ErrPayPalSettlementNotApplicable)
	})

	t.Run("currency mismatch", func(t *testing.T) {
		truncateTables(t)
		topUp := newSettlementTestOrder(t, "trade-set-008u", "CAP-008U", 9.99, 82)
		in := baseSettlementInput(topUp, "EVT-008U", "REFUND-008U")
		in.Currency = "EUR"
		_, err := ApplyPayPalSettlement(in)
		require.ErrorIs(t, err, ErrPayPalSettlementNotApplicable)
	})

	t.Run("non-paypal provider", func(t *testing.T) {
		truncateTables(t)
		insertPayPalUserForTest(t, 83, 0)
		insertPendingTopUpForTestWithProvider(t, "trade-set-008p", 83, "ORDER-008P", 9.99, PaymentProviderStripe)
		// Credit the Stripe order so its status is success and it has a transaction id.
		stripeTopUp := GetTopUpByTradeNo("trade-set-008p")
		require.NotNil(t, stripeTopUp)
		// Directly flip the stripe order to success with a transaction id without
		// going through RechargePayPal (which would reject the provider).
		require.NoError(t, DB.Model(&TopUp{}).Where("id = ?", stripeTopUp.Id).Updates(map[string]interface{}{
			"status":         common.TopUpStatusSuccess,
			"transaction_id": "CAP-008P",
			"complete_time":  time.Now().Unix(),
		}).Error)
		in := PayPalSettlementInput{
			EventID: "EVT-008P", EventType: PayPalSettlementRefunded, ResourceID: "REFUND-008P",
			TradeNo: "trade-set-008p", CaptureID: "CAP-008P", Amount: "9.99",
			Currency: "USD", ExpectedCurrency: "USD",
		}
		_, err := ApplyPayPalSettlement(in)
		require.ErrorIs(t, err, ErrPayPalSettlementNotApplicable)
	})
}

func TestApplyPayPalSettlement_InvalidInputFails(t *testing.T) {
	truncateTables(t)
	topUp := newSettlementTestOrder(t, "trade-set-009", "CAP-009", 9.99, 84)

	cases := []struct {
		name string
		mut  func(in PayPalSettlementInput) PayPalSettlementInput
	}{
		{"empty event id", func(in PayPalSettlementInput) PayPalSettlementInput { in.EventID = ""; return in }},
		{"empty resource id", func(in PayPalSettlementInput) PayPalSettlementInput { in.ResourceID = ""; return in }},
		{"empty trade no", func(in PayPalSettlementInput) PayPalSettlementInput { in.TradeNo = ""; return in }},
		{"empty capture id", func(in PayPalSettlementInput) PayPalSettlementInput { in.CaptureID = ""; return in }},
		{"empty currency", func(in PayPalSettlementInput) PayPalSettlementInput { in.Currency = ""; return in }},
		{"empty expected currency", func(in PayPalSettlementInput) PayPalSettlementInput { in.ExpectedCurrency = ""; return in }},
		{"invalid amount", func(in PayPalSettlementInput) PayPalSettlementInput { in.Amount = "not-a-number"; return in }},
		{"zero amount", func(in PayPalSettlementInput) PayPalSettlementInput { in.Amount = "0.00"; return in }},
		{"negative amount", func(in PayPalSettlementInput) PayPalSettlementInput { in.Amount = "-1.00"; return in }},
		{"unsupported event type", func(in PayPalSettlementInput) PayPalSettlementInput {
			in.EventType = "CUSTOMER.DISPUTE.CREATED"
			return in
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := tc.mut(baseSettlementInput(topUp, "EVT-009", "REFUND-009"))
			_, err := ApplyPayPalSettlement(in)

			require.ErrorIs(t, err, ErrPayPalSettlementInvalid, "input %s", tc.name)
		})
	}
}

func TestApplyPayPalSettlement_IllegalStatusFails(t *testing.T) {
	truncateTables(t)
	// Pending order (never captured) cannot be settled.
	insertPayPalUserForTest(t, 85, 0)
	insertPendingPayPalTopUpForTest(t, "trade-set-010", 85, "ORDER-010", 9.99)
	topUp := GetTopUpByTradeNo("trade-set-010")
	require.NotNil(t, topUp)
	// Pending order has no transaction id, so CaptureID mismatch is the first
	// applicable failure: pass a non-empty capture id to reach the status guard
	// path via the empty-transaction-id branch.
	in := PayPalSettlementInput{
		EventID: "EVT-010", EventType: PayPalSettlementRefunded, ResourceID: "REFUND-010",
		TradeNo: "trade-set-010", CaptureID: "CAP-010", Amount: "9.99",
		Currency: "USD", ExpectedCurrency: "USD",
	}
	_, err := ApplyPayPalSettlement(in)

	require.ErrorIs(t, err, ErrPayPalSettlementNotApplicable)
	assert.Equal(t, common.TopUpStatusPending, getPayPalTopUpStatusForTest(t, "trade-set-010"))
}

func TestApplyPayPalSettlement_OrderNotFoundFails(t *testing.T) {
	truncateTables(t)
	in := PayPalSettlementInput{
		EventID: "EVT-011", EventType: PayPalSettlementRefunded, ResourceID: "REFUND-011",
		TradeNo: "trade-does-not-exist", CaptureID: "CAP-011", Amount: "9.99",
		Currency: "USD", ExpectedCurrency: "USD",
	}
	_, err := ApplyPayPalSettlement(in)
	require.ErrorIs(t, err, ErrPayPalSettlementNotApplicable)
}

func TestApplyPayPalSettlement_RefundThenReversalRecordsBothDeductsOnce(t *testing.T) {
	truncateTables(t)
	topUp := newSettlementTestOrder(t, "trade-set-012", "CAP-012", 9.99, 86)
	expectedQuota := int64(9.99 * common.QuotaPerUnit)
	require.Equal(t, int(expectedQuota), getPayPalUserQuotaForTest(t, 86))

	refund := baseSettlementInput(topUp, "EVT-012R", "REFUND-012")
	_, err := ApplyPayPalSettlement(refund)
	require.NoError(t, err)

	reversal := baseSettlementInput(topUp, "EVT-012V", "CAP-012")
	reversal.EventType = PayPalSettlementReversed
	_, err = ApplyPayPalSettlement(reversal)
	require.NoError(t, err)

	// Quota deducted exactly once; order refunded.
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 86))
	assert.Equal(t, common.TopUpStatusRefunded, getPayPalTopUpStatusForTest(t, "trade-set-012"))
	// Both events recorded: distinct resource keys (refund id vs capture id).
	count, err := CountPayPalSettlementEventsForOrder(topUp.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 2, count)
}

func TestApplyPayPalSettlement_ReversalThenRefundRecordsBothDeductsOnce(t *testing.T) {
	truncateTables(t)
	topUp := newSettlementTestOrder(t, "trade-set-013", "CAP-013", 9.99, 87)

	reversal := baseSettlementInput(topUp, "EVT-013V", "CAP-013")
	reversal.EventType = PayPalSettlementReversed
	_, err := ApplyPayPalSettlement(reversal)
	require.NoError(t, err)

	refund := baseSettlementInput(topUp, "EVT-013R", "REFUND-013")
	_, err = ApplyPayPalSettlement(refund)
	require.NoError(t, err)

	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 87))
	count, err := CountPayPalSettlementEventsForOrder(topUp.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 2, count)
}

func TestApplyPayPalSettlement_ConcurrentSameEventDeductsOnce(t *testing.T) {
	truncateTables(t)
	topUp := newSettlementTestOrder(t, "trade-set-014", "CAP-014", 9.99, 88)

	const goroutines = 8
	var wg sync.WaitGroup
	wg.Add(goroutines)
	errs := make([]error, goroutines)
	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			defer wg.Done()
			in := baseSettlementInput(topUp, "EVT-014", "REFUND-014")
			_, errs[idx] = ApplyPayPalSettlement(in)

		}(i)
	}
	wg.Wait()

	// At least one delivery succeeded; the rest either idempotently no-op'd or
	// hit the unique index and failed. Either way, quota is deducted exactly once.
	successes := 0
	for _, e := range errs {
		if e == nil {
			successes++
		}
	}
	require.GreaterOrEqual(t, successes, 1)

	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 88), "quota must be deducted exactly once under concurrency")
	assert.Equal(t, common.TopUpStatusRefunded, getPayPalTopUpStatusForTest(t, "trade-set-014"))
	count, err := CountPayPalSettlementEventsForOrder(topUp.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 1, count, "exactly one ledger row must survive concurrent same-event delivery")
}

func TestPayPalSettlementEvent_UniqueIndexesExist(t *testing.T) {
	truncateTables(t)
	// The Event ID unique index rejects a second row with the same event id even
	// when inserted directly (bypassing ApplyPayPalSettlement), proving the DB
	// schema - not just application logic - enforces idempotency.
	row1 := &PayPalSettlementEvent{
		EventID: "EVT-UNIQ", EventType: PayPalSettlementRefunded, ResourceID: "REFUND-UNIQ",
		ResourceKey: resourceKeyFor(PayPalSettlementRefunded, "REFUND-UNIQ"),
		TopUpID:     1, TradeNo: "t1", CaptureID: "c1", Amount: "9.99", Currency: "USD",
		CreateTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(row1).Error)

	dupEvent := &PayPalSettlementEvent{
		EventID: "EVT-UNIQ", EventType: PayPalSettlementRefunded, ResourceID: "REFUND-OTHER",
		ResourceKey: resourceKeyFor(PayPalSettlementRefunded, "REFUND-OTHER"),
		TopUpID:     2, TradeNo: "t2", CaptureID: "c2", Amount: "9.99", Currency: "USD",
		CreateTime: common.GetTimestamp(),
	}
	require.Error(t, DB.Create(dupEvent).Error, "event_id must be unique")

	dupKey := &PayPalSettlementEvent{
		EventID: "EVT-UNIQ-2", EventType: PayPalSettlementRefunded, ResourceID: "REFUND-UNIQ",
		ResourceKey: resourceKeyFor(PayPalSettlementRefunded, "REFUND-UNIQ"),
		TopUpID:     2, TradeNo: "t2", CaptureID: "c2", Amount: "9.99", Currency: "USD",
		CreateTime: common.GetTimestamp(),
	}
	require.Error(t, DB.Create(dupKey).Error, "resource_key must be unique")

	// A refund and a reversal sharing the same raw resource id are allowed
	// because the event_type prefix separates their resource keys.
	cross := &PayPalSettlementEvent{
		EventID: "EVT-CROSS", EventType: PayPalSettlementReversed, ResourceID: "REFUND-UNIQ",
		ResourceKey: resourceKeyFor(PayPalSettlementReversed, "REFUND-UNIQ"),
		TopUpID:     1, TradeNo: "t1", CaptureID: "c1", Amount: "9.99", Currency: "USD",
		CreateTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(cross).Error, "refund and reversal keys must not collide")
}

func TestApplyPayPalSettlement_MissingUserRollsBackFully(t *testing.T) {
	truncateTables(t)
	topUp := newSettlementTestOrder(t, "trade-set-015", "CAP-015", 9.99, 89)
	expectedQuota := int64(9.99 * common.QuotaPerUnit)
	require.Equal(t, int(expectedQuota), getPayPalUserQuotaForTest(t, 89))

	// Remove the user row entirely so the quota UPDATE matches zero rows. This
	// is the atomicity gap: a rows-affected-blind update would still commit the
	// ledger row and flip the order to refunded.
	require.NoError(t, DB.Unscoped().Where("id = ?", 89).Delete(&User{}).Error)

	in := baseSettlementInput(topUp, "EVT-015", "REFUND-015")
	_, err := ApplyPayPalSettlement(in)

	require.Error(t, err, "settlement must fail when the user row is missing")

	// Order must remain success and the ledger must be empty: the whole
	// transaction, including the ledger insert, must roll back - no partial state.
	assert.Equal(t, common.TopUpStatusSuccess, getPayPalTopUpStatusForTest(t, "trade-set-015"))
	count, err := CountPayPalSettlementEventsForOrder(topUp.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 0, count, "ledger must be empty after rollback")
}

func TestApplyPayPalSettlement_NonSuccessStatusWithValidCaptureRollsBack(t *testing.T) {
	truncateTables(t)
	topUp := newSettlementTestOrder(t, "trade-set-016", "CAP-016", 9.99, 90)
	require.Equal(t, int64(9.99*common.QuotaPerUnit), int64(getPayPalUserQuotaForTest(t, 90)))

	// Flip the credited order to a non-terminal status while keeping its captured
	// transaction id, so the event passes every binding check and reaches the
	// status gate. The gate must reject without writing the ledger or touching quota.
	require.NoError(t, DB.Model(&TopUp{}).Where("id = ?", topUp.Id).Update("status", common.TopUpStatusExpired).Error)
	require.Equal(t, common.TopUpStatusExpired, getPayPalTopUpStatusForTest(t, "trade-set-016"))

	in := baseSettlementInput(topUp, "EVT-016", "REFUND-016")
	_, err := ApplyPayPalSettlement(in)

	require.ErrorIs(t, err, ErrPayPalSettlementNotApplicable)

	assert.Equal(t, common.TopUpStatusExpired, getPayPalTopUpStatusForTest(t, "trade-set-016"))
	assert.Equal(t, int64(9.99*common.QuotaPerUnit), int64(getPayPalUserQuotaForTest(t, 90)), "quota must not change")
	count, err := CountPayPalSettlementEventsForOrder(topUp.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 0, count, "ledger must be empty when the status gate rejects")
}
