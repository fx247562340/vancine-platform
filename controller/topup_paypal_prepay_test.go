/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package controller

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type paypalRequestLog struct {
	mu      sync.Mutex
	paths   []string
	bodies  [][]byte
	blocked bool
}

func (l *paypalRequestLog) count() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.paths)
}

func (l *paypalRequestLog) pathList() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]string, len(l.paths))
	copy(out, l.paths)
	return out
}

func isolatePayPalHTTP(t *testing.T, handler http.HandlerFunc) *paypalRequestLog {
	t.Helper()
	log := &paypalRequestLog{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = r.Body.Close()
		log.mu.Lock()
		log.paths = append(log.paths, r.URL.Path)
		log.bodies = append(log.bodies, body)
		blocked := log.blocked
		log.mu.Unlock()
		if blocked {
			http.Error(w, "isolated paypal must not be reached", http.StatusForbidden)
			return
		}
		r.Body = io.NopCloser(strings.NewReader(string(body)))
		handler(w, r)
	}))
	t.Cleanup(server.Close)

	origBase := paypalAPIBase
	origClient := paypalHTTPClient
	paypalAPIBase = func() string { return server.URL }
	paypalHTTPClient = server.Client()
	t.Cleanup(func() {
		paypalAPIBase = origBase
		paypalHTTPClient = origClient
	})

	tokenCache.mu.Lock()
	origToken := tokenCache.accessToken
	origExpires := tokenCache.expiresAt
	origMode := tokenCache.testMode
	tokenCache.accessToken = ""
	tokenCache.expiresAt = time.Time{}
	tokenCache.testMode = setting.PayPalTestMode
	tokenCache.mu.Unlock()
	t.Cleanup(func() {
		tokenCache.mu.Lock()
		tokenCache.accessToken = origToken
		tokenCache.expiresAt = origExpires
		tokenCache.testMode = origMode
		tokenCache.mu.Unlock()
	})
	return log
}

func paypalOAuthAndOrderFixture(t *testing.T, orderID string) http.HandlerFunc {
	t.Helper()
	orderBody := payPalApproveOrderResponse(t, orderID)
	return func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/v1/oauth2/token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"prepay-oauth-token","expires_in":3600}`))
		case r.URL.Path == "/v2/checkout/orders" && r.Method == http.MethodPost:
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write(orderBody)
		default:
			http.Error(w, "unexpected paypal path "+r.URL.Path, http.StatusNotFound)
		}
	}
}

func setupPayPalPrePayEnv(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	origDB := model.DB
	origQuotaPerUnit := common.QuotaPerUnit
	origPayPalEnabled := setting.PayPalEnabled
	origClientId := setting.PayPalClientId
	origSecret := setting.PayPalClientSecret
	origSandboxClientId := setting.PayPalSandboxClientId
	origSandboxSecret := setting.PayPalSandboxClientSecret
	origTestMode := setting.PayPalTestMode
	origCompliance := operation_setting.GetPaymentSetting().ComplianceConfirmed
	origTerms := operation_setting.GetPaymentSetting().ComplianceTermsVersion
	origDiscount := operation_setting.GetPaymentSetting().AmountDiscount

	db, err := gorm.Open(sqlite.Open("file:paypal_prepay_"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.TopUp{}, &model.Log{}, &model.PayPalSettlementEvent{}))

	setting.PayPalTestMode = false
	setting.PayPalEnabled = true
	setting.PayPalClientId = "prepay-test-client-id"
	setting.PayPalClientSecret = "prepay-test-client-secret"
	paySetting := operation_setting.GetPaymentSetting()
	paySetting.ComplianceConfirmed = true
	paySetting.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
	paySetting.AmountDiscount = map[int]float64{}

	t.Cleanup(func() {
		model.DB = origDB
		common.QuotaPerUnit = origQuotaPerUnit
		setting.PayPalEnabled = origPayPalEnabled
		setting.PayPalClientId = origClientId
		setting.PayPalClientSecret = origSecret
		setting.PayPalSandboxClientId = origSandboxClientId
		setting.PayPalSandboxClientSecret = origSandboxSecret
		setting.PayPalTestMode = origTestMode
		operation_setting.GetPaymentSetting().ComplianceConfirmed = origCompliance
		operation_setting.GetPaymentSetting().ComplianceTermsVersion = origTerms
		operation_setting.GetPaymentSetting().AmountDiscount = origDiscount
		if sqlDB, dbErr := db.DB(); dbErr == nil {
			_ = sqlDB.Close()
		}
	})
}

func paypalPrePayUser(t *testing.T, id int, quota int) {
	t.Helper()
	require.NoError(t, model.DB.Create(&model.User{
		Id:       id,
		Username: "paypal_prepay_user_" + t.Name(),
		Status:   common.UserStatusEnabled,
		Quota:    quota,
		AffCode:  "ppx",
	}).Error)
}

func paypalPrePayRequest(t *testing.T, userId int, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", userId)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/paypal/pay", strings.NewReader(body))
	ctx.Request.Header.Set("Content-Type", "application/json")
	RequestPayPalPay(ctx)
	return recorder
}

func TestPayPalRequestPayRejectsWalletAtCapacityBeforeCharging(t *testing.T) {
	setupPayPalPrePayEnv(t)
	common.QuotaPerUnit = 500000
	paypalPrePayUser(t, 771, common.MaxWalletQuota)
	log := isolatePayPalHTTP(t, paypalOAuthAndOrderFixture(t, "should-not-create"))
	log.blocked = true

	recorder := paypalPrePayRequest(t, 771, `{"amount":10,"payment_method":"paypal"}`)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "top-up quota limit exceeded")

	var count int64
	require.NoError(t, model.DB.Model(&model.TopUp{}).Where("user_id = ?", 771).Count(&count).Error)
	assert.Zero(t, count, "rejected pre-payment must not persist an order")
	assert.Zero(t, log.count(), "rejected pre-payment must not call PayPal")
}

func TestPayPalRequestPayRejectsAmountBeyondWalletCeiling(t *testing.T) {
	setupPayPalPrePayEnv(t)
	common.QuotaPerUnit = float64(common.MaxWalletQuota)
	paypalPrePayUser(t, 772, 0)
	log := isolatePayPalHTTP(t, paypalOAuthAndOrderFixture(t, "should-not-create"))
	log.blocked = true

	recorder := paypalPrePayRequest(t, 772, `{"amount":10,"payment_method":"paypal"}`)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "error")

	var count int64
	require.NoError(t, model.DB.Model(&model.TopUp{}).Where("user_id = ?", 772).Count(&count).Error)
	assert.Zero(t, count)
	assert.Zero(t, log.count(), "overflow refusal must not call PayPal")
}

func TestPayPalRequestPayAllowsQuotaAboveMaxQuotaBelowWalletCeiling(t *testing.T) {
	setupPayPalPrePayEnv(t)
	common.QuotaPerUnit = 500000
	paypalPrePayUser(t, 774, 0)
	log := isolatePayPalHTTP(t, paypalOAuthAndOrderFixture(t, "ORDER-ABOVE-MAXQUOTA"))

	// 4300 * 500000 = 2_150_000_000, which is MaxQuota+2_516_352 and still below MaxWalletQuota.
	recorder := paypalPrePayRequest(t, 774, `{"amount":4300,"payment_method":"paypal"}`)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "success")
	assert.Contains(t, recorder.Body.String(), "ORDER-ABOVE-MAXQUOTA")

	var order model.TopUp
	require.NoError(t, model.DB.Where("user_id = ?", 774).First(&order).Error)
	assert.EqualValues(t, 4300, order.Amount)
	assert.Equal(t, []string{"/v1/oauth2/token", "/v2/checkout/orders"}, log.pathList())
}

func TestPayPalRequestPayAllowsInCapacityWalletAndCreatesIsolatedOrder(t *testing.T) {
	setupPayPalPrePayEnv(t)
	common.QuotaPerUnit = 500000
	paypalPrePayUser(t, 773, common.MaxWalletQuota-2_000_000_000)
	log := isolatePayPalHTTP(t, paypalOAuthAndOrderFixture(t, "ORDER-IN-CAPACITY"))

	recorder := paypalPrePayRequest(t, 773, `{"amount":10,"payment_method":"paypal"}`)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.NotContains(t, recorder.Body.String(), "top-up quota limit exceeded")
	assert.Contains(t, recorder.Body.String(), "success")
	assert.Contains(t, recorder.Body.String(), "ORDER-IN-CAPACITY")

	var order model.TopUp
	require.NoError(t, model.DB.Where("user_id = ?", 773).First(&order).Error)
	assert.EqualValues(t, 10, order.Amount)
	assert.InDelta(t, 10, order.Money, 0.001)
	assert.Equal(t, "ORDER-IN-CAPACITY", order.PaymentId)
	assert.Equal(t, common.TopUpStatusPending, order.Status)

	paths := log.pathList()
	require.Equal(t, []string{"/v1/oauth2/token", "/v2/checkout/orders"}, paths, "in-capacity pay must hit OAuth then create-order exactly once each")

	var createBody map[string]any
	require.NoError(t, common.Unmarshal(log.bodies[1], &createBody))
	units, _ := createBody["purchase_units"].([]any)
	require.NotEmpty(t, units)
	unit, _ := units[0].(map[string]any)
	amount, _ := unit["amount"].(map[string]any)
	assert.Equal(t, "10.00", amount["value"])
}
