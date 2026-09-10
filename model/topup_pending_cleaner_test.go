package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The Vancine pending cleaner expires stale pending PayPal AND stale
// pending Waffo Pancake orders. Every other settlement state machine
// (Stripe, Creem, EPay, plain Waffo, and subscription top-up rows with an
// empty payment_provider) belongs to its own upstream flow and must stay
// pending under identical conditions. Success, refunded and already-expired
// terminal rows are never affected, regardless of provider.
func TestCleanExpiredPendingTopUpsCoversPayPalAndWaffoPancake(t *testing.T) {
	oldCreate := common.GetTimestamp() - int64(72*time.Hour/time.Second)
	maxAge := 1 * time.Hour
	now := common.GetTimestamp()

	type fixture struct {
		tradeNo        string
		provider       string
		status         string
		completeTime   int64
		expectStatus   string
		countsTowards  bool // contributes to the expected RowsAffected when expired
		expectTerminal bool // must be left untouched in its terminal state
	}

	// 1. Stale PayPal (2 rows) — both must expire and count towards RowsAffected.
	// 2. Stale Waffo Pancake (1 row) — must expire and count.
	// 3. Stale other providers — must stay pending.
	// 4. Fresh PayPal / Waffo Pancake — must stay pending.
	// 5. Terminal rows (success, refunded, already-expired) for PayPal and
	//    Waffo Pancake — must keep their original status, none count.
	fixtures := []fixture{
		{tradeNo: "cleaner-stale-paypal-a", provider: PaymentProviderPayPal,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusExpired, countsTowards: true},
		{tradeNo: "cleaner-stale-paypal-b", provider: PaymentProviderPayPal,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusExpired, countsTowards: true},
		{tradeNo: "cleaner-stale-waffo-pancake", provider: PaymentProviderWaffoPancake,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusExpired, countsTowards: true},

		{tradeNo: "cleaner-stale-stripe", provider: PaymentProviderStripe,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusPending},
		{tradeNo: "cleaner-stale-creem", provider: PaymentProviderCreem,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusPending},
		{tradeNo: "cleaner-stale-epay", provider: PaymentProviderEpay,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusPending},
		{tradeNo: "cleaner-stale-waffo", provider: PaymentProviderWaffo,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusPending},
		{tradeNo: "cleaner-stale-empty-provider", provider: "",
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusPending},

		{tradeNo: "cleaner-fresh-paypal", provider: PaymentProviderPayPal,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusPending},
		{tradeNo: "cleaner-fresh-waffo-pancake", provider: PaymentProviderWaffoPancake,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusPending},

		{tradeNo: "cleaner-paypal-success", provider: PaymentProviderPayPal,
			status: common.TopUpStatusSuccess, completeTime: oldCreate, expectStatus: common.TopUpStatusSuccess, expectTerminal: true},
		{tradeNo: "cleaner-paypal-refunded", provider: PaymentProviderPayPal,
			status: common.TopUpStatusRefunded, completeTime: oldCreate, expectStatus: common.TopUpStatusRefunded, expectTerminal: true},
		{tradeNo: "cleaner-paypal-already-expired", provider: PaymentProviderPayPal,
			status: common.TopUpStatusExpired, completeTime: oldCreate, expectStatus: common.TopUpStatusExpired, expectTerminal: true},
		{tradeNo: "cleaner-waffo-pancake-success", provider: PaymentProviderWaffoPancake,
			status: common.TopUpStatusSuccess, completeTime: oldCreate, expectStatus: common.TopUpStatusSuccess, expectTerminal: true},
		{tradeNo: "cleaner-waffo-pancake-refunded", provider: PaymentProviderWaffoPancake,
			status: common.TopUpStatusRefunded, completeTime: oldCreate, expectStatus: common.TopUpStatusRefunded, expectTerminal: true},
		{tradeNo: "cleaner-waffo-pancake-already-expired", provider: PaymentProviderWaffoPancake,
			status: common.TopUpStatusExpired, completeTime: oldCreate, expectStatus: common.TopUpStatusExpired, expectTerminal: true},
	}

	for i, f := range fixtures {
		createTime := oldCreate
		if !f.expectTerminal {
			// "Fresh" rows are seeded one hour in the future so no plausible
			// (now - maxAge) cutoff the cleaner could compute will reach
			// them, regardless of clock drift inside the test.
			if f.tradeNo == "cleaner-fresh-paypal" || f.tradeNo == "cleaner-fresh-waffo-pancake" {
				createTime = now + int64(maxAge/time.Second)
			}
		}
		topUp := &TopUp{
			UserId:          9300 + i,
			Amount:          1,
			Money:           10.00,
			TradeNo:         f.tradeNo,
			PaymentMethod:   f.provider,
			PaymentProvider: f.provider,
			Status:          f.status,
			CreateTime:      createTime,
			CompleteTime:    f.completeTime,
		}
		require.NoError(t, DB.Create(topUp).Error, "seed %s", f.tradeNo)
	}

	expectedExpired := int64(0)
	for _, f := range fixtures {
		if f.countsTowards {
			expectedExpired++
		}
	}

	expired := CleanExpiredPendingTopUps(maxAge)
	assert.Equal(t, expectedExpired, expired,
		"RowsAffected must equal the actual count of stale PayPal + stale Waffo Pancake orders")

	statusOf := func(tradeNo string) string {
		var topUp TopUp
		require.NoError(t, DB.Where("trade_no = ?", tradeNo).First(&topUp).Error,
			"order %s must still exist after the cleaner run", tradeNo)
		return topUp.Status
	}

	for _, f := range fixtures {
		assert.Equal(t, f.expectStatus, statusOf(f.tradeNo),
			"order %s (provider=%q, seeded status=%q) must end up as %q",
			f.tradeNo, f.provider, f.status, f.expectStatus)
	}
}
