package controller

// P10 database-run fixture for Batch P (and later) tests.
//
// The fixture uses the real public chain model.InitDB() then model.InitLogDB()
// with IsMasterNode=false, so reserved-word columns (group/key) are initialized
// through the production initCol with no test-only seam and no copied values.
//
// SQLite uses a per-test t.TempDir file database (never a shared-memory DSN).
// PostgreSQL creates a throwaway database with a validated [a-z0-9_] name and
// tears it down progressively (test DB close -> terminate -> DROP -> admin
// close), all asserted, via a single cleanup chain.
//
// The same concept is reused by B04 / B08 / A08 / A09 / A11 / A12 / E slices.
// Tests using this fixture MUST NOT call t.Parallel: it switches process-level
// globals.

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// p10RedisCategory classifies a Redis command into a stable, sanitized
// category. The classification considers BOTH the key prefix and the
// command name. Fine-grained categories distinguish auth-cache writes
// (HSET/DEL on token:/user:) from billing/quota mutations (HINCRBY)
// so that settlement waits are not satisfied by unrelated cache writes.
//
// Production source mapping:
//
//	token-cache-write: cacheSetToken (model/token_cache.go) — HSET token:*
//	token-quota-write: cacheIncrTokenQuota (model/token_cache.go) — HINCRBY token:*
//	user-cache-write:  cacheSetUser (model/user_cache.go) — HSET user:*
//	user-quota-write:  cacheIncrUserQuota (model/user_cache.go) — HINCRBY user:*
//	rate-limit-write:  limiter.EvalSha (common/limiter/limiter.go) — EVALSHA rateLimit:*
//	perf-write:        perfmetrics.recordRedis (pkg/perf_metrics/metrics.go) — HINCRBY perf:*
type p10RedisCategory string

const (
	p10RedisCatTokenCacheWrite p10RedisCategory = "token-cache-write"
	p10RedisCatTokenQuotaWrite p10RedisCategory = "token-quota-write"
	p10RedisCatTokenRead       p10RedisCategory = "token-read"
	p10RedisCatUserCacheWrite  p10RedisCategory = "user-cache-write"
	p10RedisCatUserQuotaWrite  p10RedisCategory = "user-quota-write"
	p10RedisCatUserRead        p10RedisCategory = "user-read"
	p10RedisCatRateLimitWrite  p10RedisCategory = "rate-limit-write"
	p10RedisCatRateLimitRead   p10RedisCategory = "rate-limit-read"
	p10RedisCatPerfWrite       p10RedisCategory = "perf-write"
	p10RedisCatUnknown         p10RedisCategory = "unknown"
)

// p10BillingQuotaCategories contains the Redis mutation categories that
// represent billing/quota writes from the relay settlement/refund path.
// Auth-cache writes (token-cache-write, user-cache-write) are NOT billing
// mutations. rate-limit-write is a rate-limiter decision, not billing.
var p10BillingQuotaCategories = []p10RedisCategory{
	p10RedisCatTokenQuotaWrite,
	p10RedisCatUserQuotaWrite,
	p10RedisCatPerfWrite,
}

// p10NonEvalWriteCommands maps Redis commands (excluding EVAL/EVALSHA)
// that mutate key state. EVAL/EVALSHA are handled separately by
// classifyCommand: only scripts whose first key is rateLimit:* are
// classified as rate-limit-write; other scripts are classified as
// unknown (not trusted as generic mutations).
var p10NonEvalWriteCommands = map[string]bool{
	"set": true, "hset": true, "hincrby": true, "hincrbyfloat": true,
	"lpush": true, "rpush": true, "lpop": true, "rpop": true,
	"ltrim": true, "lset": true,
	"sadd": true, "srem": true, "spop": true,
	"zadd": true, "zincrby": true, "zrem": true,
	"del": true, "unlink": true,
	"expire": true, "pexpire": true, "expireat": true, "pexpireat": true,
	"incr": true, "incrby": true, "incrbyfloat": true,
	"decr": true, "decrby": true,
	"append": true, "mset": true,
	"setnx": true, "setex": true, "psetex": true,
	"msetnx": true,
}

// p10RedisEvent records a sanitized Redis command completion. No sensitive
// keys, tokens, passwords, or DSNs are stored.
type p10RedisEvent struct {
	Category p10RedisCategory
	Cmd      string
	Err      error
	Seq      int64
}

// p10RedisTracker is a go-redis Hook that records command completions as a
// mutex-protected event ledger. It never touches testing.T. The checkpoint/
// waitAfter pattern allows tests to wait for events after a specific point
// without consuming or discarding other events. redis.Nil (cache miss) is
// recorded but never treated as a fatal error. Notifications use sync.Cond
// inside the mutex-based predicate loop to avoid lost wakeups.
type p10RedisTracker struct {
	mu     sync.Mutex
	cond   *sync.Cond
	events []p10RedisEvent
	seq    int64
}

func newP10RedisTracker() *p10RedisTracker {
	t := &p10RedisTracker{}
	t.cond = sync.NewCond(&t.mu)
	return t
}

// classifyCommand maps a Redis command + key prefix to a sanitized
// category. EVAL/EVALSHA are handled first: only scripts whose first
// key is rateLimit:* are classified as rate-limit-write; all other
// EVAL/EVALSHA (token:*, user:*, perf:*, empty key, invalid structure)
// are classified as unknown. Non-eval/evalsha commands then fall through
// to the normal token/user/rateLimit/perf prefix classification.
func classifyCommand(cmd string, key string) p10RedisCategory {
	// EVAL/EVALSHA are always handled first — only rateLimit:* scripts
	// are trusted as writes; all others are unknown regardless of key prefix.
	if cmd == "evalsha" || cmd == "eval" {
		if strings.HasPrefix(key, "rateLimit:") {
			return p10RedisCatRateLimitWrite
		}
		return p10RedisCatUnknown
	}
	// Non-eval/evalsha commands: classify by key prefix and command type.
	switch {
	case strings.HasPrefix(key, "token:"):
		if cmd == "hincrby" || cmd == "hincrbyfloat" {
			return p10RedisCatTokenQuotaWrite
		}
		if p10NonEvalWriteCommands[cmd] {
			return p10RedisCatTokenCacheWrite
		}
		return p10RedisCatTokenRead
	case strings.HasPrefix(key, "user:"):
		if cmd == "hincrby" || cmd == "hincrbyfloat" {
			return p10RedisCatUserQuotaWrite
		}
		if p10NonEvalWriteCommands[cmd] {
			return p10RedisCatUserCacheWrite
		}
		return p10RedisCatUserRead
	case strings.HasPrefix(key, "rateLimit:"):
		if p10NonEvalWriteCommands[cmd] {
			return p10RedisCatRateLimitWrite
		}
		return p10RedisCatRateLimitRead
	case strings.HasPrefix(key, "perf:"):
		if p10NonEvalWriteCommands[cmd] {
			return p10RedisCatPerfWrite
		}
		return p10RedisCatUnknown
	default:
		return p10RedisCatUnknown
	}
}

// extractEVALSHAKey returns the first Redis key from an EVALSHA/EVAL
// command's args, following the protocol: CMD sha numkeys key1 [key2 ...] [arg1 ...]
// Returns empty string if the args structure is unexpected.
func extractEVALSHAKey(args []interface{}) string {
	if len(args) < 4 {
		return ""
	}
	numkeys, ok := toInt64(args[2])
	if !ok || numkeys < 1 {
		return ""
	}
	// The first key is at index 3.
	k, ok := args[3].(string)
	if !ok {
		return ""
	}
	return k
}

// toInt64 converts a numeric interface to int64.
func toInt64(v interface{}) (int64, bool) {
	switch n := v.(type) {
	case int:
		return int64(n), true
	case int64:
		return n, true
	case uint64:
		return int64(n), true
	case float64:
		return int64(n), true
	default:
		return 0, false
	}
}

func (t *p10RedisTracker) BeforeProcess(ctx context.Context, cmd redis.Cmder) (context.Context, error) {
	return ctx, nil
}

func (t *p10RedisTracker) AfterProcess(ctx context.Context, cmd redis.Cmder) error {
	args := cmd.Args()
	cmdName := cmd.Name()
	var key string
	switch cmdName {
	case "evalsha", "eval":
		// For EVALSHA/EVAL: args = [cmd, sha/script, numkeys, key1, ...].
		key = extractEVALSHAKey(args)
	default:
		// For normal commands: args = [cmd, key, ...].
		if len(args) >= 2 {
			if k, ok := args[1].(string); ok {
				key = k
			}
		}
	}
	cat := classifyCommand(cmdName, key)
	t.mu.Lock()
	t.seq++
	t.events = append(t.events, p10RedisEvent{
		Category: cat,
		Cmd:      cmdName,
		Err:      cmd.Err(),
		Seq:      t.seq,
	})
	t.cond.Broadcast()
	t.mu.Unlock()
	return nil
}

func (t *p10RedisTracker) BeforeProcessPipeline(ctx context.Context, cmds []redis.Cmder) (context.Context, error) {
	return ctx, nil
}

func (t *p10RedisTracker) AfterProcessPipeline(ctx context.Context, cmds []redis.Cmder) error {
	for _, cmd := range cmds {
		t.AfterProcess(ctx, cmd)
	}
	return nil
}

// checkpoint returns the current sequence number. Events added after this
// point can be waited on with waitAfter.
func (t *p10RedisTracker) checkpoint() int64 {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.seq
}

// p10WaitRequirement specifies how many events of a given category must
// appear after a checkpoint. Only write categories satisfy settlement/
// refund/telemetry waits; read categories are used for auth-path queries.
type p10WaitRequirement struct {
	Category p10RedisCategory
	Count    int
}

// p10WaitResult reports what was observed after a checkpoint.
type p10WaitResult struct {
	Matched  []p10RedisEvent
	Errors   []p10RedisEvent // non-redis.Nil errors among matched events
	TimedOut bool
}

// waitAfter blocks until all requirements are satisfied by events with
// sequence > afterSeq, or until the deadline fires. Uses sync.Cond.Wait
// inside a proper mutex-held predicate loop to avoid lost wakeups and
// deadlocks. The timer is stopped on success to avoid goroutine leaks.
// Returns a result the caller asserts on.
func (t *p10RedisTracker) waitAfter(afterSeq int64, reqs []p10WaitRequirement, timeout time.Duration) p10WaitResult {
	timedOut := false
	var timer *time.Timer
	if timeout > 0 {
		timer = time.AfterFunc(timeout, func() {
			t.mu.Lock()
			timedOut = true
			t.cond.Broadcast()
			t.mu.Unlock()
		})
		defer timer.Stop()
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	for {
		// Predicate: scan events under lock, check requirements.
		var matched []p10RedisEvent
		var errs []p10RedisEvent
		catCounts := map[p10RedisCategory]int{}
		for _, evt := range t.events {
			if evt.Seq > afterSeq {
				matched = append(matched, evt)
				catCounts[evt.Category]++
				if evt.Err != nil && evt.Err != redis.Nil {
					errs = append(errs, evt)
				}
			}
		}
		allMet := true
		for _, r := range reqs {
			if catCounts[r.Category] < r.Count {
				allMet = false
				break
			}
		}
		if allMet {
			return p10WaitResult{Matched: matched, Errors: errs}
		}
		if timedOut {
			return p10WaitResult{Matched: matched, Errors: errs, TimedOut: true}
		}
		t.cond.Wait()
	}
}

// p10DatabaseFixture is a fully-initialized model.DB / model.LOG_DB that has
// gone through the real production init chain.
type p10DatabaseFixture struct {
	db     *gorm.DB
	dbType common.DatabaseType
}

// --- RED/GREEN tests for tracker timeout and lost-wakeup ---

// TestP10TrackerTimeoutNoEvents proves that waitAfter with a short timeout
// returns TimedOut when no events arrive (not a permanent hang). This was
// a RED test in CP10 — the old implementation had a deadlock when no
// events arrived and the timer fired before the cond.Wait.
func TestP10TrackerTimeoutNoEvents(t *testing.T) {
	tr := newP10RedisTracker()
	ckpt := tr.checkpoint()
	result := tr.waitAfter(ckpt, []p10WaitRequirement{
		{Category: p10RedisCatTokenQuotaWrite, Count: 1},
	}, 200*time.Millisecond)
	assert.True(t, result.TimedOut, "must return TimedOut when no events arrive")
	assert.Empty(t, result.Matched, "no events should be matched")
}

// TestP10TrackerEventsAfterCheckpointBeforeWait proves that events arriving
// after the checkpoint but before waitAfter starts are still visible in the
// result (no lost wakeup). Uses HINCRBY on user:* which is user-quota-write.
func TestP10TrackerEventsAfterCheckpointBeforeWait(t *testing.T) {
	tr := newP10RedisTracker()
	_ = tr.checkpoint()
	// An event arrives before the checkpoint (user-quota-write).
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "hincrby", "user:100", "quota", "10"))
	ckpt := tr.checkpoint()
	// A new event arrives after checkpoint but before waitAfter starts.
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "hincrby", "user:100", "quota", "5"))
	result := tr.waitAfter(ckpt, []p10WaitRequirement{
		{Category: p10RedisCatUserQuotaWrite, Count: 1},
	}, 500*time.Millisecond)
	assert.False(t, result.TimedOut, "must NOT time out — event already arrived")
	assert.GreaterOrEqual(t, len(result.Matched), 1, "must observe the user-quota-write event")
}

// TestP10TrackerReadDoesNotSatisfyWrite proves that read commands (HGET,
// HGETALL, LLEN, LINDEX) never satisfy any write requirement.
func TestP10TrackerReadDoesNotSatisfyWrite(t *testing.T) {
	tr := newP10RedisTracker()
	ckpt := tr.checkpoint()
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "hget", "token:abc"))
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "hgetall", "user:123"))
	result := tr.waitAfter(ckpt, []p10WaitRequirement{
		{Category: p10RedisCatTokenQuotaWrite, Count: 1},
	}, 200*time.Millisecond)
	assert.True(t, result.TimedOut, "HGET/HGETALL must NOT satisfy any write requirement")
}

// TestP10TrackerCacheVsQuotaDistinction proves that HSET on token:*
// satisfies token-cache-write but NOT token-quota-write, while HINCRBY
// on token:* satisfies token-quota-write. Same for user:*.
func TestP10TrackerCacheVsQuotaDistinction(t *testing.T) {
	tr := newP10RedisTracker()

	// --- token:* ---
	ckpt := tr.checkpoint()
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "hset", "token:abc"))
	result := tr.waitAfter(ckpt, []p10WaitRequirement{
		{Category: p10RedisCatTokenQuotaWrite, Count: 1},
	}, 200*time.Millisecond)
	assert.True(t, result.TimedOut, "HSET must NOT satisfy token-quota-write")

	tr2 := newP10RedisTracker()
	ckpt2 := tr2.checkpoint()
	tr2.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "hincrby", "token:abc", "remain_quota", "25"))
	result2 := tr2.waitAfter(ckpt2, []p10WaitRequirement{
		{Category: p10RedisCatTokenQuotaWrite, Count: 1},
	}, 500*time.Millisecond)
	assert.False(t, result2.TimedOut, "HINCRBY must satisfy token-quota-write")

	// --- user:* ---
	tr3 := newP10RedisTracker()
	ckpt3 := tr3.checkpoint()
	tr3.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "hset", "user:123"))
	result3 := tr3.waitAfter(ckpt3, []p10WaitRequirement{
		{Category: p10RedisCatUserQuotaWrite, Count: 1},
	}, 200*time.Millisecond)
	assert.True(t, result3.TimedOut, "HSET must NOT satisfy user-quota-write")

	tr4 := newP10RedisTracker()
	ckpt4 := tr4.checkpoint()
	tr4.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "hincrby", "user:123", "quota", "25"))
	result4 := tr4.waitAfter(ckpt4, []p10WaitRequirement{
		{Category: p10RedisCatUserQuotaWrite, Count: 1},
	}, 500*time.Millisecond)
	assert.False(t, result4.TimedOut, "HINCRBY must satisfy user-quota-write")
}

// TestP10TrackerRateLimitReadWrite proves that LLEN/LINDEX on rateLimit:*
// are classified as rate-limit-read (not write), while EVALSHA with a
// rateLimit:* key is classified as rate-limit-write.
func TestP10TrackerRateLimitReadWrite(t *testing.T) {
	tr := newP10RedisTracker()
	ckpt := tr.checkpoint()
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "llen", "rateLimit:123"))
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "lindex", "rateLimit:123", "0"))
	result := tr.waitAfter(ckpt, []p10WaitRequirement{
		{Category: p10RedisCatRateLimitWrite, Count: 1},
	}, 200*time.Millisecond)
	assert.True(t, result.TimedOut, "LLEN/LINDEX must NOT satisfy rate-limit-write")

	// EVALSHA with rateLimit:* key is classified as rate-limit-write.
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "evalsha", "sha123", 1, "rateLimit:123", 1, 1, 1))
	result2 := tr.waitAfter(ckpt, []p10WaitRequirement{
		{Category: p10RedisCatRateLimitWrite, Count: 1},
	}, 500*time.Millisecond)
	assert.False(t, result2.TimedOut, "EVALSHA with rateLimit:* key must satisfy rate-limit-write")
}

// TestP10TrackerEvalEVALSHACategory proves that EVAL/EVALSHA are handled
// before the normal key-prefix classification. Only scripts whose first
// key is rateLimit:* are classified as rate-limit-write; all other
// EVAL/EVALSHA are classified as unknown regardless of key prefix. The
// test directly asserts the final Category field on each event, not a
// negative "not in some set" assertion.
func TestP10TrackerEvalEVALSHACategory(t *testing.T) {
	tr := newP10RedisTracker()
	ckpt := tr.checkpoint()
	// EVALSHA + rateLimit:* → rate-limit-write
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "evalsha", "sha123", 1, "rateLimit:123", 1, 1, 1))
	// EVAL + rateLimit:* → rate-limit-write
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "eval", "return 1", 1, "rateLimit:456", 1))
	// EVALSHA + token:* → unknown
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "evalsha", "sha456", 1, "token:abc", 1))
	// EVAL + user:* → unknown
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "eval", "return 1", 1, "user:123", 1))
	// EVALSHA + perf:* → unknown
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "evalsha", "sha789", 1, "perf:123", 1))
	// EVALSHA + numkeys=0 → unknown
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "evalsha", "sha999", 0, "rateLimit:123"))
	// EVALSHA + missing key → unknown
	tr.AfterProcess(context.Background(), redis.NewCmd(context.Background(), "evalsha", "sha999", 1))

	want := []p10RedisCategory{
		p10RedisCatRateLimitWrite, p10RedisCatRateLimitWrite,
		p10RedisCatUnknown, p10RedisCatUnknown, p10RedisCatUnknown,
		p10RedisCatUnknown, p10RedisCatUnknown,
	}

	result := tr.waitAfter(ckpt, nil, 500*time.Millisecond)
	require.False(t, result.TimedOut, "events must arrive")
	require.Len(t, result.Matched, len(want), "must observe exactly %d events", len(want))

	for i, w := range want {
		assert.Equal(t, w, result.Matched[i].Category,
			"event %d: cmd=%q → category mismatch", i, result.Matched[i].Cmd)
	}
}

// TestP10TrackerEVALSHAKeyExtraction proves that extractEVALSHAKey
// correctly parses the key from an EVALSHA command's args.
func TestP10TrackerEVALSHAKeyExtraction(t *testing.T) {
	tests := []struct {
		name string
		args []interface{}
		want string
	}{
		{"standard evalsha", []interface{}{"evalsha", "sha", 1, "rateLimit:123"}, "rateLimit:123"},
		{"with extra args", []interface{}{"evalsha", "sha", 1, "rateLimit:123", 1, 1, 1}, "rateLimit:123"},
		{"two keys", []interface{}{"evalsha", "sha", 2, "rateLimit:123", "rateLimit:456"}, "rateLimit:123"},
		{"too few args", []interface{}{"evalsha", "sha", 1}, ""},
		{"numkeys=0", []interface{}{"evalsha", "sha", 0, "rateLimit:123"}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractEVALSHAKey(tt.args)
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestP10TrackerRedisNilNotFatal proves that redis.Nil is recorded but
// never treated as a fatal error.
func TestP10TrackerRedisNilNotFatal(t *testing.T) {
	tr := newP10RedisTracker()
	ckpt := tr.checkpoint()
	cmd := redis.NewCmd(context.Background(), "hget", "token:abc")
	cmd.SetErr(redis.Nil)
	tr.AfterProcess(context.Background(), cmd)
	result := tr.waitAfter(ckpt, []p10WaitRequirement{
		{Category: p10RedisCatTokenRead, Count: 1},
	}, 200*time.Millisecond)
	assert.Empty(t, result.Errors, "redis.Nil must NOT appear in Errors")
}

// p10DatabaseTarget is one configured database (sqlite always; postgres only
// when TEST_POSTGRES_DSN is set).
type p10DatabaseTarget struct {
	Name   string
	dbType common.DatabaseType
}

// p10ConfiguredTargets returns the databases a body runs on. PostgreSQL is
// included only when TEST_POSTGRES_DSN is set, and is never skipped then.
func p10ConfiguredTargets() []p10DatabaseTarget {
	targets := []p10DatabaseTarget{{Name: "sqlite", dbType: common.DatabaseTypeSQLite}}
	if strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN")) != "" {
		targets = append(targets, p10DatabaseTarget{Name: "postgres", dbType: common.DatabaseTypePostgreSQL})
	}
	return targets
}

// p10RunAcrossDatabases runs body once per configured database, naming the
// subtests <name>/sqlite and (when TEST_POSTGRES_DSN is set) <name>/postgres.
// The explicit database target is passed to the body; no mutable package-level
// switch is used.
func p10RunAcrossDatabases(t *testing.T, name string, body func(t *testing.T, dbType common.DatabaseType)) {
	t.Helper()
	for _, target := range p10ConfiguredTargets() {
		target := target
		t.Run(name+"/"+target.Name, func(t *testing.T) {
			body(t, target.dbType)
		})
	}
}

// p10SetupDatabase initializes model.DB / model.LOG_DB through the real
// production chain for the given database type and migrates the given tables.
// All affected globals are restored, and the test database handle is closed
// with an asserted result.
func p10SetupDatabase(t *testing.T, dbType common.DatabaseType, tables ...interface{}) *p10DatabaseFixture {
	t.Helper()
	gin.SetMode(gin.TestMode)

	prevDB := model.DB
	prevLogDB := model.LOG_DB
	prevMainType := common.MainDatabaseType()
	prevLogType := common.LogDatabaseType()
	prevIsMasterNode := common.IsMasterNode
	prevSQLitePath := common.SQLitePath
	prevSQLDSN, hadSQLDSN := os.LookupEnv("SQL_DSN")
	prevLogSQLDSN, hadLogSQLDSN := os.LookupEnv("LOG_SQL_DSN")

	// Save Redis globals so they can be restored after the async telemetry
	// goroutine has finished. The relay smoke test's setupRelaySmoke
	// overrides these with a miniredis instance; non-relay tests stay
	// with the safe in-process state.
	prevRedisEnabled := common.RedisEnabled
	prevRDB := common.RDB
	common.RedisEnabled = false
	common.RDB = nil
	common.IsMasterNode = false

	switch dbType {
	case common.DatabaseTypePostgreSQL:
		baseDSN := strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN"))
		require.NotEmpty(t, baseDSN, "TEST_POSTGRES_DSN must be set to use the postgres target")
		testDSN := p10CreateIsolatedPostgres(t, baseDSN)
		require.NoError(t, os.Setenv("SQL_DSN", testDSN))
		require.NoError(t, os.Unsetenv("LOG_SQL_DSN"))
		common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	default:
		// Per-test file database in an isolated temp dir; never shared memory.
		common.SQLitePath = filepath.Join(t.TempDir(), "p10.db")
		common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
		require.NoError(t, os.Setenv("SQL_DSN", "local"))
		require.NoError(t, os.Unsetenv("LOG_SQL_DSN"))
	}

	// Real production init chain (runs initCol internally).
	require.NoError(t, model.InitDB())
	require.NoError(t, model.InitLogDB())

	// The initialized handle must expose a live *sql.DB before we migrate.
	testDB := model.DB
	sqlDB, err := testDB.DB()
	require.NoError(t, err, "model.DB must expose a *sql.DB")
	require.NotNil(t, sqlDB)

	// Migrate the tables this slice needs on the initialized model.DB.
	if len(tables) > 0 {
		require.NoError(t, model.DB.AutoMigrate(tables...))
	}

	// Restore every global exactly as found, then close the test database with
	// an asserted result, then run the PG teardown. Restoring globals first
	// means any late goroutine referencing model.DB / model.LOG_DB reaches the
	// original handles, never the closed test database.
	// NOTE: Redis globals (prevRedisEnabled, prevRDB) are restored after the
	// test body's async readers (gopool telemetry, refund barrier) have
	// joined. For relay tests, setupRelaySmoke provides a miniredis
	// instance that is closed in its own cleanup, guaranteeing no late
	// Redis access after the test returns.
	t.Cleanup(func() {
		model.DB = prevDB
		model.LOG_DB = prevLogDB
		common.SetDatabaseTypes(prevMainType, prevLogType)
		common.IsMasterNode = prevIsMasterNode
		common.SQLitePath = prevSQLitePath
		common.RedisEnabled = prevRedisEnabled
		common.RDB = prevRDB
		if hadSQLDSN {
			require.NoError(t, os.Setenv("SQL_DSN", prevSQLDSN))
		} else {
			require.NoError(t, os.Unsetenv("SQL_DSN"))
		}
		if hadLogSQLDSN {
			require.NoError(t, os.Setenv("LOG_SQL_DSN", prevLogSQLDSN))
		} else {
			require.NoError(t, os.Unsetenv("LOG_SQL_DSN"))
		}
		if sqlDB, err := testDB.DB(); err == nil {
			assert.NoError(t, sqlDB.Close(), "test database close must succeed")
		}
		// PG teardown is handled by p10CreateIsolatedPostgres's own
		// cleanup (registered there). No manual pgCleanup() call here.
	})

	return &p10DatabaseFixture{db: testDB, dbType: dbType}
}

// p10PGNamePattern restricts throwaway database names to safe, unquoted
// PostgreSQL identifiers.
var p10PGNamePattern = regexp.MustCompile(`^[a-z0-9_]+$`)

// p10CreateIsolatedPostgres creates a throwaway PostgreSQL database on the
// configured server, validates the generated name, registers its own cleanup
// (single owner), and returns the test DSN. The cleanup chain is:
// close test validation pool → terminate backends → DROP test DB → close
// admin pool. Each step asserts its own error. The cleanup is registered
// before CREATE so a CREATE failure still cleans up admin resources.
// p10SetupDatabase does NOT return or manually call this cleanup; it relies
// on t.Cleanup LIFO ordering.
func p10CreateIsolatedPostgres(t *testing.T, baseDSN string) string {
	t.Helper()
	dbName := fmt.Sprintf("p10c%d_%d", os.Getpid(), time.Now().UnixNano())
	require.True(t, p10PGNamePattern.MatchString(dbName),
		"generated PG database name %q must match %s", dbName, p10PGNamePattern.String())

	admin, err := gorm.Open(postgres.New(postgres.Config{DSN: baseDSN}), &gorm.Config{})
	require.NoError(t, err)
	adminSQL, err := admin.DB()
	require.NoError(t, err)

	var (
		testSQL   *sql.DB
		dbCreated bool
	)

	// Single cleanup chain, registered before CREATE so a CREATE failure
	// still closes the admin connection. Each step asserts its own error;
	// cleanup continues even if one step fails.
	t.Cleanup(func() {
		if testSQL != nil {
			assert.NoError(t, testSQL.Close(), "test pool close must succeed")
			testSQL = nil
		}
		if dbCreated {
			_, termErr := adminSQL.Exec(
				`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
				dbName,
			)
			assert.NoError(t, termErr, "terminate backends must succeed")
			_, dropErr := adminSQL.Exec("DROP DATABASE IF EXISTS " + dbName)
			assert.NoError(t, dropErr, "DROP DATABASE must succeed")
			dbCreated = false
		}
		assert.NoError(t, adminSQL.Close(), "admin connection close must succeed")
	})

	_, err = adminSQL.Exec("CREATE DATABASE " + dbName)
	require.NoError(t, err)
	dbCreated = true

	testDSN, err := replacePostgresDSNDBName(baseDSN, dbName)
	require.NoError(t, err)
	testDB, err := gorm.Open(postgres.New(postgres.Config{DSN: testDSN}), &gorm.Config{})
	require.NoError(t, err)
	testSQL, err = testDB.DB()
	require.NoError(t, err)

	return testDSN
}
