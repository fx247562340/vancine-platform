package model

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/alicebob/miniredis/v2"
	"github.com/glebarez/sqlite"
	redis "github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// legacyTopUpBeforeBonus is the top_ups row shape before the first top-up bonus
// existed. It exists only so the additive migration can be exercised the way an
// already deployed database hits it: an existing table that must gain the
// bonus_quota column without breaking the rows already stored in it.
type legacyTopUpBeforeBonus struct {
	Id              int     `json:"id"`
	UserId          int     `json:"user_id" gorm:"index"`
	Amount          int64   `json:"amount"`
	Money           float64 `json:"money"`
	TradeNo         string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	PaymentMethod   string  `json:"payment_method" gorm:"type:varchar(50)"`
	PaymentProvider string  `json:"payment_provider" gorm:"type:varchar(50);default:''"`
	PaymentId       string  `json:"payment_id" gorm:"type:varchar(255);default:'';index"`
	TransactionId   string  `json:"transaction_id" gorm:"type:varchar(255);default:'';uniqueIndex"`
	CreateTime      int64   `json:"create_time"`
	CompleteTime    int64   `json:"complete_time"`
	Status          string  `json:"status"`
}

func (legacyTopUpBeforeBonus) TableName() string { return "top_ups" }

func TestSettleRealTopUpRejectsNegativeOrderAmount(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 923, 100)
	// A tampered order must never turn into a quota grant or a credit reversal.
	order := insertPendingTopUpForSettleTest(t, "ftu-negative-amount", 923, PaymentProviderEpay, -5, -5.0)

	_, err := settleRealTopUp(topUpSettleSpec{tradeNo: order.TradeNo, provider: PaymentProviderEpay})
	require.Error(t, err)

	after := reloadTopUpForSettleTest(t, order.TradeNo)
	assert.Equal(t, common.TopUpStatusPending, after.Status)
	assert.Equal(t, 0, after.BonusQuota)
	assert.Equal(t, 100, getPayPalUserQuotaForTest(t, 923))
}

func TestTopUpBonusQuotaColumnIsAddedByAutoMigrate(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&legacyTopUpBeforeBonus{}))
	require.False(t, db.Migrator().HasColumn(&TopUp{}, "bonus_quota"), "fixture must start without the column")

	require.NoError(t, db.Exec(
		"INSERT INTO top_ups (user_id, amount, money, trade_no, payment_method, payment_provider, transaction_id, status, create_time, complete_time) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)",
		1, 5, 5.0, "legacy-order", "alipay", PaymentProviderEpay, common.TopUpStatusSuccess, 1, 2,
	).Error)

	// The same AutoMigrate entry point the application runs on startup.
	require.NoError(t, db.AutoMigrate(&TopUp{}))
	require.True(t, db.Migrator().HasColumn(&TopUp{}, "bonus_quota"))

	var loaded TopUp
	require.NoError(t, db.Where("trade_no = ?", "legacy-order").First(&loaded).Error)
	assert.Equal(t, 0, loaded.BonusQuota, "an order settled before the promotion existed reads as no bonus")

	loaded.BonusQuota = 400000
	require.NoError(t, db.Save(&loaded).Error)
	var reloaded TopUp
	require.NoError(t, db.Where("trade_no = ?", "legacy-order").First(&reloaded).Error)
	assert.Equal(t, 400000, reloaded.BonusQuota, "the granted bonus must persist on the order")
}

// The shipped default must be "promotion off": the first top-up bonus is a
// paid-campaign configuration the operator enables explicitly, never something
// the code turns on by itself. Captured at package init so the assertion cannot
// be influenced by tests that set the option.
var firstTopUpBonusDefaultAtInit = common.QuotaForFirstTopUp

// setFirstTopUpBonusForTest configures the promotion for one test and restores
// the previous value afterwards, so the global option never leaks between tests.
func setFirstTopUpBonusForTest(t *testing.T, quota int) {
	t.Helper()
	previous := common.QuotaForFirstTopUp
	common.QuotaForFirstTopUp = quota
	t.Cleanup(func() { common.QuotaForFirstTopUp = previous })
}

// insertPendingTopUpForSettleTest creates a pending order for one provider.
// transaction_id is inserted as NULL on purpose: the column carries a unique
// index, so two pending orders with an empty string would collide in SQLite.
// A pending order has no gateway transaction yet, which makes NULL the correct
// value as well.
func insertPendingTopUpForSettleTest(t *testing.T, tradeNo string, userID int, provider string, amount int64, money float64) *TopUp {
	t.Helper()
	now := time.Now().Unix()
	require.NoError(t, DB.Model(&TopUp{}).Create(map[string]interface{}{
		"user_id":          userID,
		"amount":           amount,
		"money":            money,
		"trade_no":         tradeNo,
		"payment_method":   provider,
		"payment_provider": provider,
		"transaction_id":   nil,
		"create_time":      now,
		"complete_time":    0,
		"status":           common.TopUpStatusPending,
	}).Error)
	topUp := GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, topUp, "pending order %s should exist", tradeNo)
	return topUp
}

// insertSettledTopUpForSettleTest records a historical order in a given state,
// without going through any settlement path (used to build history).
func insertSettledTopUpForSettleTest(t *testing.T, tradeNo string, userID int, provider string, status string) *TopUp {
	t.Helper()
	now := time.Now().Unix()
	require.NoError(t, DB.Model(&TopUp{}).Create(map[string]interface{}{
		"user_id":          userID,
		"amount":           5,
		"money":            5.0,
		"trade_no":         tradeNo,
		"payment_method":   provider,
		"payment_provider": provider,
		"transaction_id":   nil,
		"create_time":      now - 90*24*60*60,
		"complete_time":    now - 90*24*60*60,
		"status":           status,
	}).Error)
	topUp := GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, topUp, "historical order %s should exist", tradeNo)
	return topUp
}

// insertLegacyUnassignedSubscriptionTopUpForSettleTest records a pre-2026-04
// subscription settlement row. It has payment_provider="", Amount=0 and a
// non-zero Money; the model code treats Amount=0 as the only reliable
// non-payment shape among the legacy unassigned rows, so the test fixture
// mirrors that exactly.
func insertLegacyUnassignedSubscriptionTopUpForSettleTest(t *testing.T, tradeNo string, userID int, status string) *TopUp {
	t.Helper()
	now := time.Now().Unix()
	require.NoError(t, DB.Model(&TopUp{}).Create(map[string]interface{}{
		"user_id":          userID,
		"amount":           0,
		"money":            5.0,
		"trade_no":         tradeNo,
		"payment_method":   "",
		"payment_provider": "",
		"transaction_id":   nil,
		"create_time":      now - 90*24*60*60,
		"complete_time":    now - 90*24*60*60,
		"status":           status,
	}).Error)
	topUp := GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, topUp, "subscription row %s should exist", tradeNo)
	return topUp
}

func reloadTopUpForSettleTest(t *testing.T, tradeNo string) *TopUp {
	t.Helper()
	topUp := GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, topUp, "order %s should exist", tradeNo)
	return topUp
}

// countTopupLogsForSettleTest counts user-visible recharge logs, which is how a
// replay writing a second success log is detected.
func countTopupLogsForSettleTest(t *testing.T, userID int) int64 {
	t.Helper()
	var count int64
	require.NoError(t, DB.Model(&Log{}).Where("user_id = ? AND type = ?", userID, LogTypeTopup).Count(&count).Error)
	return count
}

func latestTopupLogContentForSettleTest(t *testing.T, userID int) string {
	t.Helper()
	var contents []string
	require.NoError(t, DB.Model(&Log{}).Where("user_id = ? AND type = ?", userID, LogTypeTopup).Order("id desc").Limit(1).Pluck("content", &contents).Error)
	if len(contents) == 0 {
		return ""
	}
	return contents[0]
}

func TestQuotaForFirstTopUpShipsDisabled(t *testing.T) {
	require.Equal(t, 0, firstTopUpBonusDefaultAtInit, "first top-up bonus must default to 0 (disabled)")

	truncateTables(t)
	insertPayPalUserForTest(t, 900, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-default-off", 900, PaymentProviderEpay, 5, 5.0)

	require.NoError(t, RechargeEpay(order.TradeNo, "alipay", "127.0.0.1"))

	credited := reloadTopUpForSettleTest(t, order.TradeNo)
	assert.Equal(t, common.TopUpStatusSuccess, credited.Status)
	assert.Equal(t, 0, credited.BonusQuota, "a default configuration must not grant any bonus")
	assert.Equal(t, 5*int(common.QuotaPerUnit), getPayPalUserQuotaForTest(t, 900))
}

func TestQuotaForFirstTopUpApplyAndValidation(t *testing.T) {
	previous := common.QuotaForFirstTopUp
	t.Cleanup(func() { common.QuotaForFirstTopUp = previous })
	// updateOptionMap mirrors the value into the option map it serves to the
	// frontend, so the map must exist for this fixture.
	if common.OptionMap == nil {
		common.OptionMap = make(map[string]string)
	}

	require.NoError(t, updateOptionMap("QuotaForFirstTopUp", "400000"))
	assert.Equal(t, 400000, common.QuotaForFirstTopUp)

	// Turning the promotion off must be expressible.
	require.NoError(t, updateOptionMap("QuotaForFirstTopUp", "0"))
	assert.Equal(t, 0, common.QuotaForFirstTopUp)

	// An unusable stored value fails closed to disabled instead of granting a
	// partially parsed or saturated bonus.
	require.Error(t, updateOptionMap("QuotaForFirstTopUp", "-1"))
	assert.Equal(t, 0, common.QuotaForFirstTopUp)
	require.Error(t, updateOptionMap("QuotaForFirstTopUp", "not-a-number"))
	assert.Equal(t, 0, common.QuotaForFirstTopUp)
}

func TestQuotaForFirstTopUpOptionValidationRejectsBadValues(t *testing.T) {
	for _, value := range []string{"", " ", "abc", "1.5", "-1", "-400000", "1e6", fmt.Sprint(int64(common.MaxQuota) + 1)} {
		t.Run(value, func(t *testing.T) {
			assert.Error(t, validateOptionValue("QuotaForFirstTopUp", value), "must reject %q", value)
		})
	}

	for _, value := range []string{"0", "1", "400000", "  800000  ", fmt.Sprint(common.MaxQuota)} {
		t.Run(value, func(t *testing.T) {
			assert.NoError(t, validateOptionValue("QuotaForFirstTopUp", value), "must accept %q", value)
		})
	}

	// An unrelated option key must not be affected by the new rule.
	assert.NoError(t, validateOptionValue("QuotaForNewUser", "-1"))
}

func TestFirstTopUpGrantsBaseQuotaPlusBonus(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 901, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-first-epay", 901, PaymentProviderEpay, 5, 5.0)

	require.NoError(t, RechargeEpay(order.TradeNo, "alipay", "127.0.0.1"))

	baseQuota := 5 * int(common.QuotaPerUnit)
	credited := reloadTopUpForSettleTest(t, order.TradeNo)
	assert.Equal(t, common.TopUpStatusSuccess, credited.Status)
	assert.Equal(t, 400000, credited.BonusQuota, "the granted bonus must be persisted on the order")
	assert.Greater(t, credited.CompleteTime, int64(0))
	assert.Equal(t, baseQuota+400000, getPayPalUserQuotaForTest(t, 901))

	// The recharge log must reveal all three amounts.
	content := latestTopupLogContentForSettleTest(t, 901)
	assert.NotEmpty(t, content)
	assert.Contains(t, content, "首次充值赠送")
}

func TestSettleRealTopUpReportsSettlementShape(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 921, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-shape", 921, PaymentProviderEpay, 5, 5.0)

	settlement, err := settleRealTopUp(topUpSettleSpec{
		tradeNo:  order.TradeNo,
		provider: PaymentProviderEpay,
	})
	require.NoError(t, err)
	require.True(t, settlement.Credited)

	baseQuota := 5 * int(common.QuotaPerUnit)
	assert.Equal(t, baseQuota, settlement.BaseQuota)
	assert.Equal(t, 400000, settlement.BonusQuota)
	assert.Equal(t, baseQuota+400000, settlement.CreditedQuota)
	assert.True(t, settlement.FirstTopUpBonus)
	assert.Contains(t, settlement.QuotaLogText(), "首次充值赠送")
}

func TestFirstTopUpLogHasNoBonusSegmentWithoutBonus(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)

	insertPayPalUserForTest(t, 902, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-no-bonus", 902, PaymentProviderStripe, 5, 5.0)

	settlement, err := settleRealTopUp(topUpSettleSpec{
		tradeNo:  order.TradeNo,
		provider: PaymentProviderStripe,
	})
	require.NoError(t, err)
	require.False(t, settlement.FirstTopUpBonus)

	// No promotion configured: the settlement text must not mention a bonus that
	// was never granted.
	assert.Equal(t, logger.FormatQuota(settlement.BaseQuota), settlement.QuotaLogText())
	assert.NotContains(t, settlement.QuotaLogText(), "首次充值赠送")
}

func TestFirstTopUpSecondTopUpGetsNoBonus(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 903, 0)
	first := insertPendingTopUpForSettleTest(t, "ftu-2nd-first", 903, PaymentProviderEpay, 5, 5.0)
	second := insertPendingTopUpForSettleTest(t, "ftu-2nd-second", 903, PaymentProviderEpay, 10, 10.0)

	firstSettlement, err := settleRealTopUp(topUpSettleSpec{tradeNo: first.TradeNo, provider: PaymentProviderEpay})
	require.NoError(t, err)
	require.Equal(t, 400000, firstSettlement.BonusQuota)

	secondSettlement, err := settleRealTopUp(topUpSettleSpec{tradeNo: second.TradeNo, provider: PaymentProviderEpay})
	require.NoError(t, err)
	assert.Equal(t, 0, secondSettlement.BonusQuota, "only the first real top-up may grant the bonus")
	assert.Equal(t, 10*int(common.QuotaPerUnit), secondSettlement.CreditedQuota)

	assert.Equal(t, 0, reloadTopUpForSettleTest(t, second.TradeNo).BonusQuota)
	assert.Equal(t, 5*int(common.QuotaPerUnit)+400000+10*int(common.QuotaPerUnit), getPayPalUserQuotaForTest(t, 903))
}

func TestFirstTopUpIsSharedAcrossPaymentChannels(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 904, 0)
	paypalOrder := insertPendingTopUpForSettleTest(t, "ftu-xchannel-paypal", 904, PaymentProviderPayPal, 2, 9.99)
	stripeOrder := insertPendingTopUpForSettleTest(t, "ftu-xchannel-stripe", 904, PaymentProviderStripe, 2, 9.99)

	require.NoError(t, RechargePayPal(paypalOrder.TradeNo, "", "", "127.0.0.1", "CAP-XCH-1"))
	assert.Equal(t, 400000, reloadTopUpForSettleTest(t, paypalOrder.TradeNo).BonusQuota, "the first real top-up wins the bonus wherever it is paid")

	require.NoError(t, Recharge(stripeOrder.TradeNo, "cus_xchannel", "127.0.0.1"))
	stripeSettled := reloadTopUpForSettleTest(t, stripeOrder.TradeNo)
	assert.Equal(t, common.TopUpStatusSuccess, stripeSettled.Status)
	assert.Equal(t, 0, stripeSettled.BonusQuota, "a later top-up on another channel must not get the bonus")

	expectedPayPalQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	assert.Equal(t, expectedPayPalQuota+400000+expectedPayPalQuota, getPayPalUserQuotaForTest(t, 904))
}

func TestFirstTopUpIsNotRetroactiveWhenPromotionStartsLater(t *testing.T) {
	truncateTables(t)

	insertPayPalUserForTest(t, 905, 0)
	first := insertPendingTopUpForSettleTest(t, "ftu-late-first", 905, PaymentProviderEpay, 5, 5.0)
	second := insertPendingTopUpForSettleTest(t, "ftu-late-second", 905, PaymentProviderEpay, 5, 5.0)

	// The user's first real top-up happens while the promotion is off.
	setFirstTopUpBonusForTest(t, 0)
	require.NoError(t, RechargeEpay(first.TradeNo, "alipay", "127.0.0.1"))
	assert.Equal(t, 0, reloadTopUpForSettleTest(t, first.TradeNo).BonusQuota)

	// Enabling the promotion afterwards must not pay out for the earlier payment.
	setFirstTopUpBonusForTest(t, 400000)
	require.NoError(t, RechargeEpay(second.TradeNo, "alipay", "127.0.0.1"))
	assert.Equal(t, 0, reloadTopUpForSettleTest(t, second.TradeNo).BonusQuota)
	assert.Equal(t, 10*int(common.QuotaPerUnit), getPayPalUserQuotaForTest(t, 905))
}

func TestFirstTopUpIsConsumedByRefundedHistory(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 906, 0)
	// A real top-up completed and then refunded more than 30 days ago still
	// proves the user has paid once.
	ancient := insertSettledTopUpForSettleTest(t, "ftu-refunded-history", 906, PaymentProviderStripe, common.TopUpStatusRefunded)
	ancient.CompleteTime = 0
	require.NoError(t, DB.Model(&TopUp{}).Where("trade_no = ?", ancient.TradeNo).Update("create_time", time.Now().Add(-400*24*time.Hour).Unix()).Error)

	next := insertPendingTopUpForSettleTest(t, "ftu-after-refund", 906, PaymentProviderStripe, 5, 5.0)
	settlement, err := settleRealTopUp(topUpSettleSpec{tradeNo: next.TradeNo, provider: PaymentProviderStripe})
	require.NoError(t, err)
	assert.Equal(t, 0, settlement.BonusQuota, "a refunded real top-up must keep consuming the first top-up qualification")
}

func TestFirstTopUpHistoryIgnoresTheTopUpListTimeWindow(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 922, 0)
	// A real top-up far outside the 30 day window the top-up list applies must
	// still be found by the first top-up judgement.
	ancient := insertSettledTopUpForSettleTest(t, "ftu-ancient-success", 922, PaymentProviderStripe, common.TopUpStatusSuccess)
	require.NoError(t, DB.Model(&TopUp{}).Where("trade_no = ?", ancient.TradeNo).
		Update("create_time", time.Now().Add(-400*24*time.Hour).Unix()).Error)

	next := insertPendingTopUpForSettleTest(t, "ftu-after-ancient", 922, PaymentProviderStripe, 5, 5.0)
	settlement, err := settleRealTopUp(topUpSettleSpec{tradeNo: next.TradeNo, provider: PaymentProviderStripe})
	require.NoError(t, err)
	assert.Equal(t, 0, settlement.BonusQuota, "the full history, not the list window, decides the first top-up")
	assert.Equal(t, 0, reloadTopUpForSettleTest(t, next.TradeNo).BonusQuota)
}

func TestFirstTopUpIgnoresBalanceAndSubscriptionRecords(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 907, 0)
	// Subscription settlement writes a top-up row with no provider and Amount=0
	// (the subscription book keeps the dollar value in Money), and balance
	// purchases write one with the balance provider. Neither is a real payment.
	insertLegacyUnassignedSubscriptionTopUpForSettleTest(t, "ftu-subscription-row", 907, common.TopUpStatusSuccess)
	insertSettledTopUpForSettleTest(t, "ftu-balance-row", 907, PaymentProviderBalance, common.TopUpStatusSuccess)

	first := insertPendingTopUpForSettleTest(t, "ftu-after-nonpayment", 907, PaymentProviderStripe, 5, 5.0)
	settlement, err := settleRealTopUp(topUpSettleSpec{tradeNo: first.TradeNo, provider: PaymentProviderStripe})
	require.NoError(t, err)
	assert.Equal(t, 400000, settlement.BonusQuota, "non-payment records must not consume the first top-up qualification")
}

func TestFirstTopUpSettlingABalanceOrderGrantsNoBonus(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 908, 0)
	// The admin completion path is not bound to one provider; a non-payment
	// provider row must still never receive the promotion.
	order := insertPendingTopUpForSettleTest(t, "ftu-balance-pending", 908, PaymentProviderBalance, 5, 5.0)

	settlement, err := settleRealTopUp(topUpSettleSpec{tradeNo: order.TradeNo})
	require.NoError(t, err)
	assert.Equal(t, 0, settlement.BonusQuota)
	assert.Equal(t, 5*int(common.QuotaPerUnit), settlement.CreditedQuota)
}

func TestFirstTopUpDuplicateCallbackIsIdempotent(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 909, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-replay-epay", 909, PaymentProviderEpay, 5, 5.0)

	require.NoError(t, RechargeEpay(order.TradeNo, "alipay", "127.0.0.1"))
	afterFirst := getPayPalUserQuotaForTest(t, 909)
	logsAfterFirst := countTopupLogsForSettleTest(t, 909)
	require.Equal(t, int64(1), logsAfterFirst)

	// Replayed notification: no second credit, no second bonus, no second log.
	require.NoError(t, RechargeEpay(order.TradeNo, "alipay", "127.0.0.1"))
	assert.Equal(t, afterFirst, getPayPalUserQuotaForTest(t, 909))
	assert.Equal(t, logsAfterFirst, countTopupLogsForSettleTest(t, 909))
	assert.Equal(t, 400000, reloadTopUpForSettleTest(t, order.TradeNo).BonusQuota)
}

func TestFirstTopUpDuplicatePayPalCaptureIsIdempotent(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 910, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-replay-paypal", 910, PaymentProviderPayPal, 2, 9.99)

	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-REPLAY"))
	credited := getPayPalUserQuotaForTest(t, 910)
	require.Equal(t, int64(1), countTopupLogsForSettleTest(t, 910))

	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-REPLAY"))
	assert.Equal(t, credited, getPayPalUserQuotaForTest(t, 910))
	assert.Equal(t, int64(1), countTopupLogsForSettleTest(t, 910), "a replayed capture must not write another success log")
}

// TestTopUpReplayLeavesPendingCacheAlone verifies the round-9 contract: a
// topup replay is a true no-op for both the database and the cache. The
// test stages a scenario that looks like the production consumption path
// - the database is the authoritative "credited quota" snapshot, while the
// cache hash carries an additional negative delta representing
// consumption that has not yet been batched into the database. A replay
// must NOT clobber that pending value, even when the database row is
// unchanged from before the replay. The brief is explicit: "重放后
// 数据库不变、缓存不被删除、缓存余额不回升".
func TestTopUpReplayLeavesPendingCacheAlone(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)
	withTestRedisCache(t)

	insertPayPalUserForTest(t, 970, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-replay-cache-pending", 970, PaymentProviderPayPal, 2, 9.99)

	// First settlement runs the HINCRBY fast path: cache ends at
	// baseQuota + bonus.
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-REPLAY-CACHE"))
	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	credited := baseQuota + 400000
	assert.Equal(t, credited, getPayPalUserQuotaForTest(t, 970))
	cached, ok := readUserQuotaCacheOrMiss(t, 970)
	require.True(t, ok)
	assert.Equal(t, credited, cached, "first settlement: DB and cache are in lock-step")

	// Simulate a pending-batch consumption: the user just spent 4321
	// quota through the consumption hot path. The cache hash is
	// decremented immediately (HINCRBY -4321); the database is not yet
	// batched, so it still shows the post-settlement value.
	pendingConsumed := 4321
	require.NoError(t, cacheDecrUserQuota(970, int64(pendingConsumed)))
	cached, ok = readUserQuotaCacheOrMiss(t, 970)
	require.True(t, ok)
	assert.Equal(t, credited-pendingConsumed, cached, "cache now reflects a pending-batch consumption")
	assert.Equal(t, credited, getPayPalUserQuotaForTest(t, 970), "database still at the post-settlement value, deliberately behind the cache")

	// Replay the topup. A true no-op must NOT:
	//   - re-apply the credit (the order was already settled);
	//   - rebuild the cache from the database (clobbering pendingConsumed);
	//   - delete the cache key (clobbering pendingConsumed);
	//   - bump the cache back up (clobbering pendingConsumed).
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-REPLAY-CACHE"))

	// Database row stays at the post-settlement value.
	assert.Equal(t, credited, getPayPalUserQuotaForTest(t, 970), "the database row must not move on replay")
	// Cache hash stays at the pending-batch value.
	cached, ok = readUserQuotaCacheOrMiss(t, 970)
	require.True(t, ok, "a replay must not delete the cache row")
	assert.Equal(t, credited-pendingConsumed, cached, "the cache hash must stay exactly as it was - no invalidation, no HINCRBY")
}

// TestRefundPayPalTopUpReplayLeavesPendingCacheAlone is the regular-refund
// counterpart of the topup replay test above. After a real refund the cache
// hash is decremented by the deducted amount via HINCRBY, and a subsequent
// pending-batch consumption decrements the cache again. A duplicate
// refund must leave both the database and the cache alone.
func TestRefundPayPalTopUpReplayLeavesPendingCacheAlone(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)
	withTestRedisCache(t)

	insertPayPalUserForTest(t, 971, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-refund-replay-cache-pending", 971, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-REFUND-REPLAY-CACHE"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	require.Equal(t, baseQuota, getPayPalUserQuotaForTest(t, 971))
	primeUserQuotaCache(t, 971, baseQuota)
	cached, ok := readUserQuotaCacheOrMiss(t, 971)
	require.True(t, ok)
	require.Equal(t, baseQuota, cached)

	// First (real) refund. HINCRBY puts the cache at 0; the database is
	// also at 0.
	deducted, err := RefundPayPalTopUp(order.TradeNo, baseQuota)
	require.NoError(t, err)
	require.Equal(t, baseQuota, deducted)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 971))
	cached, ok = readUserQuotaCacheOrMiss(t, 971)
	require.True(t, ok)
	assert.Equal(t, 0, cached)

	// Simulate a pending-batch consumption that pushes the cache to a
	// value the database does not yet know about.
	pendingConsumed := 987
	require.NoError(t, cacheDecrUserQuota(971, int64(pendingConsumed)))
	cached, ok = readUserQuotaCacheOrMiss(t, 971)
	require.True(t, ok)
	assert.Equal(t, -pendingConsumed, cached, "cache now reflects a pending-batch consumption after the refund")
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 971), "database still at 0")

	// Replay the refund. A true no-op must NOT touch the cache.
	deducted, err = RefundPayPalTopUp(order.TradeNo, baseQuota)
	require.NoError(t, err)
	assert.Equal(t, 0, deducted, "the order is already refunded so nothing else is deducted")
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 971), "the database row must not move on replay")
	cached, ok = readUserQuotaCacheOrMiss(t, 971)
	require.True(t, ok, "a replay must not delete the cache row")
	assert.Equal(t, -pendingConsumed, cached, "the cache hash must stay exactly as it was - no invalidation, no HINCRBY")
	_, ok = readUserQuotaCacheOrMiss(t, 0)
	assert.False(t, ok, "the replay must not touch a user:0 placeholder")
}

// ----------------------------------------------------------------------------
// HINCRBY failure / fail-closed policy for applyUserQuotaHashDelta
// ----------------------------------------------------------------------------
//
// The brief asks for the cache-failure path on every quota delta entry point
// to be exercised against a real Redis-protocol failure. We force a
// HINCRBY failure by priming a non-integer into the Quota hash field while
// the other fields remain valid; miniredis returns the same
// "value is not an integer" error that a misconfigured upgrade or a
// hand-edited production cache would return. The fail-closed contract is
// then verified end-to-end against the three quota paths that share the
// helper: topup, regular refund, and PayPal settlement.

func withBatchUpdateEnabled(t *testing.T, enabled bool) {
	t.Helper()
	previous := common.BatchUpdateEnabled
	common.BatchUpdateEnabled = enabled
	t.Cleanup(func() { common.BatchUpdateEnabled = previous })
}

// TestTopUpHinFailedAndBatchEnabledPinsCacheToMinQuota verifies the
// batch-update-mode fail-closed contract for a topup. With BatchUpdateEnabled
// = true and a cache row that rejects HINCRBY, the topup must:
//   - commit the database row to the credited quota;
//   - pin the cache Quota field to common.MinQuota (a "do not consume"
//     sentinel the consuming code path treats as a hard stop);
//   - preserve the cache row, the TTL, and any pending-batch delta the
//     row was already carrying;
//   - NOT rebuild the cache from the database (which would clobber
//     pending-batch values that have not yet been flushed);
//   - NOT delete the cache row.
func TestTopUpHinFailedAndBatchEnabledPinsCacheToMinQuota(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)
	withTestRedisCache(t)
	withBatchUpdateEnabled(t, true)

	insertPayPalUserForTest(t, 980, 0)
	// Pre-existing database state: user has some quota already, so the
	// database is not at 0 and the topup will only add a delta on top.
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 980).Update("quota", 1000).Error)

	// Prime the cache with a healthy row, then poison the Quota field so
	// HINCRBY fails at the protocol level. The Id/AuthVersion/CacheSchema
	// remain valid so the row is still findable by GetUserCache.
	primeUserQuotaCacheWithBrokenQuota(t, 980)
	require.Equal(t, 1000, getPayPalUserQuotaForTest(t, 980), "precondition: database is at 1000")

	order := insertPendingTopUpForSettleTest(t, "ftu-hin-topup", 980, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-HIN-TOPUP"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	assert.Equal(t, 1000+baseQuota, getPayPalUserQuotaForTest(t, 980), "the database row must commit the credit")

	cached, ok := readUserQuotaCacheOrMiss(t, 980)
	require.True(t, ok, "the cache row must not be deleted on HINCRBY failure")
	assert.Equal(t, common.MinQuota, cached, "the cache Quota must be pinned to MinQuota as a do-not-consume sentinel")
}

// TestRefundPayPalTopUpHinFailedAndBatchEnabledPinsCacheToMinQuota verifies
// the fail-closed contract for a regular refund. A user who has already
// spent all the quota and is sitting at zero on the database should see
// the cache pinned to MinQuota, not deleted, on a HINCRBY failure.
func TestRefundPayPalTopUpHinFailedAndBatchEnabledPinsCacheToMinQuota(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)
	withTestRedisCache(t)
	withBatchUpdateEnabled(t, true)

	insertPayPalUserForTest(t, 981, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-hin-refund", 981, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-HIN-REFUND"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	require.Equal(t, baseQuota, getPayPalUserQuotaForTest(t, 981))

	// Pretend the user spent everything; database is at 0.
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 981).Update("quota", 0).Error)
	// Poison the cache Quota field so HINCRBY fails.
	primeUserQuotaCacheWithBrokenQuota(t, 981)

	deducted, err := RefundPayPalTopUp(order.TradeNo, baseQuota)
	require.NoError(t, err)
	require.Equal(t, baseQuota, deducted)
	assert.Equal(t, -baseQuota, getPayPalUserQuotaForTest(t, 981), "the database row must commit the refund")

	cached, ok := readUserQuotaCacheOrMiss(t, 981)
	require.True(t, ok, "the cache row must not be deleted on HINCRBY failure")
	assert.Equal(t, common.MinQuota, cached, "the cache Quota must be pinned to MinQuota as a do-not-consume sentinel")
}

// TestApplyPayPalSettlementHinFailedAndBatchEnabledPinsCacheToMinQuota
// verifies the fail-closed contract for the PayPal settlement ledger path.
func TestApplyPayPalSettlementHinFailedAndBatchEnabledPinsCacheToMinQuota(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)
	withTestRedisCache(t)
	withBatchUpdateEnabled(t, true)

	insertPayPalUserForTest(t, 982, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-hin-settle", 982, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-HIN-SETTLE"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	require.Equal(t, baseQuota, getPayPalUserQuotaForTest(t, 982))

	primeUserQuotaCacheWithBrokenQuota(t, 982)

	in := baseSettlementInput(reloadTopUpForSettleTest(t, order.TradeNo), "EVT-HIN-SETTLE", "REFUND-HIN-SETTLE")
	deducted, err := ApplyPayPalSettlement(in)
	require.NoError(t, err)
	require.Equal(t, baseQuota, deducted)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 982), "the database row must commit the refund")

	cached, ok := readUserQuotaCacheOrMiss(t, 982)
	require.True(t, ok, "the cache row must not be deleted on HINCRBY failure")
	assert.Equal(t, common.MinQuota, cached, "the cache Quota must be pinned to MinQuota as a do-not-consume sentinel")
}

// TestAllThreePathsFallbackToInvalidationWhenBatchDisabled verifies the
// non-batch-update path: a HINCRBY failure falls back to
// InvalidateUserCache, and the next read of the cache (e.g. via
// GetUserCache) rebuilds the row from the database. The cache row is
// removed by the invalidation, which is the original round-8 contract for
// the legacy mode where the cache mirrors the database directly.
//
// Note: in this production code path the topup / refund / settlement
// functions all call RecordTopupLog or similar, which in turn calls
// GetUsernameById → getUserNameCache → GetUserCache. That call
// repaints the cache from the database the moment it is read. So the
// end-state of the cache is: rebuilt from the database, in lock-step with
// the database row. The test asserts that lock-step property rather than
// checking the brief gap between Invalidated and GetUserCache (which is
// a sub-microsecond race in production).
func TestAllThreePathsFallbackToInvalidationWhenBatchDisabled(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)
	withTestRedisCache(t)
	withBatchUpdateEnabled(t, false)

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)

	// Topup path: poison the cache, settle, then verify the cache
	// reflects the database value (the InvalidateUserCache ran, then the
	// next read repainted from the database).
	insertPayPalUserForTest(t, 983, 0)
	order1 := insertPendingTopUpForSettleTest(t, "ftu-fb-topup", 983, PaymentProviderPayPal, 2, 9.99)
	primeUserQuotaCacheWithBrokenQuota(t, 983)
	require.NoError(t, RechargePayPal(order1.TradeNo, "", "", "127.0.0.1", "CAP-FB-TOPUP"))
	assert.Equal(t, baseQuota, getPayPalUserQuotaForTest(t, 983), "database must hold the credited quota")
	assert.Equal(t, baseQuota, fetchUserQuotaFromDB(t, 983), "the cache must mirror the database after a HINCRBY failure (round-8 invalidation contract)")

	// Refund path: a fresh user, a settled order, a poisoned cache, a
	// refund, then verify the cache is in lock-step with the database.
	insertPayPalUserForTest(t, 984, 0)
	order2 := insertPendingTopUpForSettleTest(t, "ftu-fb-refund", 984, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order2.TradeNo, "", "", "127.0.0.1", "CAP-FB-REFUND"))
	primeUserQuotaCacheWithBrokenQuota(t, 984)
	_, err = RefundPayPalTopUp(order2.TradeNo, baseQuota)
	require.NoError(t, err)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 984), "database must hold the refunded quota")
	assert.Equal(t, 0, fetchUserQuotaFromDB(t, 984), "the cache must mirror the database after a HINCRBY failure (round-8 invalidation contract)")

	// PayPal settlement path: a fresh user, a settled order, a poisoned
	// cache, a settlement, then verify the cache is in lock-step with the
	// database.
	insertPayPalUserForTest(t, 985, 0)
	order3 := insertPendingTopUpForSettleTest(t, "ftu-fb-settle", 985, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order3.TradeNo, "", "", "127.0.0.1", "CAP-FB-SETTLE"))
	primeUserQuotaCacheWithBrokenQuota(t, 985)
	in := baseSettlementInput(reloadTopUpForSettleTest(t, order3.TradeNo), "EVT-FB-SETTLE", "REFUND-FB-SETTLE")
	_, err = ApplyPayPalSettlement(in)
	require.NoError(t, err)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 985), "database must hold the refunded quota")
	assert.Equal(t, 0, fetchUserQuotaFromDB(t, 985), "the cache must mirror the database after a HINCRBY failure (round-8 invalidation contract)")
}

// TestFirstTopUpConcurrentFirstTopUpsGrantBonusOnce is the in-process, same-DB
// variant of the concurrency test. Because the test package DB only allows
// one connection at a time, this test demonstrates the bonus-uniqueness
// invariant under the SQLite connection-pool serializer, not the production
// cross-instance user row lock. TestConcurrentFirstTopUpAcrossIndependentConnections
// exercises the production path with two independent SQLite connections.
func TestFirstTopUpConcurrentFirstTopUpsGrantBonusOnce(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 911, 0)
	epayOrder := insertPendingTopUpForSettleTest(t, "ftu-race-epay", 911, PaymentProviderEpay, 5, 5.0)
	stripeOrder := insertPendingTopUpForSettleTest(t, "ftu-race-stripe", 911, PaymentProviderStripe, 8, 8.0)

	var wg sync.WaitGroup
	errs := make([]error, 2)
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, errs[0] = settleRealTopUp(topUpSettleSpec{tradeNo: epayOrder.TradeNo, provider: PaymentProviderEpay})
	}()
	go func() {
		defer wg.Done()
		_, errs[1] = settleRealTopUp(topUpSettleSpec{tradeNo: stripeOrder.TradeNo, provider: PaymentProviderStripe})
	}()
	wg.Wait()
	require.NoError(t, errs[0])
	require.NoError(t, errs[1])

	epaySettled := reloadTopUpForSettleTest(t, epayOrder.TradeNo)
	stripeSettled := reloadTopUpForSettleTest(t, stripeOrder.TradeNo)
	require.Equal(t, common.TopUpStatusSuccess, epaySettled.Status)
	require.Equal(t, common.TopUpStatusSuccess, stripeSettled.Status)

	bonusTotal := epaySettled.BonusQuota + stripeSettled.BonusQuota
	assert.Equal(t, 400000, bonusTotal, "exactly one order may carry the first top-up bonus")

	stripeQuota, err := common.QuotaFromFloatStrict(8.0 * common.QuotaPerUnit)
	require.NoError(t, err)
	assert.Equal(t, 5*int(common.QuotaPerUnit)+stripeQuota+400000, getPayPalUserQuotaForTest(t, 911))
}

func TestManualCompleteTopUpGrantsFirstTopUpBonusOnce(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 912, 0)
	first := insertPendingTopUpForSettleTest(t, "ftu-manual-first", 912, PaymentProviderEpay, 5, 5.0)
	second := insertPendingTopUpForSettleTest(t, "ftu-manual-second", 912, PaymentProviderEpay, 5, 5.0)

	require.NoError(t, ManualCompleteTopUp(first.TradeNo, "127.0.0.1"))
	assert.Equal(t, 400000, reloadTopUpForSettleTest(t, first.TradeNo).BonusQuota)
	afterFirst := getPayPalUserQuotaForTest(t, 912)
	require.Equal(t, 5*int(common.QuotaPerUnit)+400000, afterFirst)
	require.Equal(t, int64(1), countTopupLogsForSettleTest(t, 912))

	// Repeating the same manual completion is a no-op: no extra quota, no extra
	// bonus and no second log.
	require.NoError(t, ManualCompleteTopUp(first.TradeNo, "127.0.0.1"))
	assert.Equal(t, afterFirst, getPayPalUserQuotaForTest(t, 912))
	assert.Equal(t, int64(1), countTopupLogsForSettleTest(t, 912))

	// The bonus was already consumed, so the next top-up only gets its own quota.
	require.NoError(t, ManualCompleteTopUp(second.TradeNo, "127.0.0.1"))
	assert.Equal(t, 0, reloadTopUpForSettleTest(t, second.TradeNo).BonusQuota)
	assert.Equal(t, afterFirst+5*int(common.QuotaPerUnit), getPayPalUserQuotaForTest(t, 912))
}

func TestPayPalRefundAndReversalClawBackBonusOnce(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 913, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-refund", 913, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-FTU-REFUND"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	require.Equal(t, baseQuota+400000, getPayPalUserQuotaForTest(t, 913))

	in := baseSettlementInput(reloadTopUpForSettleTest(t, order.TradeNo), "EVT-FTU-REFUND", "REFUND-FTU-1")
	deducted, err := ApplyPayPalSettlement(in)
	require.NoError(t, err)
	require.Equal(t, baseQuota+400000, deducted, "the first event that flips the order is the one that deducts")
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 913), "the refund must recover the base quota and the granted bonus")
	assert.Equal(t, common.TopUpStatusRefunded, reloadTopUpForSettleTest(t, order.TradeNo).Status)

	// Replaying the same refund event deducts nothing further and reports 0.
	deducted, err = ApplyPayPalSettlement(in)
	require.NoError(t, err)
	assert.Equal(t, 0, deducted)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 913))

	// The sibling reversal for the same capture is recorded but must not deduct
	// a second time.
	reversal := baseSettlementInput(reloadTopUpForSettleTest(t, order.TradeNo), "EVT-FTU-REVERSAL", "CAP-FTU-REFUND")
	reversal.EventType = PayPalSettlementReversed
	deducted, err = ApplyPayPalSettlement(reversal)
	require.NoError(t, err)
	assert.Equal(t, 0, deducted)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 913))

	// A refunded first top-up still consumed the qualification.
	next := insertPendingTopUpForSettleTest(t, "ftu-after-refund-credit", 913, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(next.TradeNo, "", "", "127.0.0.1", "CAP-FTU-AFTER-REFUND"))
	assert.Equal(t, 0, reloadTopUpForSettleTest(t, next.TradeNo).BonusQuota)
}

func TestRefundPayPalTopUpClawsBackBonusOnce(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 914, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-refund-helper", 914, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-FTU-HELPER"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	require.Equal(t, baseQuota+400000, getPayPalUserQuotaForTest(t, 914))

	// The caller only knows the paid quota; the bonus is recovered from the order.
	_, err = RefundPayPalTopUp(order.TradeNo, baseQuota)
	require.NoError(t, err)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 914))

	_, err = RefundPayPalTopUp(order.TradeNo, baseQuota)
	require.NoError(t, err)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 914), "a duplicate refund must not deduct twice")
}

func TestSettleRealTopUpRollsBackOnWrongProvider(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 915, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-wrong-provider", 915, PaymentProviderStripe, 5, 5.0)

	_, err := settleRealTopUp(topUpSettleSpec{tradeNo: order.TradeNo, provider: PaymentProviderPayPal})
	require.ErrorIs(t, err, ErrPaymentMethodMismatch)

	after := reloadTopUpForSettleTest(t, order.TradeNo)
	assert.Equal(t, common.TopUpStatusPending, after.Status)
	assert.Equal(t, 0, after.BonusQuota)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 915))
}

func TestSettleRealTopUpRollsBackOnInvalidOrderStatus(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 916, 0)
	for _, status := range []string{common.TopUpStatusFailed, common.TopUpStatusExpired, common.TopUpStatusRefunded} {
		order := insertPendingTopUpForSettleTest(t, "ftu-status-"+status, 916, PaymentProviderStripe, 5, 5.0)
		require.NoError(t, DB.Model(&TopUp{}).Where("trade_no = ?", order.TradeNo).Update("status", status).Error)

		_, err := settleRealTopUp(topUpSettleSpec{tradeNo: order.TradeNo, provider: PaymentProviderStripe})
		require.ErrorIs(t, err, ErrTopUpStatusInvalid, "status %s must not be settleable", status)

		after := reloadTopUpForSettleTest(t, order.TradeNo)
		assert.Equal(t, status, after.Status)
		assert.Equal(t, 0, after.BonusQuota)
	}
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 916))
}

func TestSettleRealTopUpRollsBackWhenUserIsMissing(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	// An order pointing at a user id that does not exist must not flip to
	// success: there is nowhere to credit the money.
	order := insertPendingTopUpForSettleTest(t, "ftu-missing-user", 424242, PaymentProviderEpay, 5, 5.0)

	_, err := settleRealTopUp(topUpSettleSpec{tradeNo: order.TradeNo, provider: PaymentProviderEpay})
	require.ErrorIs(t, err, ErrTopUpUserMissing)

	after := reloadTopUpForSettleTest(t, order.TradeNo)
	assert.Equal(t, common.TopUpStatusPending, after.Status)
	assert.Equal(t, 0, after.BonusQuota)
	assert.Equal(t, int64(0), after.CompleteTime)
}

func TestEpaySettlementIsAtomicBetweenOrderAndQuota(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	// Missing user: the epay callback must fail as a whole so the gateway can
	// retry, and the order must stay pending.
	order := insertPendingTopUpForSettleTest(t, "ftu-epay-atomic", 424243, PaymentProviderEpay, 5, 5.0)
	require.ErrorIs(t, RechargeEpay(order.TradeNo, "alipay", "127.0.0.1"), ErrTopUpUserMissing)
	after := reloadTopUpForSettleTest(t, order.TradeNo)
	assert.Equal(t, common.TopUpStatusPending, after.Status)
	assert.Equal(t, 0, after.BonusQuota)

	// Happy path: order status, bonus and quota all land together.
	insertPayPalUserForTest(t, 917, 0)
	good := insertPendingTopUpForSettleTest(t, "ftu-epay-good", 917, PaymentProviderEpay, 5, 5.0)
	require.NoError(t, RechargeEpay(good.TradeNo, "wxpay", "127.0.0.1"))

	settled := reloadTopUpForSettleTest(t, good.TradeNo)
	assert.Equal(t, common.TopUpStatusSuccess, settled.Status)
	assert.Equal(t, 400000, settled.BonusQuota)
	assert.Equal(t, "wxpay", settled.PaymentMethod, "the method reported by the gateway is recorded")
	assert.Equal(t, 5*int(common.QuotaPerUnit)+400000, getPayPalUserQuotaForTest(t, 917))
}

func TestSettleRealTopUpRollsBackWhenQuotaUpdateFails(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 918, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-user-update-fails", 918, PaymentProviderStripe, 5, 5.0)

	// A user column that does not exist makes the quota statement fail after the
	// order row was already updated, which is the mid-transaction failure the
	// rollback has to cover.
	_, err := settleRealTopUp(topUpSettleSpec{
		tradeNo:    order.TradeNo,
		provider:   PaymentProviderStripe,
		userFields: map[string]interface{}{"this_column_does_not_exist": 1},
	})
	require.Error(t, err)

	after := reloadTopUpForSettleTest(t, order.TradeNo)
	assert.Equal(t, common.TopUpStatusPending, after.Status, "a failed credit must roll the order back too")
	assert.Equal(t, 0, after.BonusQuota)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 918))
	assert.Zero(t, countTopupLogsForSettleTest(t, 918))
}

func TestSettleRealTopUpRejectsQuotaOverflow(t *testing.T) {
	truncateTables(t)
	// A bonus that cannot be added to the paid quota inside the 32-bit quota
	// range must fail the settlement rather than credit a saturated value.
	setFirstTopUpBonusForTest(t, common.MaxQuota)

	insertPayPalUserForTest(t, 919, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-overflow", 919, PaymentProviderEpay, 5, 5.0)

	_, err := settleRealTopUp(topUpSettleSpec{tradeNo: order.TradeNo, provider: PaymentProviderEpay})
	require.Error(t, err)

	after := reloadTopUpForSettleTest(t, order.TradeNo)
	assert.Equal(t, common.TopUpStatusPending, after.Status)
	assert.Equal(t, 0, after.BonusQuota)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 919))
}

func TestSettleRealTopUpRejectsOversizedOrderAmount(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 920, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-huge-amount", 920, PaymentProviderWaffo, 1<<62, 1<<40)

	_, err := settleRealTopUp(topUpSettleSpec{tradeNo: order.TradeNo, provider: PaymentProviderWaffo})
	require.Error(t, err, "an Amount x QuotaPerUnit product outside the quota range must fail closed")

	after := reloadTopUpForSettleTest(t, order.TradeNo)
	assert.Equal(t, common.TopUpStatusPending, after.Status)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 920))
}

// ----------------------------------------------------------------------------
// Legacy unassigned payment_provider compatibility
// ----------------------------------------------------------------------------

// insertLegacyUnassignedRealTopUpForSettleTest records a top-up row in the
// exact shape an order settled before the payment_provider audit field was
// added would have on disk: provider="" and Amount>0. The model code must
// treat such a row as a legacy real top-up for first-top-up qualification
// purposes.
func insertLegacyUnassignedRealTopUpForSettleTest(t *testing.T, tradeNo string, userID int, status string) *TopUp {
	t.Helper()
	now := time.Now().Unix()
	require.NoError(t, DB.Model(&TopUp{}).Create(map[string]interface{}{
		"user_id":          userID,
		"amount":           5,
		"money":            5.0,
		"trade_no":         tradeNo,
		"payment_method":   "",
		"payment_provider": "",
		"transaction_id":   nil,
		"create_time":      now - 90*24*60*60,
		"complete_time":    now - 90*24*60*60,
		"status":           status,
	}).Error)
	topUp := GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, topUp, "legacy unassigned order %s should exist", tradeNo)
	return topUp
}

func TestLegacyUnassignedRealTopUpConsumesFirstTopUpQualification(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 930, 0)
	// A pre-2026-04 settled order: no payment_provider, Amount>0. The user's
	// first real top-up was already paid, so the next one must not grant the
	// bonus.
	insertLegacyUnassignedRealTopUpForSettleTest(t, "ftu-legacy-real", 930, common.TopUpStatusSuccess)

	next := insertPendingTopUpForSettleTest(t, "ftu-legacy-real-next", 930, PaymentProviderEpay, 5, 5.0)
	settlement, err := settleRealTopUp(topUpSettleSpec{tradeNo: next.TradeNo, provider: PaymentProviderEpay})
	require.NoError(t, err)
	assert.Equal(t, 0, settlement.BonusQuota, "a legacy real top-up must keep consuming the qualification")
}

func TestLegacyUnassignedRefundedRealTopUpKeepsConsumingQualification(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 945, 0)
	// A pre-2026-04 settled order that has since been refunded must still
	// count as a real top-up the user has paid for: refunding an order never
	// restores the first top-up qualification.
	insertLegacyUnassignedRealTopUpForSettleTest(t, "ftu-legacy-refunded", 945, common.TopUpStatusRefunded)

	next := insertPendingTopUpForSettleTest(t, "ftu-legacy-refunded-next", 945, PaymentProviderEpay, 5, 5.0)
	settlement, err := settleRealTopUp(topUpSettleSpec{tradeNo: next.TradeNo, provider: PaymentProviderEpay})
	require.NoError(t, err)
	assert.Equal(t, 0, settlement.BonusQuota, "a legacy refunded real top-up must keep consuming the qualification")
}

func TestLegacyUnassignedSubscriptionRowDoesNotConsumeQualification(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 931, 0)
	// A subscription row settled before the audit field: provider="" and
	// Amount=0 (the dollar value lived in Money). It is not a real top-up.
	insertLegacyUnassignedSubscriptionTopUpForSettleTest(t, "ftu-legacy-sub", 931, common.TopUpStatusSuccess)

	next := insertPendingTopUpForSettleTest(t, "ftu-legacy-sub-next", 931, PaymentProviderEpay, 5, 5.0)
	settlement, err := settleRealTopUp(topUpSettleSpec{tradeNo: next.TradeNo, provider: PaymentProviderEpay})
	require.NoError(t, err)
	assert.Equal(t, 400000, settlement.BonusQuota, "subscription rows must not consume the first top-up qualification")
}

func TestBalanceRowsDoNotConsumeFirstTopUpQualification(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 932, 0)
	// A balance-purchase row: provider="balance", Amount>0. Already a known
	// non-real channel, must not count.
	insertSettledTopUpForSettleTest(t, "ftu-balance-only", 932, PaymentProviderBalance, common.TopUpStatusSuccess)

	next := insertPendingTopUpForSettleTest(t, "ftu-balance-only-next", 932, PaymentProviderEpay, 5, 5.0)
	settlement, err := settleRealTopUp(topUpSettleSpec{tradeNo: next.TradeNo, provider: PaymentProviderEpay})
	require.NoError(t, err)
	assert.Equal(t, 400000, settlement.BonusQuota, "balance rows must not consume the first top-up qualification")
}

// ----------------------------------------------------------------------------
// BaseQuota persistence + "change QuotaPerUnit then refund exactly zero" test
// ----------------------------------------------------------------------------

// setQuotaPerUnitForTest temporarily mutates common.QuotaPerUnit and registers
// a cleanup. The test must restore it so a later test does not see a polluted
// global.
func setQuotaPerUnitForTest(t *testing.T, value float64) {
	t.Helper()
	previous := common.QuotaPerUnit
	common.QuotaPerUnit = value
	t.Cleanup(func() { common.QuotaPerUnit = previous })
}

func TestBaseQuotaIsPersistedOnSettlement(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)

	insertPayPalUserForTest(t, 933, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-base-persist", 933, PaymentProviderEpay, 7, 7.0)
	require.NoError(t, RechargeEpay(order.TradeNo, "alipay", "127.0.0.1"))

	after := reloadTopUpForSettleTest(t, order.TradeNo)
	assert.Equal(t, 7*int(common.QuotaPerUnit), after.BaseQuota, "BaseQuota must be the paid quota the settlement actually credited")
	assert.Equal(t, 0, after.BonusQuota)
}

func TestPayPalSettlementClawsBackExactZeroAfterQuotaPerUnitChange(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 934, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-qpu-change", 934, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-QPU-CHANGE"))

	credited := reloadTopUpForSettleTest(t, order.TradeNo)
	expectedPayPal, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	require.Equal(t, expectedPayPal+400000, getPayPalUserQuotaForTest(t, 934), "the order credited the pre-change QuotaPerUnit")
	require.Equal(t, expectedPayPal, credited.BaseQuota, "BaseQuota must be the value the settlement actually credited")

	// An operator changes QuotaPerUnit to a different value. The refund must
	// still claw back exactly what was credited, not what would be re-derived
	// from the new QuotaPerUnit. That is the contract of persisting BaseQuota.
	setQuotaPerUnitForTest(t, 1.0)

	in := baseSettlementInput(reloadTopUpForSettleTest(t, order.TradeNo), "EVT-QPU-CHANGE", "REFUND-QPU")
	deducted, err := ApplyPayPalSettlement(in)
	require.NoError(t, err)
	require.Equal(t, expectedPayPal+400000, deducted, "the refund must recover the exact credited amount")
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 934), "changing QuotaPerUnit then refunding must still net to zero")
}

func TestRefundPayPalTopUpClawsBackExactZeroAfterQuotaPerUnitChange(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 400000)

	insertPayPalUserForTest(t, 935, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-qpu-change-helper", 935, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-QPU-CHANGE-HELPER"))

	expectedPayPal, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	require.Equal(t, expectedPayPal+400000, getPayPalUserQuotaForTest(t, 935))

	// The operator knows only the pre-change paid quota; the helper must use
	// the order's persisted BaseQuota so the deduction is still exact.
	setQuotaPerUnitForTest(t, 1.0)

	deducted, err := RefundPayPalTopUp(order.TradeNo, expectedPayPal)
	require.NoError(t, err)
	require.Equal(t, expectedPayPal+400000, deducted, "the helper refund must use the persisted BaseQuota, not re-derive with the new QuotaPerUnit")
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 935), "the user must end at exactly zero after the post-QPU-change refund")
}

// ----------------------------------------------------------------------------
// Stripe/PayPal use float64 truncation (not Decimal) for Money x QuotaPerUnit
// ----------------------------------------------------------------------------

// TestStripeFloat64TruncationPreservesOriginalResult is a regression test for
// the documented float64 truncation of Money x QuotaPerUnit: the Stripe
// checkout and the original PayPal settlement both computed the product in
// float64 and truncated it with int(). Switching to Decimal would have
// produced 4_015_000 here; the float64 path must keep producing 4_014_999.
func TestStripeFloat64TruncationPreservesOriginalResult(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)

	insertPayPalUserForTest(t, 936, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-stripe-float", 936, PaymentProviderStripe, 2, 8.03)
	require.NoError(t, Recharge(order.TradeNo, "cus_legacy", "127.0.0.1"))

	after := reloadTopUpForSettleTest(t, order.TradeNo)
	const expectedFloat64Truncation = 4_014_999
	assert.Equal(t, expectedFloat64Truncation, after.BaseQuota,
		"Money=8.03 with QuotaPerUnit=500000 must use float64 truncation, not Decimal (which would give 4_015_000)")
	assert.Equal(t, expectedFloat64Truncation, getPayPalUserQuotaForTest(t, 936),
		"the user quota must be the float64 truncated product, not the Decimal one")
}

func TestPayPalFloat64TruncationPreservesOriginalResult(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)

	insertPayPalUserForTest(t, 937, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-paypal-float", 937, PaymentProviderPayPal, 2, 8.03)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-FLOAT"))

	after := reloadTopUpForSettleTest(t, order.TradeNo)
	assert.Equal(t, 4_014_999, after.BaseQuota,
		"PayPal settlement must also use float64 truncation for Money x QuotaPerUnit")
}

func TestStripeFloat64TruncationFailsClosedOnOverflow(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)

	// Money that puts the product above int32 must fail the settlement
	// rather than saturate. 4_294_967.295 × 500_000 = 2_147_483_647_500,
	// well over MaxQuota.
	insertPayPalUserForTest(t, 938, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-stripe-overflow", 938, PaymentProviderStripe, 2, 4_294_967.295)
	_, err := settleRealTopUp(topUpSettleSpec{tradeNo: order.TradeNo, provider: PaymentProviderStripe})
	require.Error(t, err, "an overflowed float64 product must fail closed, not silently saturate")

	after := reloadTopUpForSettleTest(t, order.TradeNo)
	assert.Equal(t, common.TopUpStatusPending, after.Status)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 938))
}

// ----------------------------------------------------------------------------
// Refund cache consistency with Redis enabled
// ----------------------------------------------------------------------------

// withTestRedisCache swaps the package-level Redis client for a miniredis
// instance so cacheDecrUserQuota / cacheIncrUserQuota actually run. The
// original Redis configuration is restored on cleanup.
func withTestRedisCache(t *testing.T) {
	t.Helper()
	server, err := miniredis.Run()
	require.NoError(t, err)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() {
		_ = client.Close()
		server.Close()
	})
	require.NoError(t, client.Ping(context.Background()).Err(),
		"the cache client must be verified before the test exercises it")
	previousEnabled := common.RedisEnabled
	previousRDB := common.RDB
	common.RedisEnabled = true
	common.RDB = client
	t.Cleanup(func() {
		common.RedisEnabled = previousEnabled
		common.RDB = previousRDB
	})
}

// primeUserQuotaCache writes a synthetic user cache row with a known quota
// value so the test can assert the cache delta after a settlement.
func primeUserQuotaCache(t *testing.T, userID int, quota int) {
	t.Helper()
	user := &UserBase{Id: userID, Quota: quota, AuthVersion: 1, CacheSchema: userCacheSchemaVersion}
	require.NoError(t, writeUserCache(user, true))
}

// primeUserQuotaCacheWithBrokenQuota writes a cache row whose Quota field is
// a non-integer so that HINCRBY on the Quota field fails at the protocol
// level. The row still has the right Id/AuthVersion/CacheSchema so the
// auth-version fence and GetUserCache happy path both accept it; the
// failure is isolated to the Quota delta, which is exactly the production
// failure shape the applyUserQuotaHashDelta safe-failure policy must
// defend against. The caller is expected to have withTestRedisCache(t)
// and to set common.BatchUpdateEnabled to the value under test.
func primeUserQuotaCacheWithBrokenQuota(t *testing.T, userID int) {
	t.Helper()
	require.True(t, common.RedisEnabled, "miniredis must be enabled for HINCRBY to fail at all")
	// First plant a valid row so Id, AuthVersion and CacheSchema are all
	// written by writeUserCache. The Quota field will be set to a benign
	// integer at this point; we overwrite it with a non-integer so the
	// next HINCRBY on the field fails at the protocol level.
	primeUserQuotaCache(t, userID, 0)
	require.NoError(t, common.RedisHSetField(getUserCacheKey(userID), "Quota", "not-an-integer"))
}

func readUserQuotaCache(t *testing.T, userID int) (int, error) {
	t.Helper()
	base, err := cacheGetUserBase(userID)
	if err != nil {
		return 0, err
	}
	return base.Quota, nil
}

// readUserQuotaCacheOrMiss is the same as readUserQuotaCache, but it returns
// (0, nil) on a cache miss so a test can express "the cache is gone" without
// a separate error branch.
func readUserQuotaCacheOrMiss(t *testing.T, userID int) (int, bool) {
	t.Helper()
	base, err := cacheGetUserBase(userID)
	if err != nil {
		return 0, false
	}
	return base.Quota, true
}

// fetchUserQuotaFromDB reads the authoritative quota via GetUserCache, which
// falls back to the database and repopulates the cache. It is the contract a
// real request would see after a cache invalidation.
func fetchUserQuotaFromDB(t *testing.T, userID int) int {
	t.Helper()
	cache, err := GetUserCache(userID)
	require.NoError(t, err, "GetUserCache must rebuild from DB after a cache invalidation")
	return cache.Quota
}

// TestRefundPayPalTopUpSyncsCacheAndDB verifies the production cache path:
// a real refund atomically decrements the database and the user quota hash
// via HINCRBY (which Redis handles natively for negative deltas). A duplicate
// refund is a true no-op for the cache: it moves no quota and does NOT
// touch the cache hash, so any pending-batch consumption that has not yet
// been flushed to the database stays in the cache exactly as it was.
func TestRefundPayPalTopUpSyncsCacheAndDB(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)
	withTestRedisCache(t)

	insertPayPalUserForTest(t, 940, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-refund-cache", 940, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-REFUND-CACHE"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	require.Equal(t, baseQuota, getPayPalUserQuotaForTest(t, 940))
	// Seed the cache to mirror the database so the HINCRBY is the only thing
	// under test.
	primeUserQuotaCache(t, 940, baseQuota)
	cached, ok := readUserQuotaCacheOrMiss(t, 940)
	require.True(t, ok, "the seeded cache row must be present before the refund")
	require.Equal(t, baseQuota, cached)

	// HINCRBY fast path: the cache hash field moves by -baseQuota, ending
	// at zero, exactly in lock-step with the database.
	deducted, err := RefundPayPalTopUp(order.TradeNo, baseQuota)
	require.NoError(t, err)
	require.Equal(t, baseQuota, deducted)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 940), "database must end at zero")
	cached, ok = readUserQuotaCacheOrMiss(t, 940)
	require.True(t, ok, "the HINCRBY must not delete the cache row")
	assert.Equal(t, 0, cached, "HINCRBY -baseQuota must leave the cache at 0 in lock-step with the database")

	// A duplicate refund must not deduct twice and must not touch the cache.
	deducted, err = RefundPayPalTopUp(order.TradeNo, baseQuota)
	require.NoError(t, err)
	assert.Equal(t, 0, deducted, "a replayed refund must report 0 deduction")
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 940), "database must remain at zero")
	cached, ok = readUserQuotaCacheOrMiss(t, 940)
	require.True(t, ok, "a replayed refund must not delete the cache row")
	assert.Equal(t, 0, cached, "a replayed refund must leave the cache hash exactly as it was")
}

func TestApplyPayPalSettlementSyncsCacheAndDB(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)
	withTestRedisCache(t)

	insertPayPalUserForTest(t, 941, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-settle-cache", 941, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-SETTLE-CACHE"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	primeUserQuotaCache(t, 941, baseQuota)

	in := baseSettlementInput(reloadTopUpForSettleTest(t, order.TradeNo), "EVT-SETTLE-CACHE", "REFUND-SETTLE-CACHE")
	deducted, err := ApplyPayPalSettlement(in)
	require.NoError(t, err)
	require.Equal(t, baseQuota, deducted)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 941), "database must end at zero")
	cached, ok := readUserQuotaCacheOrMiss(t, 941)
	require.True(t, ok, "the HINCRBY must not delete the cache row")
	assert.Equal(t, 0, cached, "HINCRBY -baseQuota must leave the cache at 0 in lock-step with the database")

	// Sibling reversal records its ledger row but does not deduct; the call
	// must not touch the cache either, so any pending-batch values stay
	// in the cache exactly as they were.
	reversal := baseSettlementInput(reloadTopUpForSettleTest(t, order.TradeNo), "EVT-SETTLE-CACHE-REV", "CAP-SETTLE-CACHE")
	reversal.EventType = PayPalSettlementReversed
	deducted, err = ApplyPayPalSettlement(reversal)
	require.NoError(t, err)
	assert.Equal(t, 0, deducted, "the sibling reversal must not deduct quota")
	cached, ok = readUserQuotaCacheOrMiss(t, 941)
	require.True(t, ok, "the sibling reversal must not delete the cache row")
	assert.Equal(t, 0, cached, "the sibling reversal must leave the cache hash exactly as it was")
}

// TestTopUpDoesNotResurrectConsumedQuotaFromCacheMiss verifies the brief:
// when the user quota hash already reflects recent consumption and the next
// call is a topup, the topup must not invalidate-and-rebuild the hash from
// the database (which would clobber any recent consumption that was reflected
// in the cache but not yet in the database). The HINCRBY-based path adds the
// paid quota to whatever value the cache already carries, so the cache and
// the database move in lock-step and a missing key just causes the next
// read to fall back to the database as usual.
func TestTopUpDoesNotResurrectConsumedQuotaFromCacheMiss(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)
	withTestRedisCache(t)

	insertPayPalUserForTest(t, 950, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-no-resurrect", 950, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-NO-RESURRECT"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	require.Equal(t, baseQuota, getPayPalUserQuotaForTest(t, 950))

	// Simulate recent consumption: the user has spent 30% of the quota.
	// Both the database and the cache move by the same -30% to keep them
	// in lock-step, mirroring the production consumption path which writes
	// both. The next topup is a fresh settlement; it must not invalidate
	// the cache, because that would force a rebuild from the database and
	// could in principle mask a cache that has more up-to-date consumption
	// data than the database snapshot the rebuild reads from.
	consumed := 3 * baseQuota / 10
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 950).
		Update("quota", gorm.Expr("quota - ?", consumed)).Error)
	require.NoError(t, cacheDecrUserQuota(950, int64(consumed)))
	cached, ok := readUserQuotaCacheOrMiss(t, 950)
	require.True(t, ok)
	require.Equal(t, baseQuota-consumed, cached, "post-consumption cache must equal post-consumption DB")

	// Now settle a second order. With the HINCRBY fast path the cache
	// becomes (baseQuota - consumed) + secondBaseQuota, exactly the same as
	// the database. The cache must NOT be invalidated and rebuilt from the
	// database, which would either re-read a stale value or race against
	// concurrent consumption.
	secondOrder := insertPendingTopUpForSettleTest(t, "ftu-no-resurrect-b", 950, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(secondOrder.TradeNo, "", "", "127.0.0.1", "CAP-NO-RESURRECT-B"))

	secondBaseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	assert.Equal(t, baseQuota-consumed+secondBaseQuota, getPayPalUserQuotaForTest(t, 950),
		"the database must hold the spent + new credit")
	cached, ok = readUserQuotaCacheOrMiss(t, 950)
	require.True(t, ok, "the HINCRBY must not delete the cache row")
	assert.Equal(t, baseQuota-consumed+secondBaseQuota, cached,
		"the cache must be in lock-step with the database after a HINCRBY topup, not invalidated and rebuilt from the database")
}

// TestRefundToNegativeBalanceCacheStaysConsistentWithDB verifies the brief:
// when a refund drops the user below zero, the cache hash is decremented by
// the deducted amount so that the cache and the database move in lock-step
// even past zero. Redis HINCRBY supports negative deltas natively; the
// production path does not need a separate code branch for the negative
// case.
func TestRefundToNegativeBalanceCacheStaysConsistentWithDB(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)
	withTestRedisCache(t)

	insertPayPalUserForTest(t, 951, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-refund-neg-cache", 951, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-REFUND-NEG-CACHE"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	require.Equal(t, baseQuota, getPayPalUserQuotaForTest(t, 951))
	primeUserQuotaCache(t, 951, baseQuota)

	// Spend it all so the refund must go negative.
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 951).Update("quota", 0).Error)
	require.NoError(t, cacheDecrUserQuota(951, int64(baseQuota)))
	cached, ok := readUserQuotaCacheOrMiss(t, 951)
	require.True(t, ok)
	require.Equal(t, 0, cached, "the user has spent all the quota and the cache reflects that")

	// The refund decrements both the database and the cache hash by the
	// full baseQuota; the cache ends at -baseQuota exactly in lock-step
	// with the database. A subsequent incremental consumption (which would
	// read Quota from the cache and apply another HINCRBY) therefore sees
	// the same value as a read from the database.
	deducted, err := RefundPayPalTopUp(order.TradeNo, baseQuota)
	require.NoError(t, err, "a refund that drops the user below zero must not be rejected")
	require.Equal(t, baseQuota, deducted)
	assert.Equal(t, -baseQuota, getPayPalUserQuotaForTest(t, 951), "database must hold the exact negative balance")
	cached, ok = readUserQuotaCacheOrMiss(t, 951)
	require.True(t, ok, "HINCRBY keeps the cache row even when the value goes negative")
	assert.Equal(t, -baseQuota, cached, "HINCRBY -baseQuota must leave the cache at -baseQuota, in lock-step with the database")

	// A pending batch increment of -consumed must also see the same value
	// whether it reads the database or the cache: this is the invariant the
	// consumption hot path depends on.
	consumed := 1000
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 951).
		Update("quota", gorm.Expr("quota - ?", consumed)).Error)
	require.NoError(t, cacheDecrUserQuota(951, int64(consumed)))
	assert.Equal(t, -baseQuota-consumed, getPayPalUserQuotaForTest(t, 951), "DB and cache must remain aligned after a consumption")
	cached, ok = readUserQuotaCacheOrMiss(t, 951)
	require.True(t, ok)
	assert.Equal(t, -baseQuota-consumed, cached, "the cache hash is the source of truth for any pending consumption batch")
}

// TestApplyPayPalSettlementEventIDReplayLeavesCacheAlone verifies that a
// duplicate EventID replay is a true no-op for both the database and the
// cache: deducted stays 0, the database row is untouched, and the user
// cache hash stays exactly as it was. The cache in this test is planted
// with a value that intentionally does NOT equal the database (it carries
// pending consumption that has not been flushed yet); a replay must
// preserve that pending value rather than rebuild the cache from the
// database and clobber it.
func TestApplyPayPalSettlementEventIDReplayLeavesCacheAlone(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)
	withTestRedisCache(t)

	insertPayPalUserForTest(t, 960, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-replay-eventid", 960, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-REPLAY-EVENTID"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	primeUserQuotaCache(t, 960, baseQuota)

	// First settlement runs the HINCRBY fast path, leaving cache = 0.
	in := baseSettlementInput(reloadTopUpForSettleTest(t, order.TradeNo), "EVT-REPLAY-EVID", "REFUND-REPLAY-EVID")
	deducted, err := ApplyPayPalSettlement(in)
	require.NoError(t, err)
	require.Equal(t, baseQuota, deducted)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 960))
	cached, ok := readUserQuotaCacheOrMiss(t, 960)
	require.True(t, ok)
	assert.Equal(t, 0, cached)

	// Plant a cache value that is INTENTIONALLY not equal to the database.
	// The brief asks us to verify the "pending consumption" case: the
	// database holds 0 (post-refund) while the cache carries a value that
	// reflects recent consumption that has not been batched into the DB.
	// A replay must leave this pending value alone, NOT clobber it with
	// a DB rebuild.
	require.NoError(t, InvalidateUserCache(960))
	pendingConsumed := 1234
	primeUserQuotaCache(t, 960, -pendingConsumed)
	cached, ok = readUserQuotaCacheOrMiss(t, 960)
	require.True(t, ok)
	require.Equal(t, -pendingConsumed, cached, "pending-batch cache value must be in place before the EventID replay")
	require.Equal(t, 0, getPayPalUserQuotaForTest(t, 960), "database stays at 0 (post-refund), deliberately behind the cache")

	// Replay: deducted stays at 0 (the no-op branch), the database row
	// stays at 0, and the cache hash stays at the pending value. No
	// invalidation, no user:0 placeholder touched.
	deducted, err = ApplyPayPalSettlement(in)
	require.NoError(t, err)
	assert.Equal(t, 0, deducted, "a duplicate EventID is a no-op at the deduction level")
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 960), "the database row must not move on replay")
	cached, ok = readUserQuotaCacheOrMiss(t, 960)
	require.True(t, ok, "the EventID replay must not delete the real user's cache")
	assert.Equal(t, -pendingConsumed, cached, "the EventID replay must leave the cache hash exactly as it was")
	_, ok = readUserQuotaCacheOrMiss(t, 0)
	assert.False(t, ok, "the EventID replay must not touch a user:0 placeholder")
}

// TestApplyPayPalSettlementResourceKeyReplayLeavesCacheAlone is the sibling
// version of the EventID replay test for the same-ResourceKey case. The
// replay takes the no-op path and must leave the user cache exactly as it
// was, even when the cache carries a pending-batch value that does not
// match the database.
func TestApplyPayPalSettlementResourceKeyReplayLeavesCacheAlone(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)
	withTestRedisCache(t)

	insertPayPalUserForTest(t, 961, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-replay-key", 961, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-REPLAY-KEY"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	primeUserQuotaCache(t, 961, baseQuota)

	// First settlement, with a refund id (so the resource key differs from
	// any future reversal's resource key).
	first := baseSettlementInput(reloadTopUpForSettleTest(t, order.TradeNo), "EVT-REPLAY-KEY-1", "REFUND-REPLAY-KEY-1")
	deducted, err := ApplyPayPalSettlement(first)
	require.NoError(t, err)
	require.Equal(t, baseQuota, deducted)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 961))
	cached, ok := readUserQuotaCacheOrMiss(t, 961)
	require.True(t, ok)
	assert.Equal(t, 0, cached)

	// Plant a cache value that intentionally does NOT match the database.
	require.NoError(t, InvalidateUserCache(961))
	pendingConsumed := 777
	primeUserQuotaCache(t, 961, -pendingConsumed)
	cached, ok = readUserQuotaCacheOrMiss(t, 961)
	require.True(t, ok)
	require.Equal(t, -pendingConsumed, cached, "pending-batch cache value must be in place before the Resource Key replay")

	// Replay: a different EventID but the same Resource Key under
	// PAYMENT.CAPTURE.REFUNDED. The no-op path is taken; the cache and
	// the database must both stay where they were.
	replay := baseSettlementInput(reloadTopUpForSettleTest(t, order.TradeNo), "EVT-REPLAY-KEY-2", "REFUND-REPLAY-KEY-1")
	deducted, err = ApplyPayPalSettlement(replay)
	require.NoError(t, err)
	assert.Equal(t, 0, deducted, "a Resource Key replay is a no-op at the deduction level")
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 961), "the database row must not move on replay")
	cached, ok = readUserQuotaCacheOrMiss(t, 961)
	require.True(t, ok, "the Resource Key replay must not delete the real user's cache")
	assert.Equal(t, -pendingConsumed, cached, "the Resource Key replay must leave the cache hash exactly as it was")
	_, ok = readUserQuotaCacheOrMiss(t, 0)
	assert.False(t, ok, "the Resource Key replay must not touch a user:0 placeholder")
}

// TestRefundAfterUserConsumedAllQuotaGoesNegative verifies the new contract:
// a refund is allowed to drop the user below zero (the user has already spent
// the quota they bought), and the only failure mode is a true int32 underflow.
// The cache must end up in lock-step with the database afterwards.
func TestRefundAfterUserConsumedAllQuotaGoesNegative(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)
	withTestRedisCache(t)

	insertPayPalUserForTest(t, 942, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-refund-negative", 942, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-REFUND-NEG"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	require.Equal(t, baseQuota, getPayPalUserQuotaForTest(t, 942))

	// The user has spent every unit they bought and is sitting at zero.
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 942).Update("quota", 0).Error)
	require.NoError(t, cacheDecrUserQuota(942, int64(baseQuota)))

	deducted, err := RefundPayPalTopUp(order.TradeNo, baseQuota)
	require.NoError(t, err, "a refund that drops the user below zero must not be rejected")
	require.Equal(t, baseQuota, deducted)
	assert.Equal(t, -baseQuota, getPayPalUserQuotaForTest(t, 942), "database must hold the exact negative balance")
	cached, ok := readUserQuotaCacheOrMiss(t, 942)
	require.True(t, ok, "HINCRBY keeps the cache row even when the value goes negative")
	assert.Equal(t, -baseQuota, cached, "the cache must agree with the database after the refund")

	// A duplicate refund must not deduct again.
	deducted, err = RefundPayPalTopUp(order.TradeNo, baseQuota)
	require.NoError(t, err)
	assert.Equal(t, 0, deducted, "a duplicate refund must not deduct again")
	assert.Equal(t, -baseQuota, getPayPalUserQuotaForTest(t, 942), "the negative balance must stay put")
}

// TestApplyPayPalSettlementAfterUserConsumedAllQuotaGoesNegative is the
// sibling version for the PayPal settlement ledger: the first call claws the
// entire credit back even though the user is at zero, the second call records
// its event but does not deduct.
func TestApplyPayPalSettlementAfterUserConsumedAllQuotaGoesNegative(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)
	withTestRedisCache(t)

	insertPayPalUserForTest(t, 943, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-settle-negative", 943, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-SETTLE-NEG"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)
	require.Equal(t, baseQuota, getPayPalUserQuotaForTest(t, 943))
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 943).Update("quota", 0).Error)
	require.NoError(t, cacheDecrUserQuota(943, int64(baseQuota)))

	in := baseSettlementInput(reloadTopUpForSettleTest(t, order.TradeNo), "EVT-SETTLE-NEG", "REFUND-SETTLE-NEG")
	deducted, err := ApplyPayPalSettlement(in)
	require.NoError(t, err, "settlement that drops the user below zero must not be rejected")
	require.Equal(t, baseQuota, deducted)
	assert.Equal(t, -baseQuota, getPayPalUserQuotaForTest(t, 943))
	cached, ok := readUserQuotaCacheOrMiss(t, 943)
	require.True(t, ok, "HINCRBY keeps the cache row even when the value goes negative")
	assert.Equal(t, -baseQuota, cached)

	// Replay: the duplicate event is recorded but does not deduct a second time.
	deducted, err = ApplyPayPalSettlement(in)
	require.NoError(t, err)
	assert.Equal(t, 0, deducted, "a duplicate event must not deduct again")
	assert.Equal(t, -baseQuota, getPayPalUserQuotaForTest(t, 943))
}

// TestReplayedRefundLeavesStaleCacheAlone is the post-9-round contract test
// for the cache during replay: a duplicate refund must be a true no-op
// for both the database and the cache. Even when the cache has been
// corrupted (e.g. by a manual operator edit, or by being rebuilt from a
// stale database snapshot), a replay is forbidden from "repairing" the
// cache by either invalidating it or by HINCRBY-ing a delta. A replay
// moves no quota, and that means it must move no cache hash either; any
// other cache policy would race against the production consumption path
// that batches HINCRBYs against the same user cache hash.
func TestReplayedRefundLeavesStaleCacheAlone(t *testing.T) {
	truncateTables(t)
	setFirstTopUpBonusForTest(t, 0)
	withTestRedisCache(t)

	insertPayPalUserForTest(t, 944, 0)
	order := insertPendingTopUpForSettleTest(t, "ftu-stale-cache", 944, PaymentProviderPayPal, 2, 9.99)
	require.NoError(t, RechargePayPal(order.TradeNo, "", "", "127.0.0.1", "CAP-STALE-CACHE"))

	baseQuota, err := common.QuotaFromFloatStrict(9.99 * common.QuotaPerUnit)
	require.NoError(t, err)

	// First, refund and let the HINCRBY put cache at 0.
	deducted, err := RefundPayPalTopUp(order.TradeNo, baseQuota)
	require.NoError(t, err)
	require.Equal(t, baseQuota, deducted)
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 944))
	cached, ok := readUserQuotaCacheOrMiss(t, 944)
	require.True(t, ok)
	require.Equal(t, 0, cached)

	// Plant a stale cache value to model a drift that survived the first
	// refund (e.g. a manual operator edit, or a cache that was rebuilt from
	// a database snapshot taken before the refund was applied).
	require.NoError(t, InvalidateUserCache(944))
	primeUserQuotaCache(t, 944, 10*baseQuota)
	cached, ok = readUserQuotaCacheOrMiss(t, 944)
	require.True(t, ok)
	require.Equal(t, 10*baseQuota, cached, "the stale seed must be in place before the replay")

	// Replay: deducted stays at 0 (the order is already refunded), the
	// database stays at 0, and the cache hash stays at the stale value.
	// The replay does NOT touch the cache; the value 10*baseQuota persists
	// across the replay exactly as it was. A production deployment is
	// expected to repair the cache through the consumption batch path
	// (HINCRBY writes) or through an explicit invalidation elsewhere,
	// not through a no-op replay.
	deducted, err = RefundPayPalTopUp(order.TradeNo, baseQuota)
	require.NoError(t, err)
	assert.Equal(t, 0, deducted, "the order is already refunded so nothing else is deducted")
	assert.Equal(t, 0, getPayPalUserQuotaForTest(t, 944), "the database row must not move on replay")
	cached, ok = readUserQuotaCacheOrMiss(t, 944)
	require.True(t, ok, "the replay must leave the cache row in place")
	assert.Equal(t, 10*baseQuota, cached, "the replay must leave the cache hash exactly as it was")
}

// ----------------------------------------------------------------------------
// Concurrent settlement test with two independent database connections
// ----------------------------------------------------------------------------

// openIsolatedTopUpSQLite opens a throwaway SQLite file with its own GORM
// handle, the maximum number of open connections set so the test can
// demonstrate real cross-connection race serialization. The shared package DB
// only allows one connection at a time, which makes the existing concurrency
// test pass on SQLite solely because of single-writer serialization, not the
// user row lock this contract actually depends on.
//
// The path is supplied so two independent handles (dbA and dbB) can target
// the same file, the way two processes would in production.
func openIsolatedTopUpSQLite(t *testing.T, path string) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", path)
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	// Two connections so the test can have two simultaneous transactions
	// rather than being serialized at the connection pool level.
	sqlDB.SetMaxOpenConns(2)
	sqlDB.SetMaxIdleConns(2)
	require.NoError(t, db.AutoMigrate(&TopUp{}, &User{}, &PayPalSettlementEvent{}))
	return db
}

// insertConcurrentUserAndOrders creates a user and two pending real top-up
// orders on the given DB handle.
func insertConcurrentUserAndOrders(t *testing.T, db *gorm.DB, userID int, tradeA, tradeB string) {
	t.Helper()
	require.NoError(t, db.Create(&User{
		Id: userID, Username: "concurrency_user", Status: common.UserStatusEnabled, Quota: 0,
	}).Error)
	now := time.Now().Unix()
	for _, tradeNo := range []string{tradeA, tradeB} {
		require.NoError(t, db.Model(&TopUp{}).Create(map[string]interface{}{
			"user_id":          userID,
			"amount":           5,
			"money":            5.0,
			"trade_no":         tradeNo,
			"payment_method":   PaymentProviderEpay,
			"payment_provider": PaymentProviderEpay,
			"transaction_id":   nil,
			"create_time":      now,
			"complete_time":    0,
			"status":           common.TopUpStatusPending,
		}).Error)
	}
}

// settleOnDB runs settleRealTopUpTx on the given *gorm.DB without ever
// touching the package-level DB global. It opens a real transaction on db,
// calls settleRealTopUpTx inside it, and returns the bonus quota plus the
// post-commit user quota. No global state is mutated, so the test is safe
// to run under -race and runs in lock-step with any other goroutine that
// happens to be touching the package DB.
//
// settleRealTopUp itself cannot be used here: it always uses the package DB
// via DB.Transaction. Calling settleRealTopUpTx directly is the only way to
// pin the work to a specific handle.
func settleOnDB(t *testing.T, db *gorm.DB, tradeNo string, provider string) (bonus int, postQuota int, err error) {
	t.Helper()
	var result *TopUpSettlement
	var user User
	txErr := db.Transaction(func(tx *gorm.DB) error {
		var innerErr error
		result, innerErr = settleRealTopUpTx(tx, topUpSettleSpec{tradeNo: tradeNo, provider: provider})
		if innerErr != nil {
			return innerErr
		}
		// Read the post-credit quota inside the same transaction so we
		// observe the row exactly as settleRealTopUpTx left it. The
		// production settleRealTopUp does the user-credit UPDATE inside
		// the same transaction, so the row state is authoritative here.
		if err := tx.Where("id = ?", result.UserId).First(&user).Error; err != nil {
			return err
		}
		return nil
	})
	if txErr != nil {
		return 0, 0, txErr
	}
	return result.BonusQuota, user.Quota, nil
}

// TestConcurrentFirstTopUpAcrossIndependentConnections exercises the
// cross-connection race the production code is designed to handle. Two
// independent GORM handles (each with its own connection pool, MaxOpenConns=2)
// settle two real top-up orders for the same user at the same time. The user
// row lock + status guard must produce exactly one BonusQuota and the right
// total quota, regardless of which order lands first.
//
// The test does not touch the package-level DB global: settleOnDB runs
// settleRealTopUpTx on a transaction bound to the supplied handle. A
// two-phase barrier waits for both goroutines to declare themselves ready
// before the test main releases them at the same instant, so the test does
// not degenerate into a one-sided execution where one goroutine runs well
// before the other.
//
// The test allows a small number of gateway-style retries: SQLite may return
// SQLITE_BUSY when two transactions try to write at the same time, so a
// bounded retry simulates the upstream PayPal/Stripe retry that production
// code already does. Each retry opens a fresh transaction on the same
// handle, so the lockForUpdate contract is re-evaluated on every attempt.
//
// Scope note: this test only proves the production business result under
// SQLite's connection-level serialization and SQLITE_BUSY retry. It does
// NOT prove that MySQL/PostgreSQL's SELECT ... FOR UPDATE row lock is what
// makes the first-top-up bonus unique; that is asserted by the unit tests
// of the settlement code path and exercised in production by the per-row
// lockForUpdate call in settleRealTopUpTx. The MySQL/PostgreSQL
// row-locking contract is owned by the GORM clauses emitted by
// model/locking.go, not by anything in this SQLite test.
func TestConcurrentFirstTopUpAcrossIndependentConnections(t *testing.T) {
	// Two GORM handles targeting the same SQLite file simulate two processes
	// hitting the same database at once. Each handle has its own connection
	// pool, so the user row lock is the only thing that serializes the two
	// concurrent settlements.
	dbPath := t.TempDir() + "/concurrent.db"
	dbA := openIsolatedTopUpSQLite(t, dbPath)
	dbB := openIsolatedTopUpSQLite(t, dbPath)
	insertConcurrentUserAndOrders(t, dbA, 950, "ftu-conc-a", "ftu-conc-b")

	// Pin QuotaForFirstTopUp locally so the test does not rely on whatever
	// another test left in the package global.
	previous := common.QuotaForFirstTopUp
	common.QuotaForFirstTopUp = 400000
	t.Cleanup(func() { common.QuotaForFirstTopUp = previous })

	tradeA := "ftu-conc-a"
	tradeB := "ftu-conc-b"

	var wg sync.WaitGroup
	results := make([]struct {
		bonus     int
		postQuota int
		err       error
	}, 2)

	// Two-phase barrier: each goroutine signals "ready" (it has set up its
	// local state, scheduled itself, and is about to block on start). The
	// test main waits for both ready signals before closing start, so the
	// race begins at a single instant.
	ready := make(chan struct{}, 2)
	start := make(chan struct{})
	retry := func(label string, idx int, db *gorm.DB, tradeNo string, provider string) {
		ready <- struct{}{}
		<-start
		// No sleep, no random: only retry on SQLITE_BUSY, which the
		// SQLite driver returns as a gorm.ErrInvalidTransaction or as a
		// raw sqlite busy error. Production code (controller layer)
		// would retry; this test mirrors that with a deterministic
		// bounded retry.
		for attempt := 0; attempt < 8; attempt++ {
			bonus, postQuota, err := settleOnDB(t, db, tradeNo, provider)
			if err == nil {
				results[idx] = struct {
					bonus     int
					postQuota int
					err       error
				}{bonus, postQuota, nil}
				return
			}
			if !isRetryableConcurrentSettleError(err) {
				results[idx] = struct {
					bonus     int
					postQuota int
					err       error
				}{0, 0, fmt.Errorf("%s attempt %d: %w", label, attempt, err)}
				return
			}
		}
		results[idx] = struct {
			bonus     int
			postQuota int
			err       error
		}{0, 0, fmt.Errorf("%s exhausted retries", label)}
	}

	wg.Add(2)
	go func() { defer wg.Done(); retry("A", 0, dbA, tradeA, PaymentProviderEpay) }()
	go func() { defer wg.Done(); retry("B", 1, dbB, tradeB, PaymentProviderEpay) }()
	// Both goroutines block on <-start as soon as they finish their setup.
	// Wait for both ready signals before closing start, so the race is
	// released at a single instant.
	<-ready
	<-ready
	close(start)
	wg.Wait()
	require.NoError(t, results[0].err)
	require.NoError(t, results[1].err)

	// Re-read from one of the two DBs (they share the same file).
	var aTopUp, bTopUp TopUp
	require.NoError(t, dbA.Where("trade_no = ?", tradeA).First(&aTopUp).Error)
	require.NoError(t, dbA.Where("trade_no = ?", tradeB).First(&bTopUp).Error)
	require.Equal(t, common.TopUpStatusSuccess, aTopUp.Status)
	require.Equal(t, common.TopUpStatusSuccess, bTopUp.Status)

	bonusTotal := aTopUp.BonusQuota + bTopUp.BonusQuota
	// Whichever order won the user row lock first, only one must carry the
	// bonus. The other must be credited only its own base quota.
	assert.Equal(t, 400000, bonusTotal, "exactly one order may carry the first top-up bonus, regardless of which arrived first")

	var user User
	require.NoError(t, dbA.Select("quota").Where("id = ?", 950).First(&user).Error)
	expectedTotal := 2*(5*int(common.QuotaPerUnit)) + 400000
	assert.Equal(t, expectedTotal, user.Quota, "the user must end with both orders' base quota plus exactly one bonus")
}

func isRetryableConcurrentSettleError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	if strings.Contains(msg, "database is locked") {
		return true
	}
	if strings.Contains(msg, "SQLITE_BUSY") {
		return true
	}
	if errors.Is(err, gorm.ErrInvalidTransaction) {
		return true
	}
	return false
}
