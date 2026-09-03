package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// callGetStatus invokes the real GetStatus handler and decodes the data
// envelope. GetStatus reads only in-memory configuration, so no database
// setup is required for the first-top-up bonus advertising contract.
func callGetStatus(t *testing.T) map[string]interface{} {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)

	GetStatus(c)

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

func TestGetStatusFirstTopUpBonusDisabled(t *testing.T) {
	withFirstTopUpBonusForTest(t, 0)

	data := callGetStatus(t)

	raw, present := data["first_topup_bonus_quota"]
	require.True(t, present, "first_topup_bonus_quota must always be part of the status contract")
	assert.Equal(t, float64(0), raw)
	assert.Equal(t, false, data["first_topup_bonus_active"], "a zero configuration must never be advertised as active")
}

func TestGetStatusFirstTopUpBonusActive(t *testing.T) {
	withFirstTopUpBonusForTest(t, 500000)

	data := callGetStatus(t)

	assert.Equal(t, float64(500000), data["first_topup_bonus_quota"])
	assert.Equal(t, true, data["first_topup_bonus_active"])
	// The active flag must agree with the shared model helper.
	_, wantActive := model.ValidFirstTopUpBonusQuota()
	assert.Equal(t, wantActive, data["first_topup_bonus_active"])
}

func TestGetStatusFirstTopUpBonusOutOfRangeKeepsRawQuotaButInactive(t *testing.T) {
	withFirstTopUpBonusForTest(t, common.MaxQuota+1)

	data := callGetStatus(t)

	// The raw value is kept so a misconfiguration stays observable, but the
	// derived flag must be false so no promotion is rendered.
	assert.Equal(t, float64(common.MaxQuota+1), data["first_topup_bonus_quota"])
	assert.Equal(t, false, data["first_topup_bonus_active"])
}

func TestGetStatusFirstTopUpBonusNegativeInactive(t *testing.T) {
	withFirstTopUpBonusForTest(t, -1)

	data := callGetStatus(t)

	assert.Equal(t, float64(-1), data["first_topup_bonus_quota"])
	assert.Equal(t, false, data["first_topup_bonus_active"])
}
