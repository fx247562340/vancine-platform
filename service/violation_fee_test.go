package service

import (
	"math"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// calcViolationFeeQuota must never produce a negative charge. It now routes the
// decimal product through common.QuotaFromDecimalChecked so oversized inputs
// saturate to the int32 bound instead of wrapping, and it surfaces the clamp.
func TestCalcViolationFeeQuota(t *testing.T) {
	t.Run("normal value returns rounded quota without clamp", func(t *testing.T) {
		quota, clamp := calcViolationFeeQuota(10, 1)
		assert.Equal(t, 10*int(common.QuotaPerUnit), quota)
		assert.Nil(t, clamp)
	})

	t.Run("zero amount returns zero without clamp", func(t *testing.T) {
		quota, clamp := calcViolationFeeQuota(0, 1)
		assert.Equal(t, 0, quota)
		assert.Nil(t, clamp)
	})

	t.Run("negative amount returns zero without clamp", func(t *testing.T) {
		// Small negative: the amount<=0 guard fires before decimal conversion.
		quota, clamp := calcViolationFeeQuota(-5, 1)
		assert.Equal(t, 0, quota)
		assert.Nil(t, clamp)

		// Huge negative: guard must still fire first so a huge negative can
		// never wrap into a positive (credit) result via decimal overflow.
		quota, clamp = calcViolationFeeQuota(-1e18, 1)
		assert.Equal(t, 0, quota)
		assert.Nil(t, clamp)
	})

	t.Run("zero groupRatio returns zero without clamp", func(t *testing.T) {
		quota, clamp := calcViolationFeeQuota(10, 0)
		assert.Equal(t, 0, quota)
		assert.Nil(t, clamp)
	})

	t.Run("oversized amount saturates and reports a clamp", func(t *testing.T) {
		// 1e18 * QuotaPerUnit * 1 far exceeds int32; must saturate, never wrap
		// into a negative number (which would be a credit).
		quota, clamp := calcViolationFeeQuota(1e18, 1)
		assert.Equal(t, common.MaxQuota, quota)
		if assert.NotNil(t, clamp) {
			assert.Equal(t, "overflow", string(clamp.Kind))
		}
	})

	t.Run("NaN amount produces no charge without panic", func(t *testing.T) {
		quota, clamp := calcViolationFeeQuota(math.NaN(), 1)
		assert.Equal(t, 0, quota)
		assert.Nil(t, clamp)
	})

	t.Run("Inf amount produces no charge without panic", func(t *testing.T) {
		quota, clamp := calcViolationFeeQuota(math.Inf(1), 1)
		assert.Equal(t, 0, quota)
		assert.Nil(t, clamp)
	})

	t.Run("oversized positive product saturates without wraparound", func(t *testing.T) {
		// amount*QuotaPerUnit*groupRatio overflows int32; saturation must pin to
		// MaxQuota and must NOT wrap to a negative (credit) value.
		quota, clamp := calcViolationFeeQuota(1e15, 1e6)
		assert.Equal(t, common.MaxQuota, quota)
		if assert.NotNil(t, clamp) {
			assert.Equal(t, "overflow", string(clamp.Kind))
		}
	})
}

// Verifies the saturation marker reaches the consume-log `other` map via
// attachQuotaSaturation - the exact function ChargeViolationFeeIfNeeded calls
// right before model.RecordConsumeLog (violation_fee.go). Scope note: this
// asserts the observable `other` structure that RecordConsumeLog serializes
// for the log row; the DB write itself is out of unit-test scope.
func TestViolationFeeAttachQuotaSaturationNestsClampUnderAdminInfo(t *testing.T) {
	clampedQuota, clamp := calcViolationFeeQuota(1e18, 1)
	require.NotNil(t, clamp)
	assert.Equal(t, common.MaxQuota, clampedQuota)

	// Real gin context so the correlated LogWarn audit line also executes.
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())

	relayInfo := &relaycommon.RelayInfo{UserId: 42, OriginModelName: "test-model"}
	relayInfo.QuotaClamp = clamp

	other := map[string]interface{}{
		"violation_fee": true,
		"fee_quota":     clampedQuota,
	}
	attachQuotaSaturation(ctx, relayInfo, other)

	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok, "other.admin_info must be populated")
	saturation, ok := adminInfo["quota_saturation"].(map[string]interface{})
	require.True(t, ok, "admin_info.quota_saturation must be present")
	assert.Equal(t, "QuotaFromDecimal", saturation["op"])
	assert.Equal(t, common.QuotaClampKind("overflow"), saturation["kind"])
	assert.Equal(t, common.MaxQuota, saturation["clamped"])

	// A RelayInfo without a clamp must not create admin_info at all - the
	// common non-saturating path leaves `other` untouched.
	cleanOther := map[string]interface{}{"violation_fee": true}
	attachQuotaSaturation(ctx, &relaycommon.RelayInfo{}, cleanOther)
	_, hasAdmin := cleanOther["admin_info"]
	assert.False(t, hasAdmin, "no admin_info should be created when there is no clamp")
}

// CalcOpenRouterCacheCreateTokens must surface a clamp on saturation so the
// text-quota path can attach it to the consume log via noteQuotaClamp.
func TestCalcOpenRouterCacheCreateTokensClamp(t *testing.T) {
	priceData := types.PriceData{
		ModelRatio:         10,
		CacheCreationRatio: 5,
		CacheRatio:         1,
		CompletionRatio:    4,
	}
	// Small cost yields a small, in-range quotient: no clamp.
	normal, clamp := CalcOpenRouterCacheCreateTokens(dto.Usage{
		Cost:                0.0001,
		PromptTokens:        1,
		CompletionTokens:    1,
		PromptTokensDetails: dto.InputTokenDetails{CachedTokens: 0},
	}, priceData)
	assert.Equal(t, 0, normal)
	assert.Nil(t, clamp)

	// Oversized cost drives the token quotient past int32; must saturate, not wrap.
	huge, clamp := CalcOpenRouterCacheCreateTokens(dto.Usage{
		Cost:                math.MaxFloat64,
		PromptTokens:        1,
		CompletionTokens:    1,
		PromptTokensDetails: dto.InputTokenDetails{CachedTokens: 0},
	}, priceData)
	require.NotNil(t, clamp)
	assert.Equal(t, common.MaxQuota, huge)
	assert.Equal(t, "QuotaRound", clamp.Op)
	assert.Equal(t, common.QuotaClampKind("overflow"), clamp.Kind)
}

// CacheCreationRatio == 1 short-circuits before any conversion.
func TestCalcOpenRouterCacheCreateTokensShortCircuit(t *testing.T) {
	tokens, clamp := CalcOpenRouterCacheCreateTokens(dto.Usage{}, types.PriceData{CacheCreationRatio: 1})
	assert.Equal(t, 0, tokens)
	assert.Nil(t, clamp)
}

// Guard: nil ctx, nil relayInfo, nil other, and a clamp-carrying relayInfo
// with a nil other must all be no-ops for attachQuotaSaturation - the function
// the violation-fee charge path calls right before RecordConsumeLog.
func TestAttachQuotaSaturationNilSafety(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())

	// nil relayInfo returns early.
	other := map[string]interface{}{"x": 1}
	attachQuotaSaturation(ctx, nil, other)
	_, hasAdmin := other["admin_info"]
	assert.False(t, hasAdmin)

	// nil other with a clamp must not panic.
	clamped := &relaycommon.RelayInfo{UserId: 1, OriginModelName: "m"}
	clamped.QuotaClamp = &common.QuotaClamp{Op: "Test"}
	attachQuotaSaturation(ctx, clamped, nil)
}
