package model

import (
	"fmt"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// insertPayPalUserForTest creates an enabled user with the given id and quota.
// aff_code is unique, so each user gets a distinct deterministic code.
func insertPayPalUserForTest(t *testing.T, id int, quota int) {
	t.Helper()
	user := &User{
		Id:       id,
		Username: fmt.Sprintf("paypal_test_user_%d", id),
		Status:   common.UserStatusEnabled,
		Quota:    quota,
		AffCode:  fmt.Sprintf("aff%d", id),
	}
	require.NoError(t, DB.Create(user).Error)
}

// insertPendingPayPalTopUpForTest creates a pending PayPal top-up mirroring the
// production order-creation shape: TransactionId stays empty until capture.
func insertPendingPayPalTopUpForTest(t *testing.T, tradeNo string, userID int, paymentID string, money float64) *TopUp {
	t.Helper()
	topUp := &TopUp{
		UserId:          userID,
		Amount:          2,
		Money:           money,
		TradeNo:         tradeNo,
		PaymentMethod:   PaymentProviderPayPal,
		PaymentProvider: PaymentProviderPayPal,
		PaymentId:       paymentID,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	require.NoError(t, topUp.Insert())
	return topUp
}

func getPayPalUserQuotaForTest(t *testing.T, userID int) int {
	t.Helper()
	var user User
	require.NoError(t, DB.Select("quota").Where("id = ?", userID).First(&user).Error)
	return user.Quota
}

func getPayPalTopUpStatusForTest(t *testing.T, tradeNo string) string {
	t.Helper()
	topUp := GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, topUp)
	return topUp.Status
}

// insertPendingPayPalTopUpWithNullTransactionIDForTest inserts a pending PayPal
// top-up with transaction_id set to SQL NULL. The production model keeps a plain
// uniqueIndex on transaction_id (restored by P0-2A); under SQLite two
// empty-string rows would collide on that index, whereas multiple NULLs are
// allowed. Pending orders carry no capture yet, so NULL is also the semantically
// correct value. Test-only: production schema and migrations are unchanged.
func insertPendingPayPalTopUpWithNullTransactionIDForTest(t *testing.T, tradeNo string, userID int, paymentID string, money float64) *TopUp {
	t.Helper()
	topUp := &TopUp{
		UserId:          userID,
		Amount:          2,
		Money:           money,
		TradeNo:         tradeNo,
		PaymentMethod:   PaymentProviderPayPal,
		PaymentProvider: PaymentProviderPayPal,
		PaymentId:       paymentID,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	row := map[string]interface{}{
		"user_id":          topUp.UserId,
		"amount":           topUp.Amount,
		"money":            topUp.Money,
		"trade_no":         topUp.TradeNo,
		"payment_method":   topUp.PaymentMethod,
		"payment_provider": topUp.PaymentProvider,
		"payment_id":       topUp.PaymentId,
		"transaction_id":   nil,
		"create_time":      topUp.CreateTime,
		"complete_time":    0,
		"status":           topUp.Status,
	}
	require.NoError(t, DB.Model(&TopUp{}).Create(row).Error)
	// Read back the persisted row so callers receive the assigned primary key.
	require.NoError(t, DB.Where("trade_no = ?", tradeNo).First(topUp).Error)
	return topUp
}

func TestRechargePayPal_RejectsCaptureIDUsedByAnotherOrder(t *testing.T) {
	truncateTables(t)

	insertPayPalUserForTest(t, 20, 0)
	insertPayPalUserForTest(t, 21, 0)
	insertPendingPayPalTopUpWithNullTransactionIDForTest(t, "trade-cap-a", 20, "ORDER-CAP-A", 9.99)
	insertPendingPayPalTopUpWithNullTransactionIDForTest(t, "trade-cap-b", 21, "ORDER-CAP-B", 9.99)

	// First order captures CAP-SHARED and is credited.
	require.NoError(t, RechargePayPal("trade-cap-a", "", "", "127.0.0.1", "CAP-SHARED"))
	assert.Equal(t, 4995000, getPayPalUserQuotaForTest(t, 20))

	// Second order attempts to reuse the same capture id: must fail closed.
	err := RechargePayPal("trade-cap-b", "", "", "127.0.0.1", "CAP-SHARED")
	require.Error(t, err, "reusing a capture id on another order must fail")

	// Second order is not credited and remains pending.
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 21))
	assert.Equal(t, common.TopUpStatusPending, getPayPalTopUpStatusForTest(t, "trade-cap-b"))
}

// insertPendingTopUpForTestWithProvider creates a pending top-up with an
// explicit payment provider so cross-provider rejection can be exercised
// without coupling to the PayPal-specific helper.
func insertPendingTopUpForTestWithProvider(t *testing.T, tradeNo string, userID int, paymentID string, money float64, provider string) *TopUp {
	t.Helper()
	topUp := &TopUp{
		UserId:          userID,
		Amount:          2,
		Money:           money,
		TradeNo:         tradeNo,
		PaymentMethod:   provider,
		PaymentProvider: provider,
		PaymentId:       paymentID,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	require.NoError(t, topUp.Insert())
	return topUp
}

func TestFindTopUpByPaymentID_RequiresProvider(t *testing.T) {
	truncateTables(t)

	insertPayPalUserForTest(t, 30, 0)
	insertPendingPayPalTopUpForTest(t, "trade-find-001", 30, "ORDER-FIND-001", 9.99)

	// Empty payment id is treated as not found regardless of provider scope.
	_, err := FindTopUpByPaymentID("", PaymentProviderPayPal)
	require.ErrorIs(t, err, ErrTopUpNotFound)

	// Matching provider scope resolves the stored PayPal order.
	found, err := FindTopUpByPaymentID("ORDER-FIND-001", PaymentProviderPayPal)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, "trade-find-001", found.TradeNo)
	assert.Equal(t, PaymentProviderPayPal, found.PaymentProvider)

	// Wrong provider scope fails closed as not found: a stray Order ID from
	// another payment method can never settle a PayPal obligation.
	_, err = FindTopUpByPaymentID("ORDER-FIND-001", PaymentProviderStripe)
	require.ErrorIs(t, err, ErrTopUpNotFound)

	// Unknown payment id is not found.
	_, err = FindTopUpByPaymentID("ORDER-DOES-NOT-EXIST", PaymentProviderPayPal)
	require.ErrorIs(t, err, ErrTopUpNotFound)
}

func TestRechargePayPal_DuplicateTradeDoesNotDoubleCredit(t *testing.T) {
	truncateTables(t)

	insertPayPalUserForTest(t, 31, 0)
	insertPendingPayPalTopUpForTest(t, "trade-dup-001", 31, "ORDER-DUP-001", 9.99)

	// First capture credits exactly once.
	require.NoError(t, RechargePayPal("trade-dup-001", "", "", "127.0.0.1", "CAP-DUP-001"))
	assert.Equal(t, 4995000, getPayPalUserQuotaForTest(t, 31))
	assert.Equal(t, common.TopUpStatusSuccess, getPayPalTopUpStatusForTest(t, "trade-dup-001"))

	// Replaying the same capture id is idempotent: no second credit, no error.
	require.NoError(t, RechargePayPal("trade-dup-001", "", "", "127.0.0.1", "CAP-DUP-001"))
	assert.Equal(t, 4995000, getPayPalUserQuotaForTest(t, 31))
	assert.Equal(t, common.TopUpStatusSuccess, getPayPalTopUpStatusForTest(t, "trade-dup-001"))
}

func TestRechargePayPal_RejectsMismatchedProvider(t *testing.T) {
	truncateTables(t)

	insertPayPalUserForTest(t, 32, 0)
	insertPendingTopUpForTestWithProvider(t, "trade-mismatch-001", 32, "ORDER-MISMATCH-001", 9.99, PaymentProviderStripe)

	// A non-PayPal order cannot be settled through the PayPal recharge path.
	err := RechargePayPal("trade-mismatch-001", "", "", "127.0.0.1", "CAP-MISMATCH-001")
	require.Error(t, err, "mismatched provider must be rejected")

	// No quota is credited and the order stays pending.
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 32))
	assert.Equal(t, common.TopUpStatusPending, getPayPalTopUpStatusForTest(t, "trade-mismatch-001"))
}

func TestRefundPayPalTopUp_FullRefundIsAtomicAndIdempotent(t *testing.T) {
	truncateTables(t)

	insertPayPalUserForTest(t, 33, 0)
	insertPendingPayPalTopUpForTest(t, "trade-refund-001", 33, "ORDER-REFUND-001", 9.99)

	// Capture the order so the user is credited and the order is success.
	require.NoError(t, RechargePayPal("trade-refund-001", "", "", "127.0.0.1", "CAP-REFUND-001"))
	require.Equal(t, 4995000, getPayPalUserQuotaForTest(t, 33))
	require.Equal(t, common.TopUpStatusSuccess, getPayPalTopUpStatusForTest(t, "trade-refund-001"))

	// Full refund deducts the credited quota and flips status atomically.
	require.NoError(t, RefundPayPalTopUp("trade-refund-001", 4995000))
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 33))
	assert.Equal(t, common.TopUpStatusRefunded, getPayPalTopUpStatusForTest(t, "trade-refund-001"))

	// A duplicate full refund is a successful no-op: quota and status unchanged.
	require.NoError(t, RefundPayPalTopUp("trade-refund-001", 4995000))
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 33))
	assert.Equal(t, common.TopUpStatusRefunded, getPayPalTopUpStatusForTest(t, "trade-refund-001"))
}
