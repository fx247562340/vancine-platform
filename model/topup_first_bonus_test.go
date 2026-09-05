package model

import (
	"fmt"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// First top-up bonus contract tests.
//
// The matrix enumerates every real online wallet top-up channel in the
// repository (EPay/WeChat, Stripe, Creem, PayPal, Waffo, Waffo Pancake) and
// proves for each one that its upstream settlement transaction grants the
// bonus exactly once, persists BaseQuota/BonusQuota on the order, and never
// grants the bonus to a user who already completed a real top-up. Redemption
// codes, admin quota grants, invitation rewards and subscription purchases
// never create these provider rows and therefore never trigger the bonus.

func setFirstTopUpBonusForTest(t *testing.T, quota int) {
	t.Helper()
	old := common.QuotaForFirstTopUp
	common.QuotaForFirstTopUp = quota
	t.Cleanup(func() { common.QuotaForFirstTopUp = old })
}

func setQuotaPerUnitForTest(t *testing.T, perUnit float64) {
	t.Helper()
	old := common.QuotaPerUnit
	common.QuotaPerUnit = perUnit
	t.Cleanup(func() { common.QuotaPerUnit = old })
}

func insertFirstBonusUserForTest(t *testing.T, id int) {
	t.Helper()
	insertPayPalUserForTest(t, id, 0)
}

// insertPendingProviderTopUpForTest creates a pending order for any real
// provider. Amount is the dollar quantity for providers that multiply by
// QuotaPerUnit; Creem treats it as the credited quota directly.
func insertPendingProviderTopUpForTest(t *testing.T, tradeNo string, userID int, provider string, amount int64, money float64) *TopUp {
	t.Helper()
	topUp := &TopUp{
		UserId:          userID,
		Amount:          amount,
		Money:           money,
		TradeNo:         tradeNo,
		PaymentMethod:   provider,
		PaymentProvider: provider,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	require.NoError(t, topUp.Insert())
	return topUp
}

func requireUserQuota(t *testing.T, userID int, expected int) {
	t.Helper()
	assert.Equal(t, expected, getPayPalUserQuotaForTest(t, userID), "user %d wallet quota", userID)
}

func requireTopUpQuotaFields(t *testing.T, tradeNo string, baseQuota int, bonusQuota int) {
	t.Helper()
	topUp := GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, topUp, "order %s must exist", tradeNo)
	assert.Equal(t, baseQuota, topUp.BaseQuota, "order %s BaseQuota", tradeNo)
	assert.Equal(t, bonusQuota, topUp.BonusQuota, "order %s BonusQuota", tradeNo)
}

// settleProviderTopUp drives the channel's own upstream settlement entry
// point. PayPal needs a capture id; every other channel settles by trade no.
func settleProviderTopUp(t *testing.T, provider string, tradeNo string, callerIp string) {
	t.Helper()
	switch provider {
	case PaymentProviderEpay:
		_, err := RechargeEpay(tradeNo, "", callerIp)
		require.NoError(t, err)
	case PaymentProviderStripe:
		require.NoError(t, Recharge(tradeNo, "cus_test", callerIp))
	case PaymentProviderCreem:
		require.NoError(t, RechargeCreem(tradeNo, "", "", callerIp))
	case PaymentProviderPayPal:
		require.NoError(t, RechargePayPal(tradeNo, "", "", callerIp, "CAPTURE-"+tradeNo))
	case PaymentProviderWaffo:
		require.NoError(t, RechargeWaffo(tradeNo, callerIp))
	case PaymentProviderWaffoPancake:
		require.NoError(t, RechargeWaffoPancake(tradeNo))
	default:
		t.Fatalf("no settlement entry point for provider %s", provider)
	}
}

// firstBonusChannelMatrix enumerates every real online top-up provider. A new
// payment channel added to the repository must be added here; the matrix test
// fails closed if a provider settles without granting (or while double
// granting) the first top-up bonus.
var firstBonusChannelMatrix = []struct {
	provider string
	amount   int64
	money    float64
	paid     int // credited quota with QuotaPerUnit = 1
}{
	{PaymentProviderEpay, 2, 2.0, 2},
	{PaymentProviderStripe, 2, 2.0, 2},
	{PaymentProviderCreem, 3, 3.0, 3},
	{PaymentProviderPayPal, 2, 4.0, 4},
	{PaymentProviderWaffo, 2, 2.0, 2},
	{PaymentProviderWaffoPancake, 2, 2.0, 2},
}

func TestFirstTopUpBonusGrantedOncePerChannel(t *testing.T) {
	const bonus = 100
	setFirstTopUpBonusForTest(t, bonus)
	setQuotaPerUnitForTest(t, 1)

	for i, channel := range firstBonusChannelMatrix {
		t.Run(channel.provider, func(t *testing.T) {
			truncateTables(t)
			userID := 9100 + i
			insertFirstBonusUserForTest(t, userID)
			first := fmt.Sprintf("bonus-first-%s", channel.provider)
			insertPendingProviderTopUpForTest(t, first, userID, channel.provider, channel.amount, channel.money)

			settleProviderTopUp(t, channel.provider, first, "127.0.0.1")

			requireUserQuota(t, userID, channel.paid+bonus)
			requireTopUpQuotaFields(t, first, channel.paid, bonus)

			// Second real top-up of the same user: paid quota only, never a
			// second bonus.
			second := fmt.Sprintf("bonus-second-%s", channel.provider)
			insertPendingProviderTopUpForTest(t, second, userID, channel.provider, channel.amount, channel.money)

			settleProviderTopUp(t, channel.provider, second, "127.0.0.1")

			requireUserQuota(t, userID, channel.paid*2+bonus)
			requireTopUpQuotaFields(t, second, channel.paid, 0)
		})
	}
}

func TestFirstTopUpBonusInactiveWhenMisconfigured(t *testing.T) {
	setQuotaPerUnitForTest(t, 1)

	for _, quota := range []int{0, -5, common.MaxWalletQuota + 1} {
		t.Run(fmt.Sprintf("quota-%d", quota), func(t *testing.T) {
			setFirstTopUpBonusForTest(t, quota)
			truncateTables(t)
			insertFirstBonusUserForTest(t, 9201)
			insertPendingProviderTopUpForTest(t, "bonus-inactive", 9201, PaymentProviderEpay, 2, 2.0)

			_, err := RechargeEpay("bonus-inactive", "", "127.0.0.1")
			require.NoError(t, err)

			requireUserQuota(t, 9201, 2)
			requireTopUpQuotaFields(t, "bonus-inactive", 2, 0)
		})
	}
}

func TestFirstTopUpBonusEligibilityPredicate(t *testing.T) {
	setQuotaPerUnitForTest(t, 1)

	t.Run("invalid user id", func(t *testing.T) {
		for _, id := range []int{0, -1} {
			completed, err := UserHasCompletedFirstTopUp(id)
			require.Error(t, err)
			assert.False(t, completed)
		}
	})

	t.Run("no history", func(t *testing.T) {
		truncateTables(t)
		insertFirstBonusUserForTest(t, 9301)
		completed, err := UserHasCompletedFirstTopUp(9301)
		require.NoError(t, err)
		assert.False(t, completed)
	})

	t.Run("success consumes qualification", func(t *testing.T) {
		truncateTables(t)
		insertFirstBonusUserForTest(t, 9302)
		order := insertPendingProviderTopUpForTest(t, "elig-success", 9302, PaymentProviderEpay, 1, 1.0)
		order.Status = common.TopUpStatusSuccess
		require.NoError(t, DB.Save(order).Error)
		completed, err := UserHasCompletedFirstTopUp(9302)
		require.NoError(t, err)
		assert.True(t, completed)
	})

	t.Run("refunded still consumes qualification", func(t *testing.T) {
		truncateTables(t)
		insertFirstBonusUserForTest(t, 9303)
		order := insertPendingProviderTopUpForTest(t, "elig-refunded", 9303, PaymentProviderStripe, 1, 1.0)
		order.Status = common.TopUpStatusRefunded
		require.NoError(t, DB.Save(order).Error)
		completed, err := UserHasCompletedFirstTopUp(9303)
		require.NoError(t, err)
		assert.True(t, completed)
	})

	t.Run("pending and failed do not consume", func(t *testing.T) {
		truncateTables(t)
		insertFirstBonusUserForTest(t, 9304)
		insertPendingProviderTopUpForTest(t, "elig-pending", 9304, PaymentProviderEpay, 1, 1.0)
		failed := insertPendingProviderTopUpForTest(t, "elig-failed", 9304, PaymentProviderEpay, 1, 1.0)
		failed.Status = common.TopUpStatusFailed
		require.NoError(t, DB.Save(failed).Error)
		completed, err := UserHasCompletedFirstTopUp(9304)
		require.NoError(t, err)
		assert.False(t, completed)
	})

	t.Run("balance and non-real rows do not consume", func(t *testing.T) {
		truncateTables(t)
		insertFirstBonusUserForTest(t, 9305)
		balance := insertPendingProviderTopUpForTest(t, "elig-balance", 9305, PaymentProviderBalance, 0, 0.0)
		balance.Status = common.TopUpStatusSuccess
		require.NoError(t, DB.Save(balance).Error)
		completed, err := UserHasCompletedFirstTopUp(9305)
		require.NoError(t, err)
		assert.False(t, completed)
	})

	t.Run("legacy unassigned provider with amount counts", func(t *testing.T) {
		truncateTables(t)
		insertFirstBonusUserForTest(t, 9306)
		legacy := insertPendingProviderTopUpForTest(t, "elig-legacy", 9306, "", 5, 5.0)
		legacy.Status = common.TopUpStatusSuccess
		require.NoError(t, DB.Save(legacy).Error)
		completed, err := UserHasCompletedFirstTopUp(9306)
		require.NoError(t, err)
		assert.True(t, completed)
	})
}

func TestPayPalRefundClawsBackPaidAndBonusAndKeepsQualification(t *testing.T) {
	const bonus = 50
	setFirstTopUpBonusForTest(t, bonus)
	setQuotaPerUnitForTest(t, 1)
	truncateTables(t)

	insertFirstBonusUserForTest(t, 9401)
	order := insertPendingPayPalTopUpForTest(t, "refund-clawback", 9401, "PAYID-1", 7.0)

	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-CLAWBACK"))
	requireUserQuota(t, 9401, 7+bonus)
	requireTopUpQuotaFields(t, order.TradeNo, 7, bonus)

	// Full refund claws back paid + bonus.
	deducted, err := RefundPayPalTopUp(order.TradeNo, 7)
	require.NoError(t, err)
	assert.Equal(t, 7+bonus, deducted)
	requireUserQuota(t, 9401, 0)

	// The refunded order still consumes the first top-up qualification.
	completed, err := UserHasCompletedFirstTopUp(9401)
	require.NoError(t, err)
	assert.True(t, completed, "refund must never restore first top-up qualification")

	// A duplicate refund is a no-op.
	deducted, err = RefundPayPalTopUp(order.TradeNo, 7)
	require.NoError(t, err)
	assert.Equal(t, 0, deducted)
	requireUserQuota(t, 9401, 0)

	// A later real top-up grants no bonus.
	next := insertPendingProviderTopUpForTest(t, "refund-after", 9401, PaymentProviderEpay, 2, 2.0)
	_, err = RechargeEpay(next.TradeNo, "", "127.0.0.1")
	require.NoError(t, err)
	requireUserQuota(t, 9401, 2)
	requireTopUpQuotaFields(t, next.TradeNo, 2, 0)
}

func TestFirstTopUpBonusConcurrentSettlementsGrantOnce(t *testing.T) {
	const bonus = 100
	setFirstTopUpBonusForTest(t, bonus)
	setQuotaPerUnitForTest(t, 1)
	truncateTables(t)

	insertFirstBonusUserForTest(t, 9501)
	insertPendingProviderTopUpForTest(t, "race-a", 9501, PaymentProviderEpay, 2, 2.0)
	insertPendingProviderTopUpForTest(t, "race-b", 9501, PaymentProviderWaffo, 2, 2.0)

	// The shared SQLite pool serializes writers; running both settlements
	// concurrently through goroutines still exercises the locked eligibility
	// re-check inside each transaction and proves the final state grants the
	// bonus exactly once regardless of completion order.
	errs := make([]error, 2)
	done := make(chan struct{})
	go func() {
		_, errs[0] = RechargeEpay("race-a", "", "127.0.0.1")
		done <- struct{}{}
	}()
	go func() {
		errs[1] = RechargeWaffo("race-b", "127.0.0.1")
		done <- struct{}{}
	}()
	<-done
	<-done
	require.NoError(t, errs[0])
	require.NoError(t, errs[1])

	requireUserQuota(t, 9501, 2+2+bonus)
	a := GetTopUpByTradeNo("race-a")
	b := GetTopUpByTradeNo("race-b")
	require.NotNil(t, a)
	require.NotNil(t, b)
	// Exactly one of the two concurrent orders holds the bonus; which one
	// wins depends on commit order, never on scheduling.
	assert.Equal(t, bonus, a.BonusQuota+b.BonusQuota, "exactly one order may hold the bonus")
	assert.Equal(t, 2, a.BaseQuota)
	assert.Equal(t, 2, b.BaseQuota)
}
