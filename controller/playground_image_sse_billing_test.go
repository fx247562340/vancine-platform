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

// P13-B R18: end-to-end Image Workspace billing regressions. The tests drive
// the REAL relay chain (PlaygroundImage -> playgroundRelay -> Relay ->
// PreConsumeBilling -> ImageHelper) against a mock Ali upstream, so the
// assertions observe the final BillingSession outcome (settled quota, user
// quota, used quota, request count, consume logs) instead of intermediate
// PriceData state.

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

const (
	p13bR18Model     = "qwen-image-2.0-pro"
	p13bR18ModelPrice = 0.1
	// p13bR18UserQuota stays far below the trust quota (10 * QuotaPerUnit)
	// so the billing session must really pre-consume instead of trusting.
	p13bR18UserQuota = 200000
)

func p13bR18ExpectedQuota(images int) int {
	return int(float64(images) * p13bR18ModelPrice * common.QuotaPerUnit)
}

func setupP13BImageBillingDB(t *testing.T, username string) *gorm.DB {
	t.Helper()
	originalDB := model.DB
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Log{}, &model.Channel{}, &model.UserSubscription{}, &model.SubscriptionOrder{}, &model.SubscriptionPreConsumeRecord{}))
	model.DB = db

	// The consume-log writer uses the dedicated log database handle.
	originalLogDB := model.LOG_DB
	model.LOG_DB = db

	// The billing chain must run against the plain database path: the test
	// process starts with RedisEnabled=true but no configured client.
	prevRedisEnabled := common.RedisEnabled
	common.RedisEnabled = false

	t.Cleanup(func() {
		common.RedisEnabled = prevRedisEnabled
		model.LOG_DB = originalLogDB
		model.DB = originalDB
		sqlDB, err := db.DB()
		if err == nil {
			require.NoError(t, sqlDB.Close())
		}
	})

	user := model.User{
		Username: username,
		Password: "password123",
		Quota:    p13bR18UserQuota,
		Group:    "default",
	}
	require.NoError(t, db.Create(&user).Error)

	prevPrice := ratio_setting.GetModelPriceCopy()
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(
		fmt.Sprintf(`{"%s": %g}`, p13bR18Model, p13bR18ModelPrice)))
	t.Cleanup(func() {
		if b, err := common.Marshal(prevPrice); err == nil {
			_ = ratio_setting.UpdateModelPriceByJSONString(string(b))
		}
	})
	return db
}

func reloadP13BUser(t *testing.T, db *gorm.DB, id int) model.User {
	t.Helper()
	var reloaded model.User
	require.NoError(t, db.First(&reloaded, id).Error)
	return reloaded
}

func countP13BConsumeLogs(t *testing.T, db *gorm.DB, userID int) int64 {
	t.Helper()
	var count int64
	require.NoError(t, db.Model(&model.Log{}).
		Where("user_id = ? AND type = ?", userID, model.LogTypeConsume).
		Count(&count).Error)
	return count
}

// newP13BPlaygroundContext builds a PlaygroundImage request context with the
// channel context keys the Distribute middleware would normally set, so the
// test drives the real controller + relay + billing chain.
func newP13BPlaygroundContext(t *testing.T, db *gorm.DB, body string, upstreamURL string) (*gin.Context, *httptest.ResponseRecorder, model.User) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	var user model.User
	require.NoError(t, db.First(&user, "username LIKE ?", "p13b-%").Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", strings.NewReader(body))
	ctx.Request.Header.Set("Content-Type", "application/json")

	common.SetContextKey(ctx, constant.ContextKeyUserId, user.Id)
	common.SetContextKey(ctx, constant.ContextKeyOriginalModel, p13bR18Model)
	common.SetContextKey(ctx, constant.ContextKeyUsingGroup, "default")
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(ctx, constant.ContextKeyChannelType, constant.ChannelTypeAli)
	common.SetContextKey(ctx, constant.ContextKeyChannelBaseUrl, upstreamURL)
	common.SetContextKey(ctx, constant.ContextKeyChannelId, 7)
	common.SetContextKey(ctx, constant.ContextKeyChannelKey, "sk-test-upstream")
	return ctx, recorder, user
}

// TestPlaygroundImageUpstreamSSERejectedBeforeDeliveryAndRefunded is the
// P13-B R18 P0 regression: when the mock upstream answers the synchronous
// /pg/images/generations call with text/event-stream, the relay must
//   - hit the upstream exactly once (SkipRetry),
//   - write ZERO bytes of the SSE body to the client (no events, no images,
//     no [DONE]),
//   - never run PostTextConsumeQuota (no consume log, no used-quota bump),
//   - fully refund the pre-consumed quota through the BillingSession error
//     path, leaving user quota exactly where it started.
func TestPlaygroundImageUpstreamSSERejectedBeforeDeliveryAndRefunded(t *testing.T) {
	db := setupP13BImageBillingDB(t, "p13b-r18-sse")

	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		// A "completed" event carrying an image: if any byte of this body
		// leaked to the client the test must fail.
		_, _ = w.Write([]byte(strings.Join([]string{
			`event: image_generation.completed`,
			`data: {"type":"image_generation.completed","b64_json":"iVBORw0KGgoAAAANSUhEUgLEAKED"}`,
			``,
			`data: [DONE]`,
			``,
		}, "\n")))
	}))
	defer upstream.Close()

	ctx, recorder, user := newP13BPlaygroundContext(t, db, `{"model":"`+p13bR18Model+`","prompt":"a red apple"}`, upstream.URL)

	before := reloadP13BUser(t, db, user.Id)
	require.Equal(t, p13bR18UserQuota, before.Quota)

	PlaygroundImage(ctx)

	// Exactly one upstream call: the error carries SkipRetry, so the relay
	// loop never re-issues the request.
	require.Equal(t, int32(1), hits.Load())

	// The client gets a JSON error - never any SSE byte, image, or [DONE].
	body := recorder.Body.String()
	require.NotEqual(t, http.StatusOK, recorder.Code)
	require.Contains(t, body, "error")
	require.Contains(t, body, "event-stream")
	require.NotContains(t, body, "data:")
	require.NotContains(t, body, "[DONE]")
	require.NotContains(t, body, "image_generation.completed")
	require.NotContains(t, body, "iVBORw0KGgoAAAANSUhEUgLEAKED")

	// The refund runs asynchronously (gopool); the final state must be a
	// full restoration of the pre-consumed quota.
	require.Eventually(t, func() bool {
		return reloadP13BUser(t, db, user.Id).Quota == p13bR18UserQuota
	}, 5*time.Second, 25*time.Millisecond, "pre-consumed quota must be fully refunded")

	// PostTextConsumeQuota never ran: no used-quota bump, no request count,
	// no consume log for this user.
	after := reloadP13BUser(t, db, user.Id)
	assert.Equal(t, 0, after.UsedQuota, "no usage may be recorded for a rejected response")
	assert.Equal(t, 0, after.RequestCount, "no successful request may be counted")
	require.Never(t, func() bool {
		return countP13BConsumeLogs(t, db, user.Id) > 0
	}, 300*time.Millisecond, 25*time.Millisecond, "no consume log may exist for a rejected response")
}

// TestPlaygroundImageJSONSuccessSettlesDeliveredCount is the P13-B R18
// success-path counterpart: a normal JSON Ali response settles through the
// BillingSession, bills exactly the number of delivered images, writes the
// consume log, and decrements the user quota by exactly the settled amount.
func TestPlaygroundImageJSONSuccessSettlesDeliveredCount(t *testing.T) {
	db := setupP13BImageBillingDB(t, "p13b-r18-ok")

	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		// One choice delivering TWO valid images: the settled quota must
		// equal the delivered count, not the requested count.
		_, _ = w.Write([]byte(`{"output":{"choices":[{"message":{"content":[
			{"image":"https://example.invalid/a.png"},
			{"image":"https://example.invalid/b.png"}
		]}}]},"usage":{"image_count":2}}`))
	}))
	defer upstream.Close()

	ctx, recorder, user := newP13BPlaygroundContext(t, db, `{"model":"`+p13bR18Model+`","prompt":"a red apple"}`, upstream.URL)

	PlaygroundImage(ctx)

	require.Equal(t, int32(1), hits.Load())
	require.Equal(t, http.StatusOK, recorder.Code, "body=%s", recorder.Body.String())
	body := recorder.Body.String()
	require.Contains(t, body, "https://example.invalid/a.png")
	require.Contains(t, body, "https://example.invalid/b.png")

	// Settlement is synchronous on the success path: quota drops by exactly
	// the price of the two delivered images.
	require.Eventually(t, func() bool {
		return reloadP13BUser(t, db, user.Id).Quota == p13bR18UserQuota-p13bR18ExpectedQuota(2)
	}, 5*time.Second, 25*time.Millisecond, "quota must settle to delivered count * model price")

	after := reloadP13BUser(t, db, user.Id)
	assert.Equal(t, p13bR18ExpectedQuota(2), after.UsedQuota)
	assert.Equal(t, 1, after.RequestCount)
	require.Eventually(t, func() bool {
		return countP13BConsumeLogs(t, db, user.Id) == 1
	}, 5*time.Second, 25*time.Millisecond, "exactly one consume log must be recorded")
}
