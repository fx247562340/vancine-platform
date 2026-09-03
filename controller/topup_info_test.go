package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// callGetTopUpInfo invokes the real GetTopUpInfo handler and decodes the
// ApiSuccess envelope.
func callGetTopUpInfo(t *testing.T) map[string]interface{} {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/user/topup/info", nil)

	GetTopUpInfo(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	var envelope struct {
		Success bool                   `json:"success"`
		Message string                 `json:"message"`
		Data    map[string]interface{} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &envelope))
	require.True(t, envelope.Success)
	require.NotNil(t, envelope.Data)
	return envelope.Data
}

// callGetTopUpInfoAsUser runs the topup info handler as the supplied user id.
// middleware.UserAuth sets c.Set("id", userId) before this handler runs, so we
// mirror the same key here. A real User row is required by the eligibility
// predicate; insertTopUpUserForTopupInfoTest is the local fixture.
func callGetTopUpInfoAsUser(t *testing.T, userID int) map[string]interface{} {
	t.Helper()
	insertTopUpUserForTopupInfoTest(t, userID)
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/user/topup/info", nil)
	c.Set("id", userID)

	GetTopUpInfo(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	var envelope struct {
		Success bool                   `json:"success"`
		Message string                 `json:"message"`
		Data    map[string]interface{} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &envelope))
	require.True(t, envelope.Success)
	require.NotNil(t, envelope.Data)
	return envelope.Data
}

// withPayPalMinTopup swaps setting.PayPalMinTopUp for the duration of a test
// and restores it exactly on cleanup.
func withPayPalMinTopup(t *testing.T, value int) {
	t.Helper()
	previous := setting.PayPalMinTopUp
	setting.PayPalMinTopUp = value
	t.Cleanup(func() {
		setting.PayPalMinTopUp = previous
	})
}

func TestGetTopUpInfoReturnsConfiguredPayPalMinTopup(t *testing.T) {
	withPayPalMinTopup(t, 7)

	data := callGetTopUpInfo(t)

	raw, present := data["paypal_min_topup"]
	require.True(t, present, "paypal_min_topup must be part of the topup info contract")
	value, isNumber := raw.(float64)
	require.True(t, isNumber, "paypal_min_topup must be a JSON number, got %T", raw)
	assert.Equal(t, float64(7), value)
	// The advertised minimum must be exactly the value the PayPal amount
	// endpoints enforce, with no second fallback constant.
	assert.Equal(t, float64(getPayPalMinTopup()), value)
}

func TestGetTopUpInfoPayPalMinTopupFallsBackLikeServerValidation(t *testing.T) {
	for _, configured := range []int{0, -3} {
		t.Run(fmt.Sprintf("configured_%d", configured), func(t *testing.T) {
			withPayPalMinTopup(t, configured)

			data := callGetTopUpInfo(t)

			raw, present := data["paypal_min_topup"]
			require.True(t, present)
			value, isNumber := raw.(float64)
			require.True(t, isNumber, "paypal_min_topup must be a JSON number, got %T", raw)
			// A non-positive configuration must never be advertised as 0
			// (which the backend would then reject); the response must match
			// the server-side effective minimum exactly.
			assert.Equal(t, float64(getPayPalMinTopup()), value)
			assert.Greater(t, value, float64(0))
		})
	}
}

func TestGetTopUpInfoKeepsExistingPaymentContracts(t *testing.T) {
	withPayPalMinTopup(t, 5)

	data := callGetTopUpInfo(t)

	for _, field := range []string{
		"enable_online_topup",
		"enable_stripe_topup",
		"enable_creem_topup",
		"enable_paypal_topup",
		"enable_waffo_topup",
		"enable_waffo_pancake_topup",
		"enable_redemption",
		"payment_compliance_confirmed",
		"pay_methods",
		"min_topup",
		"stripe_min_topup",
		"waffo_min_topup",
		"waffo_pancake_min_topup",
		"amount_options",
		"discount",
		"topup_link",
		"first_topup_bonus_quota",
		"first_topup_bonus_eligible",
	} {
		assert.Contains(t, data, field, "existing field %s must be preserved", field)
	}
}

// withFirstTopUpBonusForTest configures the promotion for one test and
// restores the previous value afterwards, so the global option never leaks
// between tests.
func withFirstTopUpBonusForTest(t *testing.T, quota int) {
	t.Helper()
	previous := common.QuotaForFirstTopUp
	common.QuotaForFirstTopUp = quota
	t.Cleanup(func() { common.QuotaForFirstTopUp = previous })
}

// setupTopupInfoTest spins up a fresh in-memory SQLite database with the
// minimum tables the first top-up bonus eligibility predicate needs. Each
// test gets a clean DB, so user/history rows cannot leak between tests.
func setupTopupInfoTest(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	origDB := model.DB
	origMainDB := common.MainDatabaseType()
	origRedis := common.RedisEnabled

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	t.Cleanup(func() {
		_ = sqlDB.Close()
		model.DB = origDB
		common.SetMainDatabaseType(origMainDB)
		common.RedisEnabled = origRedis
	})

	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.TopUp{},
		&model.Option{},
	))
	model.DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
}

// insertTopUpUserForTopupInfoTest creates an enabled user with the given id
// and zero quota. The first top-up bonus eligibility check only needs the
// user id to be present; the test layer is not the place to reimplement
// registration defaults.
func insertTopUpUserForTopupInfoTest(t *testing.T, id int) {
	t.Helper()
	user := &model.User{
		Id:       id,
		Username: fmt.Sprintf("topup_info_test_user_%d", id),
		Status:   common.UserStatusEnabled,
		Quota:    0,
		AffCode:  fmt.Sprintf("topup_info_aff_%d", id),
	}
	require.NoError(t, model.DB.Create(user).Error)
}

// insertTopUpHistoryForTopupInfoTest records a historical top-up row directly,
// without going through any settlement path. payment_provider empty + amount
// 0 is a non-real row (subscription/balance); the other combinations cover
// the other read-only cases.
func insertTopUpHistoryForTopupInfoTest(t *testing.T, tradeNo string, userID int, provider string, amount int64, status string) {
	t.Helper()
	now := time.Now().Unix()
	require.NoError(t, model.DB.Model(&model.TopUp{}).Create(map[string]interface{}{
		"user_id":          userID,
		"amount":           amount,
		"money":            float64(amount),
		"trade_no":         tradeNo,
		"payment_method":   provider,
		"payment_provider": provider,
		"transaction_id":   nil,
		"create_time":      now,
		"complete_time":    now,
		"status":           status,
	}).Error)
}

func TestGetTopUpInfoExposesFirstTopUpBonusQuota(t *testing.T) {
	setupTopupInfoTest(t)
	withFirstTopUpBonusForTest(t, 0)

	data := callGetTopUpInfoAsUser(t, 8201)

	raw, present := data["first_topup_bonus_quota"]
	require.True(t, present, "first_topup_bonus_quota must always be part of the response")
	value, isNumber := raw.(float64)
	require.True(t, isNumber, "first_topup_bonus_quota must be a JSON number, got %T", raw)
	assert.Equal(t, float64(0), value, "disabled promotion must be reported as 0")
	// Zero config means the promotion is off: the user is never eligible,
	// even without any top-up history.
	assert.Equal(t, false, data["first_topup_bonus_eligible"], "zero config must collapse eligibility to false")
}

func TestGetTopUpInfoExposesFirstTopUpBonusQuotaWhenConfigured(t *testing.T) {
	setupTopupInfoTest(t)
	withFirstTopUpBonusForTest(t, 500000)

	data := callGetTopUpInfoAsUser(t, 8202)

	raw, present := data["first_topup_bonus_quota"]
	require.True(t, present)
	value, isNumber := raw.(float64)
	require.True(t, isNumber)
	assert.Equal(t, float64(500000), value, "the configured quota must be served verbatim")
	assert.Equal(t, true, data["first_topup_bonus_eligible"])
}

func TestGetTopUpInfoFirstTopUpBonusEligibilitySuccessConsumes(t *testing.T) {
	setupTopupInfoTest(t)
	withFirstTopUpBonusForTest(t, 500000)
	insertTopUpHistoryForTopupInfoTest(t, "ftu-info-success", 8203, model.PaymentProviderEpay, 5, common.TopUpStatusSuccess)

	data := callGetTopUpInfoAsUser(t, 8203)

	assert.Equal(t, false, data["first_topup_bonus_eligible"], "a successful first top-up must mark the user ineligible")
}

func TestGetTopUpInfoFirstTopUpBonusEligibilityRefundedConsumes(t *testing.T) {
	setupTopupInfoTest(t)
	withFirstTopUpBonusForTest(t, 500000)
	insertTopUpHistoryForTopupInfoTest(t, "ftu-info-refunded", 8204, model.PaymentProviderStripe, 5, common.TopUpStatusRefunded)

	data := callGetTopUpInfoAsUser(t, 8204)

	assert.Equal(t, false, data["first_topup_bonus_eligible"], "a refunded first top-up must still consume the qualification")
}

func TestGetTopUpInfoFirstTopUpBonusEligibilityPendingDoesNotConsume(t *testing.T) {
	setupTopupInfoTest(t)
	withFirstTopUpBonusForTest(t, 500000)
	insertTopUpHistoryForTopupInfoTest(t, "ftu-info-pending", 8205, model.PaymentProviderEpay, 5, common.TopUpStatusPending)

	data := callGetTopUpInfoAsUser(t, 8205)

	assert.Equal(t, true, data["first_topup_bonus_eligible"])
}

func TestGetTopUpInfoFirstTopUpBonusEligibilityZeroConfigHides(t *testing.T) {
	setupTopupInfoTest(t)
	withFirstTopUpBonusForTest(t, 0)
	// Even with a successful history, the disabled promotion must never
	// report eligible=true: the page hides the bonus block and the
	// settlement does not grant one.
	insertTopUpHistoryForTopupInfoTest(t, "ftu-info-zero-cfg", 8206, model.PaymentProviderEpay, 5, common.TopUpStatusSuccess)

	data := callGetTopUpInfoAsUser(t, 8206)

	raw, present := data["first_topup_bonus_quota"]
	require.True(t, present)
	assert.Equal(t, float64(0), raw)
	assert.Equal(t, false, data["first_topup_bonus_eligible"], "zero config must collapse eligibility to false")
}

func TestGetTopUpInfoFirstTopUpBonusEligibilityOutOfRangeHides(t *testing.T) {
	setupTopupInfoTest(t)
	withFirstTopUpBonusForTest(t, common.MaxQuota+1)

	data := callGetTopUpInfoAsUser(t, 8207)

	raw, present := data["first_topup_bonus_quota"]
	require.True(t, present)
	assert.Equal(t, float64(common.MaxQuota+1), raw, "the raw value is still reported, so the client can show a clear empty state")
	assert.Equal(t, false, data["first_topup_bonus_eligible"], "out-of-range config must collapse eligibility to false")
}

func TestGetTopUpInfoFirstTopUpBonusEligibilityNoUserIDDefaultsFalse(t *testing.T) {
	setupTopupInfoTest(t)
	withFirstTopUpBonusForTest(t, 500000)

	data := callGetTopUpInfo(t)

	assert.Equal(t, false, data["first_topup_bonus_eligible"], "missing user id must never report eligible=true; the settlement transaction is the only authority")
}

func TestGetTopUpInfoFirstTopUpBonusEligibilityQueryFailureFailsClosed(t *testing.T) {
	setupTopupInfoTest(t)
	withFirstTopUpBonusForTest(t, 500000)
	userID := 8208

	// Break the history probe by dropping the top_ups table so the COUNT
	// fails. The endpoint must NOT fail: the bonus hint collapses to
	// eligible=false and every other payment field is still served.
	require.NoError(t, model.DB.Migrator().DropTable(&model.TopUp{}))

	data := callGetTopUpInfoAsUser(t, userID)

	assert.Equal(t, false, data["first_topup_bonus_eligible"], "a failed history query must report not eligible, never eligible")
	assert.Equal(t, float64(500000), data["first_topup_bonus_quota"])
	// The rest of the topup info contract survives the failed hint.
	assert.Contains(t, data, "min_topup")
	assert.Contains(t, data, "pay_methods")
	assert.Contains(t, data, "amount_options")
	assert.Contains(t, data, "topup_link")
}
