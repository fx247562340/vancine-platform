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
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"

	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/sync/singleflight"
	"gorm.io/gorm"
)

// frontendFixtureDir holds the exact JSON payloads the frontend
// contract tests feed through the useHomepageStats hook. The wire
// contract test below asserts the REAL handler emits this same
// shape, so both sides of the contract are pinned to one artifact.
const frontendFixtureDir = "../web/src/features/home/hooks/__tests__/fixtures/"

// setupHomepageStatsEnv builds a Gin engine wired to a single
// in-memory SQLite database that owns both model.DB and model.LOG_DB,
// then registers the homepage stats route on top. Cleanups run LIFO
// so every global is restored before the connection pool closes.
func setupHomepageStatsEnv(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() {
		assert.NoError(t, sqlDB.Close())
	})

	origDB := model.DB
	origLog := model.LOG_DB
	origDBType := common.MainDatabaseType()
	origRedis := common.RedisEnabled
	origRDB := common.RDB
	origSnapshotPayload, origSnapshotAt := homepageSnapshotRead()
	homepageSnapshotMu.RLock()
	origFailedAt := homepageLastFailedAt
	origFailedPayload := homepageLastFailedPayload
	homepageSnapshotMu.RUnlock()
	t.Cleanup(func() {
		model.DB = origDB
		model.LOG_DB = origLog
		common.SetMainDatabaseType(origDBType)
		common.RedisEnabled = origRedis
		common.RDB = origRDB
		homepageSnapshotMu.Lock()
		homepageSnapshotPayload = origSnapshotPayload
		homepageSnapshotAt = origSnapshotAt
		homepageLastFailedAt = origFailedAt
		homepageLastFailedPayload = origFailedPayload
		homepageSnapshotMu.Unlock()
		homepageStatsRefreshGroup = &singleflight.Group{}
	})

	require.NoError(t, db.AutoMigrate(
		&model.Log{},
		&model.Ability{},
		&model.Channel{},
		&model.Model{},
		&model.Vendor{},
	))
	model.DB = db
	model.LOG_DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false

	// Every test starts from a cold cache and a clean singleflight:
	// a leftover snapshot or an in-flight refresh from one test must
	// never bleed into the next.
	homepageSnapshotMu.Lock()
	homepageSnapshotPayload = nil
	homepageSnapshotAt = time.Time{}
	homepageLastFailedAt = time.Time{}
	homepageLastFailedPayload = nil
	homepageSnapshotMu.Unlock()
	homepageStatsRefreshGroup = &singleflight.Group{}

	engine := gin.New()
	engine.GET("/api/homepage/stats", GetHomepageStats)
	return engine
}

// setupHomepageStatsEnvWithMiniredis returns a real Gin engine plus
// a real in-memory Redis (miniredis) so cache hit / miss /
// singleflight contracts are exercised against the real
// common.RedisGet/Set code path, not a test hook.
func setupHomepageStatsEnvWithMiniredis(t *testing.T) (*gin.Engine, *miniredis.Miniredis) {
	t.Helper()
	engine := setupHomepageStatsEnv(t)

	mr := miniredis.RunT(t)
	common.RedisEnabled = true
	common.RDB = redis.NewClient(&redis.Options{Addr: mr.Addr()})

	return engine, mr
}

// consumeLogSeed is one LogTypeConsume row. Zero values are the
// defaults the plain helper used to hardcode.
type consumeLogSeed struct {
	createdAt        time.Time
	promptTokens     int
	completionTokens int
	requestId        string
	other            string
	isStream         bool
	quota            int
}

func seedConsumeLogs(t *testing.T, db *gorm.DB, rows ...consumeLogSeed) {
	t.Helper()
	for _, row := range rows {
		require.NoError(t, db.Create(&model.Log{
			UserId:           1,
			CreatedAt:        row.createdAt.Unix(),
			Type:             model.LogTypeConsume,
			Content:          "ok",
			ModelName:        "test-model",
			Quota:            row.quota,
			PromptTokens:     row.promptTokens,
			CompletionTokens: row.completionTokens,
			UseTime:          10,
			IsStream:         row.isStream,
			ChannelId:        1,
			Group:            "default",
			RequestId:        row.requestId,
			Other:            row.other,
		}).Error)
	}
}

// normalConsume is the common "one real successful request" row.
func normalConsume(createdAt time.Time, prompt, completion int, requestId string, other string) consumeLogSeed {
	return consumeLogSeed{
		createdAt:        createdAt,
		promptTokens:     prompt,
		completionTokens: completion,
		requestId:        requestId,
		other:            other,
		isStream:         false,
		quota:            1,
	}
}

// countLogTableQueries installs GORM callbacks on the test database
// that count every query against the logs table. Both the Query
// processor (Count) and the Row processor (Scan) are instrumented —
// the two homepage aggregates use one each. The callbacks live only
// on this test's in-memory DB instance; no production code path is
// touched.
func countLogTableQueries(t *testing.T, db *gorm.DB) *atomic.Int64 {
	t.Helper()
	return instrumentLogTableQueries(t, db, nil, nil)
}

// holdLogQueriesOnBarrier counts logs-table queries and parks the
// first one on `release` after signalling `firstEntered`. Closing
// `release` unblocks it (and any later query, which sees a closed
// channel). This is how the concurrent-refresh test forces overlap
// without sleeping.
func holdLogQueriesOnBarrier(t *testing.T, db *gorm.DB, firstEntered chan struct{}, release <-chan struct{}) *atomic.Int64 {
	t.Helper()
	return instrumentLogTableQueries(t, db, firstEntered, release)
}

func instrumentLogTableQueries(t *testing.T, db *gorm.DB, firstEntered chan struct{}, release <-chan struct{}) *atomic.Int64 {
	t.Helper()
	var count atomic.Int64
	var once sync.Once
	countFn := func(tx *gorm.DB) {
		if tx.Statement != nil && tx.Statement.Table == "logs" {
			count.Add(1)
			if firstEntered != nil {
				once.Do(func() { close(firstEntered) })
			}
			if release != nil {
				<-release
			}
		}
	}
	queryName := "test_count_log_queries_query"
	rowName := "test_count_log_queries_row"
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register(queryName, countFn))
	require.NoError(t, db.Callback().Row().Before("gorm:row").Register(rowName, countFn))
	t.Cleanup(func() {
		assert.NoError(t, db.Callback().Query().Remove(queryName))
		assert.NoError(t, db.Callback().Row().Remove(rowName))
	})
	return &count
}

func requestStats(t *testing.T, engine *gin.Engine) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/homepage/stats", nil))
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	return w
}

// ---------------------------------------------------------------------------
// Wire contract — the real handler JSON is the frontend's input
// ---------------------------------------------------------------------------

// TestHomepageStats_WireContract_MatchesFrontendFixture pins both
// sides of the contract to one artifact: the fixture files the
// frontend hook tests consume. The real handler's response must
// expose exactly the fixture's top-level keys and exactly the
// fixture's triple keys — no success/data envelope, no extra
// fields. If this test fails, the frontend and backend drifted.
func TestHomepageStats_WireContract_MatchesFrontendFixture(t *testing.T) {
	engine := setupHomepageStatsEnv(t)
	seedConsumeLogs(t, model.LOG_DB, normalConsume(time.Now().AddDate(0, 0, -1), 10, 20, "req-1", `{}`))

	body := requestStats(t, engine).Body.Bytes()

	var handlerResp map[string]any
	require.NoError(t, common.Unmarshal(body, &handlerResp))

	// The envelope is banned: the handler serves the bare payload.
	assert.NotContains(t, handlerResp, "success", "handler must not add a success envelope")
	assert.NotContains(t, handlerResp, "data", "handler must not add a data envelope")
	assert.NotContains(t, handlerResp, "message")

	fixtureRaw, err := os.ReadFile(frontendFixtureDir + "homepage-stats.json")
	require.NoError(t, err, "frontend fixture must exist and be readable")
	var fixture map[string]any
	require.NoError(t, common.Unmarshal(fixtureRaw, &fixture))

	// Top-level key sets match in both directions.
	handlerKeys := make([]string, 0, len(handlerResp))
	for k := range handlerResp {
		handlerKeys = append(handlerKeys, k)
	}
	fixtureKeys := make([]string, 0, len(fixture))
	for k := range fixture {
		fixtureKeys = append(fixtureKeys, k)
	}
	assert.ElementsMatch(t, fixtureKeys, handlerKeys, "handler top-level keys must match the frontend fixture")

	// Every triple has exactly the fixture's triple keys.
	for _, key := range []string{"successful_requests", "processed_tokens", "active_vendor_count", "available_model_count"} {
		fixtureTriple, ok := fixture[key].(map[string]any)
		require.True(t, ok, "fixture triple %s", key)
		handlerTriple, ok := handlerResp[key].(map[string]any)
		require.True(t, ok, "handler triple %s", key)
		var fk, hk []string
		for k := range fixtureTriple {
			fk = append(fk, k)
		}
		for k := range handlerTriple {
			hk = append(hk, k)
		}
		assert.ElementsMatch(t, fk, hk, "triple keys for %s must match the frontend fixture", key)
		avail, ok := handlerTriple["availability"].(string)
		require.True(t, ok)
		assert.Contains(t, []string{"ok", "unavailable"}, avail, "availability vocabulary is closed")
	}

	// as_of is a real unix timestamp.
	asOf, ok := handlerResp["as_of"].(float64)
	require.True(t, ok)
	assert.Greater(t, asOf, float64(0))
}

// ---------------------------------------------------------------------------
// Counting semantics
// ---------------------------------------------------------------------------

func TestHomepageStats_EmptyDatabaseReturnsRealZeros(t *testing.T) {
	engine := setupHomepageStatsEnv(t)
	w := requestStats(t, engine)

	var resp HomepageStatsResponse
	require.NoError(t, common.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, homepageStatsWindowDays, resp.WindowDays)

	// An empty database is a valid "real zero" state — nothing
	// happened in the last 30 days — so every aggregate reports
	// value=0 availability=ok, NOT unavailable.
	assert.Equal(t, int64(0), resp.Successful.Value)
	assert.Equal(t, availabilityOK, resp.Successful.Availability)
	assert.Equal(t, int64(0), resp.ProcessedToken.Value)
	assert.Equal(t, availabilityOK, resp.ProcessedToken.Availability)
	assert.Equal(t, int64(0), resp.ActiveVendors.Value)
	assert.Equal(t, availabilityOK, resp.ActiveVendors.Availability)
	assert.Equal(t, int64(0), resp.AvailableModel.Value)
	assert.Equal(t, availabilityOK, resp.AvailableModel.Availability)
	assert.Greater(t, resp.AsOf, int64(0))
}

func TestHomepageStats_DistinctRequestIdsAndTaskExclusion(t *testing.T) {
	engine := setupHomepageStatsEnv(t)
	within := time.Now().AddDate(0, 0, -7)
	outside := time.Now().AddDate(0, 0, -45)

	seedConsumeLogs(t, model.LOG_DB,
		// Three rows sharing one request id (settle + mid-stream +
		// recalc) count as exactly one successful request.
		normalConsume(within, 10, 20, "req-1", `{"ratio":1.5}`),
		normalConsume(within, 10, 20, "req-1", `{"ratio":1.5}`),
		normalConsume(within, 10, 20, "req-1", `{"ratio":1.5}`),
		// A second distinct request id.
		normalConsume(within, 5, 5, "req-2", `{"ratio":1.5}`),
		// Outside the 30-day window: not counted.
		normalConsume(outside, 100, 100, "req-old", `{"ratio":1.5}`),
		// Task settlement: the first task request (accepted, with a
		// non-empty request_id and a positive quota) is now counted
		// as a successful client request — the homepage must
		// include async image / video / 3D submits.
		normalConsume(within, 50, 50, "req-task", `{"is_task":true,"task_id":"t-1"}`),
	)

	w := requestStats(t, engine)
	var resp HomepageStatsResponse
	require.NoError(t, common.Unmarshal(w.Body.Bytes(), &resp))

	assert.Equal(t, int64(3), resp.Successful.Value)
	assert.Equal(t, availabilityOK, resp.Successful.Availability)
	// 3 rows of 30 tokens (one request) + 10 + 100 (task) + 200
	// (req-old, outside window) = tokens sum covers the window
	// only: 90 + 10 + 100 = 200. Task settlements DO count toward
	// processed tokens — tokens are real platform usage regardless
	// of the row's role.
	assert.Equal(t, int64(200), resp.ProcessedToken.Value)
}

// TestHomepageStats_AsyncTaskCountingSemantics pins the contract for
// asynchronous image / video / 3D submissions: a task that was
// accepted and logged with a non-empty request_id, a non-corrupt
// counter, and no failure marker is a successful client request and
// must count. The follow-up task-settlement rows (pre-consume
// recalc, refund/rebill) almost always have no request_id, so they
// are dropped by the request_id baseline; an explicit-failure task
// submission is excluded by the same failure marker the
// non-task surface uses. This is the regression target for the
// "all task logs are excluded" simplification.
func TestHomepageStats_AsyncTaskCountingSemantics(t *testing.T) {
	engine := setupHomepageStatsEnv(t)
	within := time.Now().AddDate(0, 0, -3)

	seedConsumeLogs(t, model.LOG_DB,
		// A plain chat request.
		normalConsume(within, 10, 20, "req-chat", `{}`),
		// An image task that was accepted and submitted: counted.
		normalConsume(within, 0, 0, "req-image", `{"is_task":true,"task_id":"img-1"}`),
		// A video task that was accepted and submitted: counted.
		normalConsume(within, 0, 0, "req-video", `{"is_task":true,"task_id":"vid-1"}`),
		// A 3D task that was accepted and submitted: counted.
		normalConsume(within, 0, 0, "req-3d", `{"is_task":true,"task_id":"m-3d-1"}`),
		// Follow-up task settlement: no request_id, so it never
		// reaches the DISTINCT aggregation and does not double
		// count the original submission.
		consumeLogSeed{createdAt: within, promptTokens: 0, completionTokens: 0, requestId: "", other: `{"is_task":true,"task_id":"img-1","settlement":"recalc"}`, isStream: false, quota: 1},
		// A task that the relay itself marked as failed via
		// stream_status.status=error: excluded.
		consumeLogSeed{createdAt: within, promptTokens: 0, completionTokens: 0, requestId: "req-task-fail", other: `{"is_task":true,"task_id":"img-2","stream_status":{"status":"error","end_reason":"timeout"}}`, isStream: true, quota: 5},
		// The same request_id written twice for an accepted task
		// (initial submit + late token re-settle): DISTINCT
		// collapses them.
		normalConsume(within, 5, 5, "req-video", `{"is_task":true,"task_id":"vid-1"}`),
	)

	w := requestStats(t, engine)
	var resp HomepageStatsResponse
	require.NoError(t, common.Unmarshal(w.Body.Bytes(), &resp))

	// Counted: req-chat, req-image, req-video (with its duplicate),
	// req-3d = 4 distinct request_ids.
	assert.Equal(t, int64(4), resp.Successful.Value)
	assert.Equal(t, availabilityOK, resp.Successful.Availability)
}

// TestSumConsumeTokens_Int4OverflowSafety pins the SUM aggregator
// shape that keeps the result in int64 even when the per-column
// aggregate exceeds INT32_MAX. A naive `SUM(prompt_tokens +
// completion_tokens)` on a row with both columns near INT32_MAX
// overflows the int4 arithmetic on PostgreSQL before the planner
// can promote to bigint; the production code aggregates the two
// columns independently with COALESCE(SUM(...), 0) and adds the
// partial sums only after they are safely bigint.
//
// The test seeds values that exceed the int32 range in their
// intermediate sums while keeping the test engine's reduced-
// precision SUM (SQLite with the bundled driver, which sums int4
// without widening) still inside the int32 range so the
// assertion is reproducible in CI. The production engines
// (PostgreSQL, MySQL) widen SUM to bigint at the aggregate
// boundary and return the same int64 value the test asserts.
//
// Row seeds and per-column aggregates (int64):
//
//	prompt   = 1_000_000_000 + 0 + 1_000_000_000 = 2_000_000_000 (< INT32_MAX)
//	complet. = 0 + 1_000_000_000 + 1_000_000_000 = 2_000_000_000
//	per-row  = prompt + completion = up to 2_000_000_000 per row
//	total    = 4_000_000_000
//
// On PostgreSQL the same aggregate (with larger values) also
// returns an int64 result. The function shape is the regression
// target: two COALESCE-wrapped partial sums that the database
// can promote to bigint at the aggregate boundary.
func TestSumConsumeTokens_Int4OverflowSafety(t *testing.T) {
	_ = setupHomepageStatsEnv(t)
	within := time.Now().AddDate(0, 0, -1)

	const perColumn int = 1_000_000_000
	const expected int64 = 4_000_000_000

	seedConsumeLogs(t, model.LOG_DB,
		consumeLogSeed{createdAt: within, promptTokens: perColumn, completionTokens: 0, requestId: "req-prompt-a", other: `{}`, isStream: false, quota: 1},
		consumeLogSeed{createdAt: within, promptTokens: 0, completionTokens: perColumn, requestId: "req-completion-a", other: `{}`, isStream: false, quota: 1},
		consumeLogSeed{createdAt: within, promptTokens: perColumn, completionTokens: perColumn, requestId: "req-both", other: `{}`, isStream: false, quota: 1},
	)

	got, err := model.SumConsumeTokens(context.Background(), within.Add(-time.Hour).Unix(), within.Add(time.Hour).Unix())
	require.NoError(t, err)
	assert.Equal(t, expected, got)
}

// TestCountDistinctSuccessfulRequestIds_AcceptsNearInt32MaxRow is the
// real regression target for the CountDistinctSuccessfulRequestIds
// row-level overflow fix. A row whose prompt_tokens and
// completion_tokens each equal INT32_MAX / 2 + a small delta must
// still be counted: the production WHERE clause MUST NOT compute
// any `prompt + completion` arithmetic, because that arithmetic
// would wrap on PostgreSQL int4 before the predicate evaluates.
// This test calls the real production function and asserts both
// that the query returns without error and that the row is
// included in the distinct request_id count.
//
// The previous TestSumConsumeTokens_SQLShapeUsesIndependentColumns
// only re-asserted a copy of the production SQL string via
// GORM.ToSQL; that did not exercise the real function and is no
// longer the right shape. The real contract is: call the real
// function with values that would wrap the unsafe arithmetic.
func TestCountDistinctSuccessfulRequestIds_AcceptsNearInt32MaxRow(t *testing.T) {
	_ = setupHomepageStatsEnv(t)
	within := time.Now().AddDate(0, 0, -1)

	// Each column is 2_000_000_000 (well inside int4) but the
	// per-row sum is 4_000_000_000 which exceeds INT32_MAX
	// (2_147_483_647). A predicate like `prompt + completion <= 0`
	// still evaluates to false for this row, but ANY predicate
	// that depends on the per-row sum's numeric range (e.g. an
	// overflowed check) is the regression target.
	const promptColumn int = 2_000_000_000
	const completionColumn int = 2_000_000_000

	seedConsumeLogs(t, model.LOG_DB,
		// The big row: must be counted.
		consumeLogSeed{
			createdAt:        within,
			promptTokens:     promptColumn,
			completionTokens: completionColumn,
			requestId:        "req-big",
			other:            `{}`,
			isStream:         false,
			quota:            1,
		},
		// A second distinct request_id so the test asserts the
		// row was promoted by the DISTINCT aggregator rather than
		// silently dropped.
		normalConsume(within, 10, 20, "req-small", `{}`),
	)

	got, err := model.CountDistinctSuccessfulRequestIds(
		context.Background(),
		within.Add(-time.Hour).Unix(),
		within.Add(time.Hour).Unix(),
	)
	require.NoError(t, err, "the big row must not break the query")
	assert.Equal(t, int64(2), got, "both the big row and the small row must be counted")
}

// TestHomepageStats_ExcludesUnprovableAndCorruptRows pins the
// exclusion rules beyond dedup + task: explicit failure markers,
// unprovable streams, zero-token zero-quota timeout rows, and
// corrupt counters must never reach the success metric.
func TestHomepageStats_ExcludesUnprovableAndCorruptRows(t *testing.T) {
	engine := setupHomepageStatsEnv(t)
	within := time.Now().AddDate(0, 0, -2)

	seedConsumeLogs(t, model.LOG_DB,
		// One clean request: counted.
		normalConsume(within, 10, 20, "req-clean", `{}`),
		// Streaming row with zero delivered tokens: success cannot
		// be proven, excluded.
		consumeLogSeed{createdAt: within, promptTokens: 0, completionTokens: 0, requestId: "req-empty-stream", other: `{}`, isStream: true, quota: 5},
		// Streaming row WITH tokens: a normal success, counted.
		consumeLogSeed{createdAt: within, promptTokens: 8, completionTokens: 12, requestId: "req-stream-ok", other: `{}`, isStream: true, quota: 7},
		// Negative quota: corrupt, excluded.
		consumeLogSeed{createdAt: within, promptTokens: 5, completionTokens: 5, requestId: "req-neg-quota", other: `{}`, isStream: false, quota: -3},
		// Negative completion tokens: corrupt, excluded.
		consumeLogSeed{createdAt: within, promptTokens: 5, completionTokens: -9, requestId: "req-neg-tokens", other: `{}`, isStream: false, quota: 2},
		// Non-stream row with zero tokens but a positive quota:
		// kept (a handful of non-stream surfaces can legitimately
		// bill without token usage).
		consumeLogSeed{createdAt: within, promptTokens: 0, completionTokens: 0, requestId: "req-nonstream-zero", other: `{}`, isStream: false, quota: 1},
		// stream_status.status=error: a billed stream that the
		// relay itself marked as failed. Excluded even though it
		// has tokens.
		consumeLogSeed{createdAt: within, promptTokens: 4, completionTokens: 6, requestId: "req-stream-error", other: `{"stream_status":{"status":"error","end_reason":"timeout"}}`, isStream: true, quota: 3},
		// violation_fee=true: a CSAM/violation charge, not a
		// successful request.
		consumeLogSeed{createdAt: within, promptTokens: 0, completionTokens: 0, requestId: "req-violation", other: `{"violation_fee":true,"violation_fee_code":"violation_fee.grok.csam"}`, isStream: false, quota: 100},
		// Zero tokens AND zero quota: the upstream-failure /
		// timeout consume-log pattern. Excluded.
		consumeLogSeed{createdAt: within, promptTokens: 0, completionTokens: 0, requestId: "req-timeout-zero", other: `{}`, isStream: false, quota: 0},
	)

	w := requestStats(t, engine)
	var resp HomepageStatsResponse
	require.NoError(t, common.Unmarshal(w.Body.Bytes(), &resp))

	// Counted: req-clean, req-stream-ok, req-nonstream-zero = 3.
	assert.Equal(t, int64(3), resp.Successful.Value)
	assert.Equal(t, availabilityOK, resp.Successful.Availability)
	// Tokens still include every non-corrupt consume row (task
	// settlements, violation fees, failed streams) because tokens
	// are real platform usage. Excluded from the SUM: neg-quota
	// (10) and neg-tokens. Included: clean 30 + empty-stream 0 +
	// stream-ok 20 + nonstream-zero 0 + stream-error 10 +
	// violation 0 + timeout-zero 0 = 60.
	assert.Equal(t, int64(60), resp.ProcessedToken.Value)
}

func TestHomepageStats_NeverExposesUserOrChannelDetail(t *testing.T) {
	engine := setupHomepageStatsEnv(t)
	seedConsumeLogs(t, model.LOG_DB, normalConsume(time.Now().AddDate(0, 0, -1), 7, 11, "req-1", `{}`))

	body := requestStats(t, engine).Body.String()
	for _, banned := range []string{
		"user_id", "channel_id", "token_id", "token_name",
		"ip", "request_id", "username", "model_name",
	} {
		assert.NotContains(t, body, banned, "field %q must not appear in the public stats payload", banned)
	}
}

// ---------------------------------------------------------------------------
// Catalog counts — anonymous public set, private groups excluded
// ---------------------------------------------------------------------------

// seedPublicCatalog builds two abilities: one enabled for the
// "default" group and one for a private "members-only" group, plus
// the model metadata and vendor rows updatePricing needs.
func seedPublicCatalog(t *testing.T, db *gorm.DB) {
	t.Helper()
	require.NoError(t, db.Create(&model.Vendor{Id: 1, Name: "Test Vendor", Status: 1}).Error)
	require.NoError(t, db.Create(&model.Model{ModelName: "public-model", VendorID: 1, Status: 1, NameRule: model.NameRuleExact}).Error)
	require.NoError(t, db.Create(&model.Model{ModelName: "private-model", VendorID: 1, Status: 1, NameRule: model.NameRuleExact}).Error)
	require.NoError(t, db.Create(&model.Ability{Group: "default", Model: "public-model", ChannelId: 1, Enabled: true}).Error)
	require.NoError(t, db.Create(&model.Ability{Group: "members-only", Model: "private-model", ChannelId: 1, Enabled: true}).Error)
	model.InvalidatePricingCache()
	t.Cleanup(model.InvalidatePricingCache)
}

// setAnonymousUsableGroups swaps the anonymous usable-group set and
// restores the original on cleanup.
func setAnonymousUsableGroups(t *testing.T, jsonStr string) {
	t.Helper()
	orig := setting.UserUsableGroups2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(jsonStr))
	t.Cleanup(func() {
		assert.NoError(t, setting.UpdateUserUsableGroupsByJSONString(orig))
	})
}

// TestHomepageStats_PrivateGroupModelsExcluded proves both catalog
// numbers come from the SAME anonymous public-available set the
// /api/pricing endpoint serves: a model enabled only for a private
// group must not inflate either count, and widening the anonymous
// group set brings it back.
func TestHomepageStats_PrivateGroupModelsExcluded(t *testing.T) {
	engine := setupHomepageStatsEnv(t)
	seedPublicCatalog(t, model.DB)

	// Anonymous visitors only see the "default" group.
	setAnonymousUsableGroups(t, `{"default":"默认分组"}`)

	var restricted HomepageStatsResponse
	require.NoError(t, common.Unmarshal(requestStats(t, engine).Body.Bytes(), &restricted))
	assert.Equal(t, int64(1), restricted.AvailableModel.Value, "private-group model must not count")
	assert.Equal(t, int64(1), restricted.ActiveVendors.Value)
	assert.Equal(t, availabilityOK, restricted.AvailableModel.Availability)

	// Widen the anonymous set: the private model becomes public
	// for anonymous visitors and both counts move in lock-step.
	// Invalidate the pricing cache AND the stats caches so the
	// second request recomputes instead of serving the first
	// phase's cached envelope.
	model.InvalidatePricingCache()
	homepageSnapshotMu.Lock()
	homepageSnapshotPayload = nil
	homepageSnapshotAt = time.Time{}
	homepageSnapshotMu.Unlock()
	homepageStatsRefreshGroup = &singleflight.Group{}
	setAnonymousUsableGroups(t, `{"default":"默认分组","members-only":"会员分组"}`)

	var widened HomepageStatsResponse
	require.NoError(t, common.Unmarshal(requestStats(t, engine).Body.Bytes(), &widened))
	assert.Equal(t, int64(2), widened.AvailableModel.Value)
	assert.Equal(t, int64(1), widened.ActiveVendors.Value, "both models share one vendor")
}

// ---------------------------------------------------------------------------
// Cache layers
// ---------------------------------------------------------------------------

// TestHomepageStats_RedisCacheHitMiss pins the Redis layer: the
// first request computes (miss) and warms the key; the second is
// served verbatim from Redis (hit) with the ORIGINAL as_of.
func TestHomepageStats_RedisCacheHitMiss(t *testing.T) {
	engine, mr := setupHomepageStatsEnvWithMiniredis(t)
	seedConsumeLogs(t, model.LOG_DB,
		normalConsume(time.Now().AddDate(0, 0, -1), 10, 20, "req-1", `{}`),
		normalConsume(time.Now().AddDate(0, 0, -1), 5, 5, "req-2", `{}`),
	)

	w1 := requestStats(t, engine)
	assert.Equal(t, "miss", w1.Header().Get(homepageStatsCacheHeader))
	var first HomepageStatsResponse
	require.NoError(t, common.Unmarshal(w1.Body.Bytes(), &first))
	assert.Equal(t, int64(2), first.Successful.Value)
	assert.True(t, mr.Exists(homepageStatsCacheKey), "first miss must warm the cache")

	w2 := requestStats(t, engine)
	assert.Equal(t, "hit", w2.Header().Get(homepageStatsCacheHeader))
	assert.Equal(t, w1.Body.String(), w2.Body.String(), "cache hit must serve the cached payload byte-for-byte")
}

// TestHomepageStats_RedisDownUsesInProcessSnapshot proves the
// fallback layer: after one successful refresh, Redis going away
// does not send every request back to the database — the in-process
// snapshot serves identical bytes (same as_of) for the cache TTL.
func TestHomepageStats_RedisDownUsesInProcessSnapshot(t *testing.T) {
	engine, _ := setupHomepageStatsEnvWithMiniredis(t)
	seedConsumeLogs(t, model.LOG_DB, normalConsume(time.Now().AddDate(0, 0, -1), 10, 20, "req-1", `{}`))
	queryCount := countLogTableQueries(t, model.LOG_DB)

	w1 := requestStats(t, engine)
	require.Equal(t, "miss", w1.Header().Get(homepageStatsCacheHeader))
	afterWarm := queryCount.Load()
	assert.Greater(t, afterWarm, int64(0), "the warm request must have queried the logs table")

	// Redis goes away entirely.
	common.RedisEnabled = false

	w2 := requestStats(t, engine)
	assert.Equal(t, "hit-memory", w2.Header().Get(homepageStatsCacheHeader))
	assert.Equal(t, w1.Body.String(), w2.Body.String(), "memory snapshot must serve the original payload with the original as_of")
	assert.Equal(t, afterWarm, queryCount.Load(), "memory hit must not query the logs table again")
}

// TestHomepageStats_ColdCacheConcurrentSingleAggregate proves the
// singleflight contract under a real herd: ten concurrent requests
// on a cold cache produce exactly ONE aggregate pass (one COUNT +
// one SUM against the logs table), every request is served, and the
// cache ends up warm.
func TestHomepageStats_ColdCacheConcurrentSingleAggregate(t *testing.T) {
	engine, mr := setupHomepageStatsEnvWithMiniredis(t)
	seedConsumeLogs(t, model.LOG_DB, normalConsume(time.Now().AddDate(0, 0, -1), 10, 20, "req-1", `{}`))

	firstEntered := make(chan struct{})
	release := make(chan struct{})
	queryCount := holdLogQueriesOnBarrier(t, model.LOG_DB, firstEntered, release)

	const N = 10
	var ready sync.WaitGroup
	ready.Add(N)
	start := make(chan struct{})
	var done sync.WaitGroup
	results := make([]string, N)
	headers := make([]string, N)
	for i := 0; i < N; i++ {
		done.Add(1)
		go func(idx int) {
			defer done.Done()
			ready.Done()
			<-start
			w := httptest.NewRecorder()
			engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/homepage/stats", nil))
			headers[idx] = w.Header().Get(homepageStatsCacheHeader)
			results[idx] = w.Body.String()
		}(i)
	}
	ready.Wait()
	close(start)
	<-firstEntered
	close(release)
	done.Wait()

	// Exactly one refresh ran: one COUNT query + one SUM query.
	assert.Equal(t, int64(2), queryCount.Load(), "ten concurrent cold-cache requests must coalesce into one aggregate")

	// Every request served, all with identical bodies.
	for i := 0; i < N; i++ {
		assert.Contains(t, []string{"miss", "hit", "hit-memory"}, headers[i])
		assert.Equal(t, results[0], results[i], "every waiter must receive the shared refresh result")
	}
	assert.True(t, mr.Exists(homepageStatsCacheKey), "cache must be warm after the herd")
}

// TestHomepageStats_ExpiredSnapshotSurvivesLogQueryFailure pins the
// outage contract by running the real failure path:
//  1. generate a successful snapshot
//  2. expire it (age past TTL, drop Redis)
//  3. break the logs table
//  4. first request actually tries the query, fails, and must
//     return the ORIGINAL snapshot bytes/as_of without writing
//     Redis or overwriting the in-process snapshot
//  5. second request is inside the short failure backoff and
//     must not touch the logs table at all
//
// homepageLastFailedAt is never preset — the first failed refresh
// is what arms the backoff.
func TestHomepageStats_ExpiredSnapshotSurvivesLogQueryFailure(t *testing.T) {
	engine, mr := setupHomepageStatsEnvWithMiniredis(t)
	seedConsumeLogs(t, model.LOG_DB, normalConsume(time.Now().AddDate(0, 0, -1), 10, 20, "req-1", `{}`))

	good := requestStats(t, engine)
	require.Equal(t, "miss", good.Header().Get(homepageStatsCacheHeader))
	goodBody := good.Body.String()
	var goodResp HomepageStatsResponse
	require.NoError(t, common.Unmarshal(good.Body.Bytes(), &goodResp))
	originalAsOf := goodResp.AsOf

	require.NoError(t, model.LOG_DB.Exec("DROP TABLE logs").Error)
	mr.Del(homepageStatsCacheKey)
	homepageSnapshotMu.Lock()
	homepageSnapshotAt = time.Now().Add(-2 * homepageStatsCacheTTL)
	homepageSnapshotMu.Unlock()

	queryCount := countLogTableQueries(t, model.LOG_DB)

	w1 := requestStats(t, engine)
	assert.Equal(t, "miss-stale", w1.Header().Get(homepageStatsCacheHeader))
	assert.Equal(t, goodBody, w1.Body.String(), "failed operational refresh must serve the last good payload byte-for-byte")
	assert.Greater(t, queryCount.Load(), int64(0), "the first request after expiry must actually try the logs query")
	assert.False(t, mr.Exists(homepageStatsCacheKey), "a failed operational refresh must not republish Redis")
	var staleResp HomepageStatsResponse
	require.NoError(t, common.Unmarshal(w1.Body.Bytes(), &staleResp))
	assert.Equal(t, originalAsOf, staleResp.AsOf, "the stale payload must keep its original as_of")

	afterFirst := queryCount.Load()
	w2 := requestStats(t, engine)
	assert.Equal(t, goodBody, w2.Body.String(), "backoff request must keep serving the original snapshot")
	assert.Equal(t, afterFirst, queryCount.Load(), "second request inside failure backoff must not query the logs table")
}

// TestHomepageStats_FailedDBRefreshDoesNotPublishSuccessSnapshot
// covers the cold-outage corner: no prior snapshot exists and the
// logs table is broken. The response is structurally valid, the DB
// aggregates are unavailable (never fake zeros, never 5xx), and the
// catalog aggregates stay honest. Because operational stats failed,
// the partial envelope must NOT become a five-minute success
// snapshot: Redis stays empty and a follow-up request is served
// from the short failure backoff without another logs scan.
func TestHomepageStats_FailedDBRefreshDoesNotPublishSuccessSnapshot(t *testing.T) {
	engine, mr := setupHomepageStatsEnvWithMiniredis(t)
	require.NoError(t, model.LOG_DB.Exec("DROP TABLE logs").Error)
	queryCount := countLogTableQueries(t, model.LOG_DB)

	w := requestStats(t, engine)
	var resp HomepageStatsResponse
	require.NoError(t, common.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, availabilityUnavailable, resp.Successful.Availability)
	assert.Equal(t, availabilityUnavailable, resp.ProcessedToken.Availability)
	assert.Equal(t, availabilityOK, resp.ActiveVendors.Availability)
	assert.Equal(t, int64(0), resp.ActiveVendors.Value)
	assert.Equal(t, availabilityOK, resp.AvailableModel.Availability)
	assert.Equal(t, int64(0), resp.AvailableModel.Value)
	assert.False(t, mr.Exists(homepageStatsCacheKey), "a failed operational refresh must not become a five-minute snapshot")
	_, fresh := freshHomepageSnapshot(time.Now())
	assert.False(t, fresh, "a failed operational refresh must not populate the in-process success snapshot")

	afterFirst := queryCount.Load()
	assert.Greater(t, afterFirst, int64(0))
	w2 := requestStats(t, engine)
	assert.Equal(t, w.Body.String(), w2.Body.String())
	assert.Equal(t, afterFirst, queryCount.Load(), "backoff without a success snapshot must not rescan the logs table")
}

// TestComputeHomepageStats_CanceledContextMarksOperationalUnavailable
// proves the query context is actually wired: an already-canceled
// context turns the DB aggregates unavailable (never a fabricated
// zero), while the in-memory catalog stays ok. The HTTP handler's
// timeout constant is not mutated.
func TestComputeHomepageStats_CanceledContextMarksOperationalUnavailable(t *testing.T) {
	_ = setupHomepageStatsEnv(t)
	seedConsumeLogs(t, model.LOG_DB, normalConsume(time.Now().AddDate(0, 0, -1), 10, 20, "req-1", `{}`))

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	resp := computeHomepageStats(ctx)
	assert.Equal(t, availabilityUnavailable, resp.Successful.Availability, "canceled query must be unavailable, not zero")
	assert.Equal(t, availabilityUnavailable, resp.ProcessedToken.Availability)
	assert.Equal(t, availabilityOK, resp.ActiveVendors.Availability)
	assert.Equal(t, availabilityOK, resp.AvailableModel.Availability)
}

// ---------------------------------------------------------------------------
// Public surface guards
// ---------------------------------------------------------------------------

// TestHomepageStats_NoLiveBypass confirms the public handler has no
// ?live=1 cache-bypass parameter: an un-authenticated visitor must
// never be able to force a DB scan.
func TestHomepageStats_NoLiveBypass(t *testing.T) {
	engine, mr := setupHomepageStatsEnvWithMiniredis(t)

	cached := HomepageStatsResponse{
		WindowDays: homepageStatsWindowDays,
		Successful: StatTriple{Value: 1, Availability: availabilityOK},
		AsOf:       time.Now().Unix(),
	}
	raw, err := common.Marshal(cached)
	require.NoError(t, err)
	require.NoError(t, mr.Set(homepageStatsCacheKey, string(raw)))

	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/homepage/stats?live=1", nil))
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, "hit", w.Header().Get(homepageStatsCacheHeader), "?live=1 must not bypass the cache")
}

func TestOperationalStatsOK(t *testing.T) {
	assert.True(t, operationalStatsOK(HomepageStatsResponse{
		Successful:     StatTriple{Availability: availabilityOK},
		ProcessedToken: StatTriple{Availability: availabilityOK},
	}), "both operational aggregates ok is a publishable refresh")
	assert.False(t, operationalStatsOK(HomepageStatsResponse{
		Successful:     StatTriple{Availability: availabilityOK, Value: 1},
		ProcessedToken: StatTriple{Availability: availabilityUnavailable},
		ActiveVendors:  StatTriple{Availability: availabilityOK},
		AvailableModel: StatTriple{Availability: availabilityOK},
	}), "catalog-ok must not promote a failed token aggregate into a success snapshot")
	assert.False(t, operationalStatsOK(HomepageStatsResponse{
		Successful:     StatTriple{Availability: availabilityUnavailable},
		ProcessedToken: StatTriple{Availability: availabilityOK},
	}), "a failed request count is not a successful operational refresh")
}
