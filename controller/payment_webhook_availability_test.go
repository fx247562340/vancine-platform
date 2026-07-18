package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func confirmPaymentComplianceForTest(t *testing.T) {
	t.Helper()
	paymentSetting := operation_setting.GetPaymentSetting()
	originalConfirmed := paymentSetting.ComplianceConfirmed
	originalTermsVersion := paymentSetting.ComplianceTermsVersion
	t.Cleanup(func() {
		paymentSetting.ComplianceConfirmed = originalConfirmed
		paymentSetting.ComplianceTermsVersion = originalTermsVersion
	})
	paymentSetting.ComplianceConfirmed = true
	paymentSetting.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
}

func TestStripeWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalAPISecret := setting.StripeApiSecret
	originalWebhookSecret := setting.StripeWebhookSecret
	originalPriceID := setting.StripePriceId
	t.Cleanup(func() {
		setting.StripeApiSecret = originalAPISecret
		setting.StripeWebhookSecret = originalWebhookSecret
		setting.StripePriceId = originalPriceID
	})

	setting.StripeWebhookSecret = ""
	setting.StripeApiSecret = "sk_test_123"
	setting.StripePriceId = "price_123"
	require.False(t, isStripeWebhookEnabled())

	setting.StripeWebhookSecret = "whsec_test"
	require.True(t, isStripeWebhookEnabled())

	setting.StripePriceId = ""
	require.False(t, isStripeWebhookEnabled())
}

func TestCreemWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalAPIKey := setting.CreemApiKey
	originalProducts := setting.CreemProducts
	originalWebhookSecret := setting.CreemWebhookSecret
	t.Cleanup(func() {
		setting.CreemApiKey = originalAPIKey
		setting.CreemProducts = originalProducts
		setting.CreemWebhookSecret = originalWebhookSecret
	})

	setting.CreemWebhookSecret = ""
	setting.CreemApiKey = "creem_api_key"
	setting.CreemProducts = `[{"productId":"prod_123"}]`
	require.False(t, isCreemWebhookEnabled())

	setting.CreemWebhookSecret = "creem_secret"
	require.True(t, isCreemWebhookEnabled())

	setting.CreemProducts = "[]"
	require.False(t, isCreemWebhookEnabled())
}

func TestWaffoWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalEnabled := setting.WaffoEnabled
	originalSandbox := setting.WaffoSandbox
	originalAPIKey := setting.WaffoApiKey
	originalPrivateKey := setting.WaffoPrivateKey
	originalPublicCert := setting.WaffoPublicCert
	originalSandboxAPIKey := setting.WaffoSandboxApiKey
	originalSandboxPrivateKey := setting.WaffoSandboxPrivateKey
	originalSandboxPublicCert := setting.WaffoSandboxPublicCert
	t.Cleanup(func() {
		setting.WaffoEnabled = originalEnabled
		setting.WaffoSandbox = originalSandbox
		setting.WaffoApiKey = originalAPIKey
		setting.WaffoPrivateKey = originalPrivateKey
		setting.WaffoPublicCert = originalPublicCert
		setting.WaffoSandboxApiKey = originalSandboxAPIKey
		setting.WaffoSandboxPrivateKey = originalSandboxPrivateKey
		setting.WaffoSandboxPublicCert = originalSandboxPublicCert
	})

	setting.WaffoEnabled = true
	setting.WaffoSandbox = false
	setting.WaffoApiKey = ""
	setting.WaffoPrivateKey = "private"
	setting.WaffoPublicCert = "public"
	require.False(t, isWaffoWebhookEnabled())

	setting.WaffoApiKey = "api"
	require.True(t, isWaffoWebhookEnabled())

	setting.WaffoEnabled = false
	require.False(t, isWaffoWebhookEnabled())

	setting.WaffoEnabled = true
	setting.WaffoSandbox = true
	setting.WaffoSandboxApiKey = ""
	setting.WaffoSandboxPrivateKey = "sandbox_private"
	setting.WaffoSandboxPublicCert = "sandbox_public"
	require.False(t, isWaffoWebhookEnabled())

	setting.WaffoSandboxApiKey = "sandbox_api"
	require.True(t, isWaffoWebhookEnabled())
}

func TestWaffoPancakeWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalMerchantID := setting.WaffoPancakeMerchantID
	originalPrivateKey := setting.WaffoPancakePrivateKey
	originalProductID := setting.WaffoPancakeProductID
	t.Cleanup(func() {
		setting.WaffoPancakeMerchantID = originalMerchantID
		setting.WaffoPancakePrivateKey = originalPrivateKey
		setting.WaffoPancakeProductID = originalProductID
	})

	// Presence of all three credentials enables the gateway. Webhook public
	// keys are bundled in the SDK and there is no separate Enabled toggle —
	// clear any of the three fields to disable.
	setting.WaffoPancakeMerchantID = ""
	setting.WaffoPancakePrivateKey = "private"
	setting.WaffoPancakeProductID = "product"
	require.False(t, isWaffoPancakeWebhookEnabled())

	setting.WaffoPancakeMerchantID = "merchant"
	require.True(t, isWaffoPancakeWebhookEnabled())

	setting.WaffoPancakeProductID = ""
	require.False(t, isWaffoPancakeWebhookEnabled())

	setting.WaffoPancakeProductID = "product"
	setting.WaffoPancakePrivateKey = ""
	require.False(t, isWaffoPancakeWebhookEnabled())
}

func TestEpayWebhookEnabledRequiresTopUpAndWebhookConfig(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	originalPayAddress := operation_setting.PayAddress
	originalEpayID := operation_setting.EpayId
	originalEpayKey := operation_setting.EpayKey
	originalPayMethods := operation_setting.PayMethods
	t.Cleanup(func() {
		operation_setting.PayAddress = originalPayAddress
		operation_setting.EpayId = originalEpayID
		operation_setting.EpayKey = originalEpayKey
		operation_setting.PayMethods = originalPayMethods
	})

	operation_setting.PayAddress = "https://pay.example.com"
	operation_setting.EpayId = "epay_id"
	operation_setting.EpayKey = ""
	operation_setting.PayMethods = []map[string]string{{"type": "alipay"}}
	require.False(t, isEpayWebhookEnabled())

	operation_setting.EpayKey = "epay_key"
	require.True(t, isEpayWebhookEnabled())

	operation_setting.PayMethods = nil
	require.False(t, isEpayWebhookEnabled())
}

// setPayPalConfigForTest pins the PayPal gateway state for the duration of a
// test. It controls the three conditions that gate new checkout: the enabled
// flag, payment compliance, and presence of the active-mode credentials.
func setPayPalConfigForTest(t *testing.T, enabled, complianceConfirmed, credsPresent bool) {
	t.Helper()
	paymentSetting := operation_setting.GetPaymentSetting()
	origConfirmed := paymentSetting.ComplianceConfirmed
	origVersion := paymentSetting.ComplianceTermsVersion
	t.Cleanup(func() {
		paymentSetting.ComplianceConfirmed = origConfirmed
		paymentSetting.ComplianceTermsVersion = origVersion
	})
	paymentSetting.ComplianceConfirmed = complianceConfirmed
	if complianceConfirmed {
		paymentSetting.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
	} else {
		paymentSetting.ComplianceTermsVersion = ""
	}

	origEnabled := setting.PayPalEnabled
	origTestMode := setting.PayPalTestMode
	origClientID := setting.PayPalClientId
	origClientSecret := setting.PayPalClientSecret
	origSandboxClientID := setting.PayPalSandboxClientId
	origSandboxClientSecret := setting.PayPalSandboxClientSecret
	t.Cleanup(func() {
		setting.PayPalEnabled = origEnabled
		setting.PayPalTestMode = origTestMode
		setting.PayPalClientId = origClientID
		setting.PayPalClientSecret = origClientSecret
		setting.PayPalSandboxClientId = origSandboxClientID
		setting.PayPalSandboxClientSecret = origSandboxClientSecret
	})
	setting.PayPalTestMode = false
	setting.PayPalEnabled = enabled
	if credsPresent {
		setting.PayPalClientId = "test-client-id"
		setting.PayPalClientSecret = "test-client-secret"
	} else {
		setting.PayPalClientId = ""
		setting.PayPalClientSecret = ""
	}
}

func TestPayPalTopUpEnabled(t *testing.T) {
	t.Run("disabled flag blocks", func(t *testing.T) {
		setPayPalConfigForTest(t, false, true, true)
		require.False(t, isPayPalTopUpEnabled())
	})
	t.Run("compliance unconfirmed blocks", func(t *testing.T) {
		setPayPalConfigForTest(t, true, false, true)
		require.False(t, isPayPalTopUpEnabled())
	})
	t.Run("missing credentials block", func(t *testing.T) {
		setPayPalConfigForTest(t, true, true, false)
		require.False(t, isPayPalTopUpEnabled())
	})
	t.Run("fully configured enables", func(t *testing.T) {
		setPayPalConfigForTest(t, true, true, true)
		require.True(t, isPayPalTopUpEnabled())
	})
}

func TestRequestPayPalAmount(t *testing.T) {
	cases := []struct {
		name                string
		enabled             bool
		complianceConfirmed bool
		credsPresent        bool
	}{
		{"rejects when PayPal disabled", false, true, true},
		{"rejects when compliance unconfirmed", true, false, true},
		{"rejects when credentials missing", true, true, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			setPayPalConfigForTest(t, tc.enabled, tc.complianceConfirmed, tc.credsPresent)

			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("POST", "/api/paypal/amount", strings.NewReader(`{"amount":10,"payment_method":"paypal"}`))
			c.Request.Header.Set("Content-Type", "application/json")
			RequestPayPalAmount(c)

			require.Equal(t, http.StatusOK, w.Code)
			var resp map[string]interface{}
			require.NoError(t, common.Unmarshal(w.Body.Bytes(), &resp))
			assert.Equal(t, "error", resp["message"], "gateway must reject new checkout")
		})
	}
}

func TestRequestPayPalPay(t *testing.T) {
	cases := []struct {
		name                string
		enabled             bool
		complianceConfirmed bool
		credsPresent        bool
	}{
		{"rejects when PayPal disabled", false, true, true},
		{"rejects when compliance unconfirmed", true, false, true},
		{"rejects when credentials missing", true, true, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			setPayPalConfigForTest(t, tc.enabled, tc.complianceConfirmed, tc.credsPresent)
			setupPayPalReturnTestDB(t)

			// Sentinel PayPal server: the test fails if any PayPal API call escapes
			// the gate. Token cache is primed so a stray call would still hit this
			// server rather than the real PayPal network.
			called := false
			setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
				called = true
				w.WriteHeader(http.StatusOK)
			})

			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Set("id", 1)
			c.Request = httptest.NewRequest("POST", "/api/paypal/pay", strings.NewReader(`{"amount":10,"payment_method":"paypal"}`))
			c.Request.Header.Set("Content-Type", "application/json")
			RequestPayPalPay(c)

			require.False(t, called, "PayPal must not be called when gateway rejects checkout")
			var resp map[string]interface{}
			require.NoError(t, common.Unmarshal(w.Body.Bytes(), &resp))
			assert.Equal(t, "error", resp["message"], "gateway must reject new checkout")
			var count int64
			require.NoError(t, model.DB.Model(&model.TopUp{}).Count(&count).Error)
			assert.Equal(t, int64(0), count, "no order should be created when the gate rejects")
		})
	}
}
