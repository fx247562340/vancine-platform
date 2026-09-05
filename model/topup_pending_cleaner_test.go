package model

import (
	"fmt"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The Vancine pending cleaner must expire ONLY stale pending PayPal orders.
// Every other settlement state machine (Stripe, Creem, EPay, Waffo, Waffo
// Pancake, subscription top-up rows) belongs to its upstream provider flow
// and has to stay pending under identical conditions. Success/refunded rows
// are never affected.
func TestCleanExpiredPendingTopUpsOnlyTouchesPayPal(t *testing.T) {
	oldCreate := common.GetTimestamp() - int64(72*time.Hour/time.Second)
	recentCutoff := 1 * time.Hour

	providers := []string{
		PaymentProviderPayPal,
		PaymentProviderStripe,
		PaymentProviderCreem,
		PaymentProviderEpay,
		PaymentProviderWaffo,
		PaymentProviderWaffoPancake,
		"", // subscription top-up rows carry no payment provider
	}

	for i, provider := range providers {
		userId := 9100 + i
		topUp := &TopUp{
			UserId:          userId,
			Amount:          1,
			Money:           10.00,
			TradeNo:         fmt.Sprintf("cleaner-pending-%d", i),
			PaymentMethod:   provider,
			PaymentProvider: provider,
			Status:          common.TopUpStatusPending,
			CreateTime:      oldCreate,
		}
		require.NoError(t, DB.Create(topUp).Error)
	}

	// Terminal PayPal states and a terminal Stripe order must not change.
	terminal := []*TopUp{
		{
			UserId: 9200, TradeNo: "cleaner-paypal-success", PaymentProvider: PaymentProviderPayPal,
			PaymentMethod: PaymentProviderPayPal, Amount: 1, Money: 10, Status: common.TopUpStatusSuccess,
			CreateTime: oldCreate, CompleteTime: oldCreate,
		},
		{
			UserId: 9201, TradeNo: "cleaner-paypal-refunded", PaymentProvider: PaymentProviderPayPal,
			PaymentMethod: PaymentProviderPayPal, Amount: 1, Money: 10, Status: common.TopUpStatusRefunded,
			CreateTime: oldCreate, CompleteTime: oldCreate,
		},
		{
			UserId: 9202, TradeNo: "cleaner-stripe-success", PaymentProvider: PaymentProviderStripe,
			PaymentMethod: PaymentProviderStripe, Amount: 1, Money: 10, Status: common.TopUpStatusSuccess,
			CreateTime: oldCreate, CompleteTime: oldCreate,
		},
	}
	for _, topUp := range terminal {
		require.NoError(t, DB.Create(topUp).Error)
	}

	// A fresh PayPal pending order is younger than maxAge and stays pending.
	require.NoError(t, DB.Create(&TopUp{
		UserId: 9203, TradeNo: "cleaner-paypal-fresh", PaymentProvider: PaymentProviderPayPal,
		PaymentMethod: PaymentProviderPayPal, Amount: 1, Money: 10,
		Status: common.TopUpStatusPending, CreateTime: common.GetTimestamp(),
	}).Error)

	expired := CleanExpiredPendingTopUps(recentCutoff)
	assert.Equal(t, int64(1), expired, "only the stale pending PayPal order may expire")

	statusOf := func(tradeNo string) string {
		var topUp TopUp
		require.NoError(t, DB.Where("trade_no = ?", tradeNo).First(&topUp).Error)
		return topUp.Status
	}

	assert.Equal(t, common.TopUpStatusExpired, statusOf("cleaner-pending-0"),
		"stale pending PayPal must expire")
	for i, provider := range providers[1:] {
		assert.Equal(t, common.TopUpStatusPending, statusOf(fmt.Sprintf("cleaner-pending-%d", i+1)),
			"pending %s order must not be touched by the PayPal cleaner", provider)
	}
	assert.Equal(t, common.TopUpStatusSuccess, statusOf("cleaner-paypal-success"))
	assert.Equal(t, common.TopUpStatusRefunded, statusOf("cleaner-paypal-refunded"))
	assert.Equal(t, common.TopUpStatusSuccess, statusOf("cleaner-stripe-success"))
	assert.Equal(t, common.TopUpStatusPending, statusOf("cleaner-paypal-fresh"),
		"pending PayPal newer than maxAge must stay pending")
}
