package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
	} {
		assert.Contains(t, data, field, "existing field %s must be preserved", field)
	}
}
