package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// These tests pin the read-only eligibility predicate the public topup info
// endpoint uses to decide whether to advertise the "first top-up bonus" to a
// user. They share the provider whitelist, status filter and legacy
// unassigned rule with the settlement transaction (see topup_settlement.go),
// so the read-only check cannot drift from the authoritative grant.

func TestUserHasCompletedFirstTopUpRejectsInvalidUserID(t *testing.T) {
	for _, id := range []int{0, -1} {
		completed, err := UserHasCompletedFirstTopUp(id)
		require.Error(t, err, "user id %d must be rejected", id)
		assert.False(t, completed, "a rejected id can never count as completed")
	}
}

func TestUserHasCompletedFirstTopUpNoHistory(t *testing.T) {
	truncateTables(t)
	insertPayPalUserForTest(t, 7101, 0)

	completed, err := UserHasCompletedFirstTopUp(7101)
	require.NoError(t, err)
	assert.False(t, completed, "a user with no history has not completed the first top-up")
}

func TestUserHasCompletedFirstTopUpSuccess(t *testing.T) {
	truncateTables(t)
	insertPayPalUserForTest(t, 7102, 0)
	insertSettledTopUpForSettleTest(t, "eligibility-success", 7102, PaymentProviderEpay, common.TopUpStatusSuccess)

	completed, err := UserHasCompletedFirstTopUp(7102)
	require.NoError(t, err)
	assert.True(t, completed, "a settled successful top-up must consume the qualification")
}

func TestUserHasCompletedFirstTopUpRefunded(t *testing.T) {
	truncateTables(t)
	insertPayPalUserForTest(t, 7103, 0)
	insertSettledTopUpForSettleTest(t, "eligibility-refunded", 7103, PaymentProviderStripe, common.TopUpStatusRefunded)

	completed, err := UserHasCompletedFirstTopUp(7103)
	require.NoError(t, err)
	assert.True(t, completed, "refund never restores the qualification: the payment did happen")
}

func TestUserHasCompletedFirstTopUpPendingDoesNotConsume(t *testing.T) {
	truncateTables(t)
	insertPayPalUserForTest(t, 7104, 0)
	insertPendingTopUpForSettleTest(t, "eligibility-pending", 7104, PaymentProviderEpay, 5, 5.0)

	completed, err := UserHasCompletedFirstTopUp(7104)
	require.NoError(t, err)
	assert.False(t, completed, "a pending order has not paid yet and must not consume the qualification")
}

func TestUserHasCompletedFirstTopUpFailedDoesNotConsume(t *testing.T) {
	truncateTables(t)
	insertPayPalUserForTest(t, 7105, 0)
	insertSettledTopUpForSettleTest(t, "eligibility-failed", 7105, PaymentProviderEpay, common.TopUpStatusFailed)

	completed, err := UserHasCompletedFirstTopUp(7105)
	require.NoError(t, err)
	assert.False(t, completed, "a failed order never paid and must not consume the qualification")
}

func TestUserHasCompletedFirstTopUpNonRealProviderDoesNotConsume(t *testing.T) {
	truncateTables(t)
	insertPayPalUserForTest(t, 7106, 0)
	// "balance" is a real provider name in the model but it represents a
	// balance-purchase row, not a paid top-up. The whitelist explicitly
	// excludes it.
	insertSettledTopUpForSettleTest(t, "eligibility-balance", 7106, PaymentProviderBalance, common.TopUpStatusSuccess)
	// A made-up provider that is not in the whitelist must also fall through.
	insertSettledTopUpForSettleTest(t, "eligibility-redemption", 7106, "redemption", common.TopUpStatusSuccess)

	completed, err := UserHasCompletedFirstTopUp(7106)
	require.NoError(t, err)
	assert.False(t, completed, "balance / non-real providers never count as a first real top-up")
}

func TestUserHasCompletedFirstTopUpLegacyUnassignedReal(t *testing.T) {
	truncateTables(t)
	insertPayPalUserForTest(t, 7107, 0)
	// The legacy shape: provider="", amount>0. This was the rule for a
	// pre-2026-04 paid order, and the predicate still recognises it.
	now := 1
	require.NoError(t, DB.Model(&TopUp{}).Create(map[string]interface{}{
		"user_id":          7107,
		"amount":           5,
		"money":            5.0,
		"trade_no":         "eligibility-legacy-unassigned",
		"payment_method":   "",
		"payment_provider": "",
		"transaction_id":   nil,
		"create_time":      now,
		"complete_time":    now,
		"status":           common.TopUpStatusSuccess,
	}).Error)

	completed, err := UserHasCompletedFirstTopUp(7107)
	require.NoError(t, err)
	assert.True(t, completed, "a legacy unassigned row with amount>0 still counts as a real top-up")
}

func TestUserHasCompletedFirstTopUpLegacyUnassignedSubscriptionDoesNotConsume(t *testing.T) {
	truncateTables(t)
	insertPayPalUserForTest(t, 7108, 0)
	// Legacy shape with amount=0: this is the subscription / balance
	// adjustment pre-2026-04, and the predicate must skip it.
	insertLegacyUnassignedSubscriptionTopUpForSettleTest(t, "eligibility-legacy-subscription", 7108, common.TopUpStatusSuccess)

	completed, err := UserHasCompletedFirstTopUp(7108)
	require.NoError(t, err)
	assert.False(t, completed, "a legacy unassigned row with amount=0 is not a real top-up")
}

func TestUserHasCompletedFirstTopUpIsolatesUsers(t *testing.T) {
	truncateTables(t)
	insertPayPalUserForTest(t, 7109, 0)
	insertPayPalUserForTest(t, 7110, 0)
	insertSettledTopUpForSettleTest(t, "eligibility-other-user", 7109, PaymentProviderEpay, common.TopUpStatusSuccess)

	completed, err := UserHasCompletedFirstTopUp(7110)
	require.NoError(t, err)
	assert.False(t, completed, "another user's history must not affect this user's eligibility")
}

func TestValidFirstTopUpBonusQuota(t *testing.T) {
	setFirstTopUpBonusForTest(t, 0)
	quota, ok := ValidFirstTopUpBonusQuota()
	assert.Equal(t, 0, quota)
	assert.False(t, ok, "zero config means the promotion is off")

	setFirstTopUpBonusForTest(t, 500000)
	quota, ok = ValidFirstTopUpBonusQuota()
	assert.Equal(t, 500000, quota)
	assert.True(t, ok, "500000 is the planned production value and must validate")

	setFirstTopUpBonusForTest(t, common.MaxQuota)
	quota, ok = ValidFirstTopUpBonusQuota()
	assert.Equal(t, common.MaxQuota, quota)
	assert.True(t, ok, "MaxQuota is the upper boundary and must validate")

	setFirstTopUpBonusForTest(t, common.MaxQuota+1)
	quota, ok = ValidFirstTopUpBonusQuota()
	assert.Equal(t, 0, quota)
	assert.False(t, ok, "above MaxQuota is an out-of-range configuration and must be refused")

	setFirstTopUpBonusForTest(t, -1)
	quota, ok = ValidFirstTopUpBonusQuota()
	assert.Equal(t, 0, quota)
	assert.False(t, ok, "negative is a configuration error and must be refused")
}
