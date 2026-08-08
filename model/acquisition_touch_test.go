package model

import (
	"bytes"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// acquisitionFixture prepares the shared in-memory test DB (see TestMain in
// task_cas_test.go) for acquisition tests and restores touched globals.
func acquisitionFixture(t *testing.T) {
	t.Helper()

	origSecret := common.CryptoSecret
	origConsume := common.LogConsumeEnabled
	t.Cleanup(func() {
		common.CryptoSecret = origSecret
		common.LogConsumeEnabled = origConsume
		assert.NoError(t, DB.AutoMigrate(&Token{}), "restore tokens table")
	})

	common.CryptoSecret = "acquisition-model-test-secret"
	common.LogConsumeEnabled = true

	require.NoError(t, DB.AutoMigrate(&AcquisitionTouch{}, &Option{}))
	require.NoError(t, DB.Exec("DELETE FROM acquisition_touches").Error)
	require.NoError(t, DB.Where("key = ?", AcquisitionCoverageStartedAtKey).Delete(&Option{}).Error)
	require.NoError(t, DB.Exec("DELETE FROM tokens").Error)
	require.NoError(t, DB.Exec("DELETE FROM logs").Error)
}

func TestAcquisitionSanitizeUTMValueBasics(t *testing.T) {
	acquisitionFixture(t)

	cases := []struct {
		name   string
		raw    string
		maxLen int
		want   string
	}{
		{"empty", "", 64, ""},
		{"trim", "  reddit  ", 64, "reddit"},
		{"whitespace collapse", "foo   bar", 64, "foo_bar"},
		// Tab is a control character (U+0009 ∈ U+0000–U+001F): step 2 strips
		// it before step 4's whitespace collapse can see it.
		{"tab stripped as control char", "foo\tbar", 64, "foobar"},
		{"control char dropped", "a\x00b\x1fc", 64, "abc"},
		{"del dropped", "a\x7fb", 64, "ab"},
		{"only control chars", "\x00\x01\x7f", 64, ""},
		{"allowlist kept", "a.b_c-d%e", 64, "a.b_c-d%e"},
		{"disallowed dropped", "p@ss!word", 64, "pssword"},
		{"all disallowed", "@@@###", 64, ""},
		{"truncate source", strings.Repeat("x", 100), 64, strings.Repeat("x", 64)},
		{"truncate campaign", strings.Repeat("y", 200), 128, strings.Repeat("y", 128)},
		{"whitespace only", "   ", 64, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, SanitizeUTMValue(tc.raw, tc.maxLen))
		})
	}
}

// TestAcquisitionSanitizeUTMValueOrder pins the §7.2 step order: trim →
// control-strip → truncate → whitespace-collapse → allowlist. Each case
// distinguishes the correct order from a plausible wrong order.
func TestAcquisitionSanitizeUTMValueOrder(t *testing.T) {
	// Truncate happens before the allowlist strip: "a!!!b!!!c!!!d" cut to 5
	// bytes is "a!!!b", which then strips to "ab". An allowlist-first
	// implementation would yield "abcd".
	assert.Equal(t, "ab", SanitizeUTMValue("a!!!b!!!c!!!d", 5))

	// Truncate happens before whitespace collapse: "a  b  c" cut to 5 bytes
	// is "a  b ", collapsing to "a_b". A collapse-first implementation would
	// yield "a_b_c" truncated to "a_b_c".
	assert.Equal(t, "a_b", SanitizeUTMValue("a  b  c", 5))

	// Control chars are stripped before truncation, so they do not consume
	// the byte budget.
	assert.Equal(t, "xxxxx", SanitizeUTMValue("\x00\x00\x00xxxxxxxxxx", 5))

	// Invalid UTF-8 is repaired before truncation and never splits a rune:
	// "é" is 2 bytes, so a 3-byte budget keeps "éa", not a broken half-rune.
	assert.Equal(t, "a", SanitizeUTMValue("éabc", 3))
	// é itself is outside the ASCII allowlist and disappears entirely.
	assert.Equal(t, "", SanitizeUTMValue("ééé", 3))
}

func TestAcquisitionSanitizeLandingPath(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want string
	}{
		{"valid keeps path", "/kimi-k3-api", "/kimi-k3-api"},
		{"query and fragment stripped", "/kimi-k3-api?utm_source=x#frag", "/kimi-k3-api"},
		{"scheme relative rejected", "//evil.com/path", ""},
		{"https rejected", "https://evil.com/x", ""},
		{"http rejected", "http://evil.com/x", ""},
		{"upper scheme rejected", "HTTPS://evil.com/x", ""},
		{"backslash rejected", "/path\\with\\slash", ""},
		{"relative rejected", "relative", ""},
		{"empty rejected", "", ""},
		{"whitespace rejected", "/has space", ""},
		{"interior crlf rejected", "/cr\nlf", ""},
		{"surrounding crlf trimmed", "/crlf\r\n", "/crlf"},
		{"duplicate slashes collapsed", "/a//b///c", "/a/b/c"},
		{"root", "/", "/"},
		{"long path truncated at 255", "/" + strings.Repeat("a", 300), "/" + strings.Repeat("a", 254)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, SanitizeLandingPath(tc.raw))
		})
	}
}

func TestAcquisitionCookieSignAndVerify(t *testing.T) {
	acquisitionFixture(t)

	common.CryptoSecret = "secret-a"
	id := "0123456789abcdef0123456789abcdef"
	val := FormatTouchCookieValue(id)

	got, ok := ParseAndVerifyTouchCookie(val)
	require.True(t, ok)
	assert.Equal(t, id, got)

	// Tampered signature fails.
	_, ok = ParseAndVerifyTouchCookie(id + ".deadbeef")
	assert.False(t, ok)

	// Signature from a different secret fails (rotation invalidates).
	common.CryptoSecret = "secret-b"
	_, ok = ParseAndVerifyTouchCookie(val)
	assert.False(t, ok)
	common.CryptoSecret = "secret-a"

	// Format violations fail.
	bad := []string{
		"",                                       // empty
		id,                                       // no separator
		"." + val,                                // empty id
		id + ".",                                 // empty signature
		"NOT-HEX-ID!!!!!!!!!!!!!!!!!!!!!!!!.abc", // bad charset
		strings.ToUpper(id) + "." + val[strings.IndexByte(val, '.')+1:], // uppercase hex rejected
		id + "." + "00" + "." + "11",                                    // two separators
	}
	for _, raw := range bad {
		_, ok := ParseAndVerifyTouchCookie(raw)
		assert.False(t, ok, "value %q must be rejected", raw)
	}
}

func TestAcquisitionFirstLandingSnapshotImmutable(t *testing.T) {
	acquisitionFixture(t)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{
		UtmSource:   "reddit",
		UtmCampaign: "kimi_k3_launch",
		LandingPath: "/kimi-k3-api?utm_source=reddit",
	})
	require.NoError(t, err)
	require.NotEmpty(t, touch.TouchId)
	assert.Len(t, touch.TouchId, 32)
	assert.Equal(t, "reddit", touch.UtmSource)
	assert.Equal(t, "/kimi-k3-api", touch.LandingPath) // query stripped

	// A second landing call creates a separate row; the first snapshot is
	// untouched. There is intentionally no update path for UTM fields.
	touch2, err := CreateAcquisitionTouch(AcquisitionUTMFields{
		UtmSource:   "twitter",
		LandingPath: "/other",
	})
	require.NoError(t, err)
	assert.NotEqual(t, touch.TouchId, touch2.TouchId)

	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	assert.Equal(t, "reddit", loaded.UtmSource)
	assert.Equal(t, "kimi_k3_launch", loaded.UtmCampaign)
	assert.Equal(t, "/kimi-k3-api", loaded.LandingPath)

	var count int64
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(2), count)
}

func TestAcquisitionDirectUnknownFirstTouch(t *testing.T) {
	acquisitionFixture(t)

	// Empty UTM is a valid direct/unknown first touch.
	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/home"})
	require.NoError(t, err)
	assert.Equal(t, "", touch.UtmSource)
	assert.Equal(t, "", touch.UtmMedium)
	assert.Equal(t, "", touch.UtmCampaign)
	assert.Equal(t, "", touch.UtmContent)
	assert.Equal(t, "", touch.UtmTerm)
	assert.Equal(t, "/home", touch.LandingPath)
}

func TestAcquisitionSignupStartedNoCreateAndSetIfNull(t *testing.T) {
	acquisitionFixture(t)

	// Missing touch: soft no-op, no row created.
	present, err := MarkAcquisitionSignupStarted("0123456789abcdef0123456789abcdef")
	require.NoError(t, err)
	assert.False(t, present)
	var count int64
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(0), count)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/sign-up"})
	require.NoError(t, err)

	// First mark sets the timestamp.
	present, err = MarkAcquisitionSignupStarted(touch.TouchId)
	require.NoError(t, err)
	assert.True(t, present)
	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.SignupStartedAt)

	// A repeat must not rewrite the first-write timestamp: force an older
	// known value, mark again, and require it to survive untouched.
	older := *loaded.SignupStartedAt - 1000
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Where("id = ?", loaded.Id).
		Update("signup_started_at", older).Error)
	present, err = MarkAcquisitionSignupStarted(touch.TouchId)
	require.NoError(t, err)
	assert.True(t, present)
	reloaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, reloaded.SignupStartedAt)
	assert.Equal(t, older, *reloaded.SignupStartedAt)
}

func TestAcquisitionBindGuardsAndIdempotency(t *testing.T) {
	acquisitionFixture(t)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{UtmSource: "x", LandingPath: "/"})
	require.NoError(t, err)

	// Missing touch and malformed id are silent no-ops.
	BindAcquisitionTouchToUser("0123456789abcdef0123456789abcdef", 1)
	BindAcquisitionTouchToUser("not-a-valid-id", 1)

	// First bind succeeds and fills both milestones (client may have skipped
	// signup_started on the OAuth path).
	BindAcquisitionTouchToUser(touch.TouchId, 42)
	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.UserId)
	assert.Equal(t, 42, *loaded.UserId)
	require.NotNil(t, loaded.SignupCompletedAt)
	require.NotNil(t, loaded.SignupStartedAt)

	// Repeat bind for the same user stays a no-op success.
	BindAcquisitionTouchToUser(touch.TouchId, 42)
	loaded2, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	assert.Equal(t, 42, *loaded2.UserId)

	// A different user cannot steal a bound touch.
	BindAcquisitionTouchToUser(touch.TouchId, 99)
	loaded3, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	assert.Equal(t, 42, *loaded3.UserId)

	// A new touch cannot bind to an already-bound user.
	touch2, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/b"})
	require.NoError(t, err)
	BindAcquisitionTouchToUser(touch2.TouchId, 42)
	loaded4, err := GetAcquisitionTouchByTouchID(touch2.TouchId)
	require.NoError(t, err)
	assert.Nil(t, loaded4.UserId)
	assert.Nil(t, loaded4.SignupCompletedAt)
}

// A same-user re-bind must only fill missing milestones via set-if-null and
// must never overwrite first-write timestamps.
func TestAcquisitionBindSameUserSetIfNullPreservesMilestones(t *testing.T) {
	acquisitionFixture(t)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/bind"})
	require.NoError(t, err)
	BindAcquisitionTouchToUser(touch.TouchId, 55)
	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.SignupCompletedAt)
	require.NotNil(t, loaded.SignupStartedAt)

	oldCompleted := *loaded.SignupCompletedAt - 1000
	oldStarted := *loaded.SignupStartedAt - 1000
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Where("id = ?", loaded.Id).Updates(map[string]interface{}{
		"signup_completed_at": oldCompleted,
		"signup_started_at":   oldStarted,
	}).Error)

	BindAcquisitionTouchToUser(touch.TouchId, 55)
	again, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	assert.Equal(t, oldCompleted, *again.SignupCompletedAt)
	assert.Equal(t, oldStarted, *again.SignupStartedAt)

	// If completed_at is missing on an already-bound touch, re-bind fills it.
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Where("id = ?", loaded.Id).
		Update("signup_completed_at", nil).Error)
	BindAcquisitionTouchToUser(touch.TouchId, 55)
	filled, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, filled.SignupCompletedAt)
	assert.GreaterOrEqual(t, *filled.SignupCompletedAt, oldCompleted)
}

// Multiple NULL user_id rows must be legal; duplicate non-NULL user_id must
// be rejected by the unique index (all three supported databases).
func TestAcquisitionNullableUserIdUnique(t *testing.T) {
	acquisitionFixture(t)

	for i := 0; i < 3; i++ {
		_, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/"})
		require.NoError(t, err)
	}
	var nulls int64
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Where("user_id IS NULL").Count(&nulls).Error)
	assert.Equal(t, int64(3), nulls)

	uid := 7
	t1, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/1"})
	require.NoError(t, err)
	require.NoError(t, DB.Model(t1).Update("user_id", uid).Error)

	t2, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/2"})
	require.NoError(t, err)
	err = DB.Model(t2).Update("user_id", uid).Error
	require.Error(t, err, "duplicate non-NULL user_id must violate the unique index")
}

func TestAcquisitionCoverageInsertIfAbsentNeverOverwrite(t *testing.T) {
	acquisitionFixture(t)

	// Pre-seeded value wins: insert-if-absent must never overwrite.
	require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "100"}).Error)
	v, err := EnsureAcquisitionCoverageStartedAt()
	require.NoError(t, err)
	assert.Equal(t, int64(100), v)

	// Fresh key: written once, then stable across repeated calls.
	require.NoError(t, DB.Where("key = ?", AcquisitionCoverageStartedAtKey).Delete(&Option{}).Error)
	v1, err := EnsureAcquisitionCoverageStartedAt()
	require.NoError(t, err)
	assert.Greater(t, v1, int64(0))
	v2, err := EnsureAcquisitionCoverageStartedAt()
	require.NoError(t, err)
	assert.Equal(t, v1, v2)

	stored, err := GetAcquisitionCoverageStartedAt()
	require.NoError(t, err)
	assert.Equal(t, v1, stored)

	var rows int64
	require.NoError(t, DB.Model(&Option{}).Where("key = ?", AcquisitionCoverageStartedAtKey).Count(&rows).Error)
	assert.Equal(t, int64(1), rows)

	// Missing key read is a typed not-found error, so funnel can fail loudly.
	require.NoError(t, DB.Where("key = ?", AcquisitionCoverageStartedAtKey).Delete(&Option{}).Error)
	_, err = GetAcquisitionCoverageStartedAt()
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
}

// Concurrent first-boot inits must converge on one stored value with exactly
// one options row (verified under -race by the gate commands).
func TestAcquisitionCoverageConcurrentInit(t *testing.T) {
	acquisitionFixture(t)

	const workers = 8
	var wg sync.WaitGroup
	results := make([]int64, workers)
	errs := make([]error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], errs[i] = EnsureAcquisitionCoverageStartedAt()
		}(i)
	}
	wg.Wait()

	for i := 0; i < workers; i++ {
		require.NoError(t, errs[i])
		assert.Equal(t, results[0], results[i], "all inits must read the same final value")
	}
	assert.Greater(t, results[0], int64(0))

	var rows int64
	require.NoError(t, DB.Model(&Option{}).Where("key = ?", AcquisitionCoverageStartedAtKey).Count(&rows).Error)
	assert.Equal(t, int64(1), rows)
}

// funnelFixture seeds the coverage marker plus a deterministic window dataset
// used by the funnel tests: window [1000, 2000).
//
//	touch B: reddit/kimi_k3_launch, first_seen 1500, started 1600,
//	         user 11 completed 1700, tokens 1800 (soft-deleted) + 2500,
//	         consume logs 1900 (kimi-k3), 2000 (kimi-k3), 1850 (other-model)
//	touch A: no UTM, first_seen 1500, user 10 completed 2500 (>= to)
//	touch C: no UTM, first_seen 1500, started exactly 2000 (== to)
//	touch D: no UTM, first_seen 1500, user 12 completed 1750,
//	         token created exactly 2000 (== to)
func funnelFixture(t *testing.T) {
	acquisitionFixture(t)
	require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "1"}).Error)

	startedB := int64(1600)
	completedB := int64(1700)
	uidB := 11
	require.NoError(t, DB.Create(&AcquisitionTouch{
		TouchId: common.GetUUID(), UserId: &uidB,
		UtmSource: "reddit", UtmCampaign: "kimi_k3_launch",
		FirstSeenAt: 1500, SignupStartedAt: &startedB, SignupCompletedAt: &completedB,
		CreatedAt: 1500, UpdatedAt: 1700,
	}).Error)

	completedA := int64(2500)
	uidA := 10
	require.NoError(t, DB.Create(&AcquisitionTouch{
		TouchId: common.GetUUID(), UserId: &uidA,
		FirstSeenAt: 1500, SignupCompletedAt: &completedA,
		CreatedAt: 1500, UpdatedAt: 1500,
	}).Error)

	startedC := int64(2000) // exactly at the exclusive upper bound
	require.NoError(t, DB.Create(&AcquisitionTouch{
		TouchId: common.GetUUID(), FirstSeenAt: 1500, SignupStartedAt: &startedC,
		CreatedAt: 1500, UpdatedAt: 1500,
	}).Error)

	completedD := int64(1750)
	uidD := 12
	require.NoError(t, DB.Create(&AcquisitionTouch{
		TouchId: common.GetUUID(), UserId: &uidD,
		FirstSeenAt: 1500, SignupCompletedAt: &completedD,
		CreatedAt: 1500, UpdatedAt: 1500,
	}).Error)

	// User 11: earliest token 1800 (soft-deleted), later token 2500.
	tokEarly := &Token{UserId: uidB, Key: "acq-funnel-key-early", Name: "early", CreatedTime: 1800, Status: 1}
	require.NoError(t, DB.Create(tokEarly).Error)
	require.NoError(t, DB.Delete(tokEarly).Error)
	require.NoError(t, DB.Create(&Token{UserId: uidB, Key: "acq-funnel-key-late", Name: "late", CreatedTime: 2500, Status: 1}).Error)
	// User 12: only token appears exactly at the bound → excluded.
	require.NoError(t, DB.Create(&Token{UserId: uidD, Key: "acq-funnel-key-bound", Name: "bound", CreatedTime: 2000, Status: 1}).Error)

	require.NoError(t, LOG_DB.Create(&Log{UserId: uidB, CreatedAt: 1900, Type: LogTypeConsume, ModelName: "kimi-k3"}).Error)
	require.NoError(t, LOG_DB.Create(&Log{UserId: uidB, CreatedAt: 2000, Type: LogTypeConsume, ModelName: "kimi-k3"}).Error)
	require.NoError(t, LOG_DB.Create(&Log{UserId: uidB, CreatedAt: 1850, Type: LogTypeConsume, ModelName: "other-model"}).Error)
}

// Fixed-window stability: milestones at or after `to` never count, so
// re-querying the same historical window is stable.
func TestAcquisitionFunnelWindowStability(t *testing.T) {
	funnelFixture(t)

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{
		From: 1000, To: 2000, UtmSource: "reddit", UtmCampaign: "kimi_k3_launch", Model: "kimi-k3",
	})
	require.NoError(t, err)
	assert.Equal(t, 1, res.LandingView) // only the reddit/kimi touch matches filters
	assert.Equal(t, 1, res.SignupStarted)
	assert.Equal(t, 1, res.SignupCompleted)
	require.NotNil(t, res.ApiKeyCreated)
	assert.Equal(t, 1, *res.ApiKeyCreated)
	require.NotNil(t, res.FirstApiCallSucceeded)
	assert.Equal(t, 1, *res.FirstApiCallSucceeded)
	require.NotNil(t, res.LandingToSignup)
	assert.InDelta(t, 1.0, *res.LandingToSignup, 1e-9)
	require.NotNil(t, res.SignupToFirstCall)
	assert.InDelta(t, 1.0, *res.SignupToFirstCall, 1e-9)
	assert.Equal(t, "complete", res.DataCompleteness.Touches)
	assert.Equal(t, "complete", res.DataCompleteness.Tokens)
	assert.Equal(t, "complete", res.DataCompleteness.ConsumeLogs)
	assert.False(t, res.HistoricalBackfillAvailable)
	assert.Equal(t, int64(1), res.CoverageStartedAt)
	assert.False(t, res.FromBeforeCoverage)

	// Unfiltered: 4 landings; A completed after to, C only started at to,
	// D completed inside the window → 2 completed. D's token appeared at to,
	// so api_key_created counts only user 11.
	res2, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)
	assert.Equal(t, 4, res2.LandingView)
	assert.Equal(t, 1, res2.SignupStarted) // C's started == to excluded
	assert.Equal(t, 2, res2.SignupCompleted)
	require.NotNil(t, res2.ApiKeyCreated)
	assert.Equal(t, 1, *res2.ApiKeyCreated)
	require.NotNil(t, res2.LandingToSignup)
	assert.InDelta(t, 0.5, *res2.LandingToSignup, 1e-9)

	// A cohort window that excludes all touches still returns honest zeros.
	resEmpty, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 9000, To: 9001})
	require.NoError(t, err)
	assert.Equal(t, 0, resEmpty.LandingView)
	assert.Equal(t, 0, resEmpty.SignupCompleted)
	assert.Nil(t, resEmpty.LandingToSignup)
	assert.Nil(t, resEmpty.SignupToFirstCall)
	require.NotNil(t, resEmpty.ApiKeyCreated)
	assert.Equal(t, 0, *resEmpty.ApiKeyCreated)

	// from before coverage flags the gap without shifting the window.
	resBefore, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 0, To: 2})
	require.NoError(t, err)
	assert.True(t, resBefore.FromBeforeCoverage)
}

// api_key_created is an irreversible milestone: the Unscoped query must still
// count a user whose only token was soft-deleted.
func TestAcquisitionFunnelUnscopedTokenAndSoftDelete(t *testing.T) {
	acquisitionFixture(t)
	require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "1"}).Error)

	uid := 41
	completed := int64(1200)
	require.NoError(t, DB.Create(&AcquisitionTouch{
		TouchId: common.GetUUID(), UserId: &uid, FirstSeenAt: 1100,
		SignupCompletedAt: &completed, CreatedAt: 1100, UpdatedAt: 1200,
	}).Error)
	tok := &Token{UserId: uid, Key: "acq-softdel-key", Name: "n", CreatedTime: 1300, Status: 1}
	require.NoError(t, DB.Create(tok).Error)
	require.NoError(t, DB.Delete(tok).Error) // soft delete

	// Scoped queries see zero rows; Unscoped must still see the token.
	var scoped int64
	require.NoError(t, DB.Model(&Token{}).Where("user_id = ?", uid).Count(&scoped).Error)
	assert.Equal(t, int64(0), scoped)

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)
	require.NotNil(t, res.ApiKeyCreated)
	assert.Equal(t, 1, *res.ApiKeyCreated)
}

func TestAcquisitionFunnelModelExactMatch(t *testing.T) {
	acquisitionFixture(t)
	require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "1"}).Error)

	uid := 31
	completed := int64(1200)
	require.NoError(t, DB.Create(&AcquisitionTouch{
		TouchId: common.GetUUID(), UserId: &uid, FirstSeenAt: 1100,
		SignupCompletedAt: &completed, CreatedAt: 1100, UpdatedAt: 1200,
	}).Error)
	require.NoError(t, LOG_DB.Create(&Log{
		UserId: uid, CreatedAt: 1300, Type: LogTypeConsume, ModelName: "seedance-1-0-pro",
	}).Error)

	// Prefix/similar names must not match: exact model_name only.
	for _, name := range []string{"kimi-k3", "seedance", "seedance-1-0-pro-256k"} {
		res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000, Model: name})
		require.NoError(t, err)
		require.NotNil(t, res.FirstApiCallSucceeded)
		assert.Equal(t, 0, *res.FirstApiCallSucceeded, "model %q must not match", name)
	}

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000, Model: "seedance-1-0-pro"})
	require.NoError(t, err)
	require.NotNil(t, res.FirstApiCallSucceeded)
	assert.Equal(t, 1, *res.FirstApiCallSucceeded)

	// Logs before signup_completed_at must not count even for the exact model.
	resEarly, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)
	require.NotNil(t, resEarly.FirstApiCallSucceeded)
	assert.Equal(t, 1, *resEarly.FirstApiCallSucceeded)
	require.NoError(t, LOG_DB.Exec("DELETE FROM logs").Error)
	require.NoError(t, LOG_DB.Create(&Log{
		UserId: uid, CreatedAt: 1100, Type: LogTypeConsume, ModelName: "seedance-1-0-pro",
	}).Error)
	resBeforeSignup, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)
	require.NotNil(t, resBeforeSignup.FirstApiCallSucceeded)
	assert.Equal(t, 0, *resBeforeSignup.FirstApiCallSucceeded)
}

func TestAcquisitionFunnelConsumeLogsDisabled(t *testing.T) {
	funnelFixture(t)
	common.LogConsumeEnabled = false

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)
	assert.Nil(t, res.FirstApiCallSucceeded)
	assert.Nil(t, res.SignupToFirstCall)
	assert.False(t, res.ConsumeLogsEnabled)
	assert.Equal(t, "unavailable", res.DataCompleteness.ConsumeLogs)
	// Touch and token metrics stay honest numbers.
	assert.Equal(t, 4, res.LandingView)
	assert.Equal(t, 2, res.SignupCompleted)
	require.NotNil(t, res.ApiKeyCreated)
	assert.Equal(t, 1, *res.ApiKeyCreated)
}

func TestAcquisitionFunnelLogDBUnavailable(t *testing.T) {
	funnelFixture(t)

	orig := LOG_DB
	LOG_DB = nil
	t.Cleanup(func() { LOG_DB = orig })

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err) // touches still succeed → partial honesty
	assert.Nil(t, res.FirstApiCallSucceeded)
	assert.Nil(t, res.SignupToFirstCall)
	assert.Equal(t, "error", res.DataCompleteness.ConsumeLogs)
	assert.Equal(t, "complete", res.DataCompleteness.Tokens)
}

func TestAcquisitionFunnelTokensError(t *testing.T) {
	funnelFixture(t)

	// Break the tokens table so the Unscoped query fails; the funnel must
	// still return touch counts with tokens=error.
	require.NoError(t, DB.Migrator().DropTable(&Token{}))

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)
	assert.Nil(t, res.ApiKeyCreated)
	assert.Equal(t, "error", res.DataCompleteness.Tokens)
	assert.Equal(t, "complete", res.DataCompleteness.Touches)
	assert.Equal(t, 4, res.LandingView)
	// Log metrics are independent of the token failure.
	require.NotNil(t, res.FirstApiCallSucceeded)
	assert.Equal(t, 1, *res.FirstApiCallSucceeded)

	require.NoError(t, DB.AutoMigrate(&Token{}))
}

// Zero denominators and unavailable stages must serialize as JSON null, never
// as 0, so operators cannot read "unknown" as "no conversions".
func TestAcquisitionFunnelZeroDenominatorJSONNull(t *testing.T) {
	acquisitionFixture(t)
	require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "1"}).Error)
	common.LogConsumeEnabled = false

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)

	data, err := common.Marshal(res)
	require.NoError(t, err)
	s := string(data)
	assert.Contains(t, s, `"landing_to_signup":null`)
	assert.Contains(t, s, `"signup_to_first_call":null`)
	assert.Contains(t, s, `"first_api_call_succeeded":null`)
	assert.Contains(t, s, `"historical_backfill_available":false`)
	assert.Contains(t, s, `"api_key_created":0`)
}

// A missing coverage marker is a deployment anomaly: the funnel API must
// fail instead of inventing a timestamp.
func TestAcquisitionFunnelCoverageMissing(t *testing.T) {
	acquisitionFixture(t)

	_, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// Same-user re-bind milestone fill
// ---------------------------------------------------------------------------

// Both milestones missing: one bind fills them with a single shared
// timestamp, and started is never later than completed.
func TestAcquisitionBindSameUserFillsBothMilestonesWithEqualTime(t *testing.T) {
	acquisitionFixture(t)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/fill"})
	require.NoError(t, err)
	uid := 62
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Where("id = ?", touch.Id).Update("user_id", uid).Error)

	BindAcquisitionTouchToUser(touch.TouchId, uid)

	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.UserId)
	assert.Equal(t, uid, *loaded.UserId)
	require.NotNil(t, loaded.SignupCompletedAt)
	require.NotNil(t, loaded.SignupStartedAt)
	assert.Equal(t, *loaded.SignupCompletedAt, *loaded.SignupStartedAt,
		"both missing milestones must be filled with the same captured timestamp")
}

// Only started missing: the fill is clamped to the earlier completed value so
// started never lands after completed, and updated_at records the actual
// repair time instead of being rewound to the old completed timestamp.
func TestAcquisitionBindSameUserClampsStartedToExistingCompleted(t *testing.T) {
	acquisitionFixture(t)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/clamp"})
	require.NoError(t, err)
	uid := 63
	oldCompleted := common.GetTimestamp() - 5000
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Where("id = ?", touch.Id).Updates(map[string]interface{}{
		"user_id":             uid,
		"signup_completed_at": oldCompleted,
	}).Error)

	beforeBind := time.Now().Unix()
	BindAcquisitionTouchToUser(touch.TouchId, uid)

	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.SignupCompletedAt)
	assert.Equal(t, oldCompleted, *loaded.SignupCompletedAt, "existing completed must never be overwritten")
	require.NotNil(t, loaded.SignupStartedAt)
	assert.Equal(t, oldCompleted, *loaded.SignupStartedAt)
	assert.LessOrEqual(t, *loaded.SignupStartedAt, *loaded.SignupCompletedAt)
	assert.GreaterOrEqual(t, loaded.UpdatedAt, beforeBind,
		"updated_at must be the actual repair time, never rewound to the old completed timestamp")
}

// Both milestones already complete: a repeat bind must be a true no-op that
// does not even bump updated_at.
func TestAcquisitionBindSameUserNoUpdateWhenMilestonesComplete(t *testing.T) {
	acquisitionFixture(t)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/complete"})
	require.NoError(t, err)
	uid := 64
	BindAcquisitionTouchToUser(touch.TouchId, uid)
	first, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, first.SignupCompletedAt)
	require.NotNil(t, first.SignupStartedAt)

	BindAcquisitionTouchToUser(touch.TouchId, uid)
	again, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	assert.Equal(t, *first.SignupCompletedAt, *again.SignupCompletedAt)
	assert.Equal(t, *first.SignupStartedAt, *again.SignupStartedAt)
	assert.Equal(t, first.UpdatedAt, again.UpdatedAt,
		"repeat bind with complete milestones must not touch updated_at")
}

// newAcquisitionIsolatedSQLiteDB opens a file-backed SQLite database with a
// two-connection pool and publishes it as the global DB/LOG_DB for the test.
// A paused UPDATE's default transaction holds one connection, so interleaved
// competing writers need a second one; an in-memory database cannot be used
// because it exists per connection. Cleanups run LIFO: the globals are
// restored before the pool is closed.
func newAcquisitionIsolatedSQLiteDB(t *testing.T) *gorm.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), strings.ReplaceAll(t.Name(), "/", "_")+".sqlite")
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(2)
	t.Cleanup(func() {
		assert.NoError(t, sqlDB.Close())
	})
	origDB, origLogDB := DB, LOG_DB
	t.Cleanup(func() {
		DB = origDB
		LOG_DB = origLogDB
	})
	DB = db
	LOG_DB = db
	require.NoError(t, db.AutoMigrate(&AcquisitionTouch{}))
	return db
}

// acquisitionUpdateGate pauses the first UPDATE statement against
// acquisition_touches so tests can commit deterministic interleaved writes
// around it. The cleanup is registered BEFORE the callback is registered —
// GORM may have appended the callback even when Register returns an error —
// and then always runs in strict order: release the gate idempotently, join
// every worker, then remove the callback. Outer cleanups (global restore,
// connection close) were registered earlier and therefore run only after
// this one, even when the test failed mid-way.
type acquisitionUpdateGate struct {
	entered     chan struct{}
	release     chan struct{}
	releaseOnce sync.Once
}

func pauseFirstAcquisitionUpdate(t *testing.T, db *gorm.DB, workers *sync.WaitGroup) *acquisitionUpdateGate {
	t.Helper()
	const cbName = "test:pause_first_acquisition_update"
	gate := &acquisitionUpdateGate{
		entered: make(chan struct{}),
		release: make(chan struct{}),
	}
	t.Cleanup(func() {
		gate.releaseGate()
		workers.Wait()
		assert.NoError(t, db.Callback().Update().Remove(cbName))
	})
	var first int32
	require.NoError(t, db.Callback().Update().Before("gorm:update").Register(cbName, func(tx *gorm.DB) {
		if tx.Statement.Table != "acquisition_touches" {
			return
		}
		// The first matching update blocks; later updates — the interleaved
		// competing writes — must pass through immediately instead of waiting
		// on the blocked first caller.
		if atomic.CompareAndSwapInt32(&first, 0, 1) {
			close(gate.entered)
			<-gate.release
		}
	}))
	return gate
}

// waitEntered blocks until the first matching update is paused. time.After
// is a pure deadlock guard, never a behavioral assertion.
func (g *acquisitionUpdateGate) waitEntered(t *testing.T) {
	t.Helper()
	select {
	case <-g.entered:
	case <-time.After(30 * time.Second):
		t.Fatal("deadlock guard: first acquisition update never paused")
	}
}

// releaseGate unblocks the paused update. Idempotent.
func (g *acquisitionUpdateGate) releaseGate() {
	g.releaseOnce.Do(func() { close(g.release) })
}

// Deterministic interleaving: while one bind is paused inside its milestone
// UPDATE holding a stale "both NULL" snapshot, a concurrent writer commits an
// old completed timestamp. The atomic statement must evaluate against the
// committed row state, so started is clamped to that old completed value and
// never lands after it. Timing is forced by channels, not by sleeps.
func TestAcquisitionBindInterleavedFillKeepsStartedBeforeCompleted(t *testing.T) {
	newAcquisitionIsolatedSQLiteDB(t)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/interleave"})
	require.NoError(t, err)
	uid := 65
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Where("id = ?", touch.Id).Update("user_id", uid).Error)

	var workers sync.WaitGroup
	gate := pauseFirstAcquisitionUpdate(t, DB, &workers)

	workers.Add(1)
	go func() {
		defer workers.Done()
		BindAcquisitionTouchToUser(touch.TouchId, uid)
	}()

	// The bind goroutine is now paused inside its milestone UPDATE with a
	// stale snapshot (both milestones NULL). A competing writer commits an
	// old completed timestamp first.
	gate.waitEntered(t)
	require.NoError(t, DB.Model(&AcquisitionTouch{}).
		Where("id = ?", touch.Id).
		Update("signup_completed_at", int64(500)).Error)
	gate.releaseGate()
	workers.Wait()

	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.SignupCompletedAt)
	assert.Equal(t, int64(500), *loaded.SignupCompletedAt,
		"committed completed from the competing writer must survive")
	require.NotNil(t, loaded.SignupStartedAt)
	assert.Equal(t, int64(500), *loaded.SignupStartedAt,
		"started must be clamped to the committed completed, not the writer's wall clock")
	assert.LessOrEqual(t, *loaded.SignupStartedAt, *loaded.SignupCompletedAt)
}

// Mark against a row whose completed already exists must clamp started to
// that earlier completed through the real write path.
func TestAcquisitionMarkClampsStartedToExistingCompleted(t *testing.T) {
	acquisitionFixture(t)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/mark-clamp"})
	require.NoError(t, err)
	uid := 66
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Where("id = ?", touch.Id).Updates(map[string]interface{}{
		"user_id":             uid,
		"signup_completed_at": int64(500),
	}).Error)

	beforeMark := time.Now().Unix()
	present, err := MarkAcquisitionSignupStarted(touch.TouchId)
	require.NoError(t, err)
	assert.True(t, present)

	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.SignupCompletedAt)
	assert.Equal(t, int64(500), *loaded.SignupCompletedAt, "existing completed must never be overwritten")
	require.NotNil(t, loaded.SignupStartedAt)
	assert.Equal(t, int64(500), *loaded.SignupStartedAt, "started must be clamped to the earlier completed")
	assert.LessOrEqual(t, *loaded.SignupStartedAt, *loaded.SignupCompletedAt)
	assert.GreaterOrEqual(t, loaded.UpdatedAt, beforeMark, "updated_at is the actual write time")
}

// Deterministic interleaving between the FIRST bind and a real Mark: the
// bind pauses inside its first-bind UPDATE holding a stale started=NULL
// snapshot; while it is paused, a real MarkAcquisitionSignupStarted commits
// started; after the release the bind must preserve Mark's first write
// instead of overwriting it. The preset completed=500 makes Mark's written
// started a deterministic value far away from any wall-clock timestamp the
// bind could produce, so no assertion depends on two GetTimestamp calls
// landing in different seconds.
func TestAcquisitionBindFirstBindPreservesConcurrentMark(t *testing.T) {
	newAcquisitionIsolatedSQLiteDB(t)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/first-bind-mark"})
	require.NoError(t, err)
	uid := 67
	require.NoError(t, DB.Model(&AcquisitionTouch{}).
		Where("id = ?", touch.Id).
		Update("signup_completed_at", int64(500)).Error)

	var workers sync.WaitGroup
	gate := pauseFirstAcquisitionUpdate(t, DB, &workers)

	workers.Add(1)
	go func() {
		defer workers.Done()
		BindAcquisitionTouchToUser(touch.TouchId, uid)
	}()

	gate.waitEntered(t)
	// Bind is paused in its first-bind UPDATE; the real Mark commits started
	// during the pause (clamped to the preset completed).
	present, err := MarkAcquisitionSignupStarted(touch.TouchId)
	require.NoError(t, err)
	assert.True(t, present)

	// Checkpoint before the release: Mark's write is committed while the
	// touch is still unbound (the bind statement has not executed yet).
	midway, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, midway.SignupStartedAt)
	assert.Equal(t, int64(500), *midway.SignupStartedAt)
	assert.Nil(t, midway.UserId)

	gate.releaseGate()
	workers.Wait()

	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.UserId)
	assert.Equal(t, uid, *loaded.UserId)
	require.NotNil(t, loaded.SignupStartedAt)
	assert.Equal(t, int64(500), *loaded.SignupStartedAt,
		"Mark's first-written started must survive the concurrent first bind")
	require.NotNil(t, loaded.SignupCompletedAt)
	assert.Equal(t, int64(500), *loaded.SignupCompletedAt)
	assert.LessOrEqual(t, *loaded.SignupStartedAt, *loaded.SignupCompletedAt)
}

// started preset to a deterministic future relative to the test baseline:
// the re-bind fill must produce completed >= started even though the fill's
// captured timestamp is "behind" started (clock regression proof).
func TestAcquisitionBindFillCompletedNotBeforeExistingStarted(t *testing.T) {
	acquisitionFixture(t)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/clock-regression"})
	require.NoError(t, err)
	uid := 68
	futureStarted := common.GetTimestamp() + 5000
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Where("id = ?", touch.Id).Updates(map[string]interface{}{
		"user_id":           uid,
		"signup_started_at": futureStarted,
	}).Error)

	BindAcquisitionTouchToUser(touch.TouchId, uid)

	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.SignupStartedAt)
	assert.Equal(t, futureStarted, *loaded.SignupStartedAt, "existing started must never be overwritten")
	require.NotNil(t, loaded.SignupCompletedAt)
	assert.Equal(t, futureStarted, *loaded.SignupCompletedAt,
		"the filled completed must be lifted to the later started under clock regression")
	assert.LessOrEqual(t, *loaded.SignupStartedAt, *loaded.SignupCompletedAt)
}

// Concurrent same-user binds: set-if-null guarantees no writer overwrites a
// first-write timestamp, exactly one row stays bound, and later binds are
// no-ops on the milestone values.
func TestAcquisitionBindConcurrentSameUserNeverOverwrites(t *testing.T) {
	acquisitionFixture(t)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/cc"})
	require.NoError(t, err)
	uid := 61
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Where("id = ?", touch.Id).Update("user_id", uid).Error)

	const workers = 8
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			BindAcquisitionTouchToUser(touch.TouchId, uid)
		}()
	}
	wg.Wait()

	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.UserId)
	assert.Equal(t, uid, *loaded.UserId)
	require.NotNil(t, loaded.SignupCompletedAt)
	require.NotNil(t, loaded.SignupStartedAt)
	assert.LessOrEqual(t, *loaded.SignupStartedAt, *loaded.SignupCompletedAt,
		"any concurrent interleaving must keep started <= completed")
	firstCompleted := *loaded.SignupCompletedAt
	firstStarted := *loaded.SignupStartedAt

	var rows int64
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Where("user_id = ?", uid).Count(&rows).Error)
	assert.Equal(t, int64(1), rows)

	// A later bind must leave the first-write timestamps untouched.
	BindAcquisitionTouchToUser(touch.TouchId, uid)
	reloaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	assert.Equal(t, firstCompleted, *reloaded.SignupCompletedAt)
	assert.Equal(t, firstStarted, *reloaded.SignupStartedAt)
}

// ---------------------------------------------------------------------------
// Funnel batching across the fixed batch size
// ---------------------------------------------------------------------------

// funnelBatchFixture seeds acquisitionFunnelBatchSize+1 completed users with
// one token and one qualifying consume log each, inside window [1000, 2000),
// so token and log milestone queries must run in two batches.
func funnelBatchFixture(t *testing.T) int {
	acquisitionFixture(t)
	require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "1"}).Error)

	userCount := acquisitionFunnelBatchSize + 1
	completed := int64(1200)
	touches := make([]*AcquisitionTouch, 0, userCount)
	tokens := make([]*Token, 0, userCount)
	logs := make([]*Log, 0, userCount)
	for uid := 1; uid <= userCount; uid++ {
		uid := uid
		completed := completed
		touches = append(touches, &AcquisitionTouch{
			TouchId: common.GetUUID(), UserId: &uid,
			FirstSeenAt: 1500, SignupCompletedAt: &completed,
			CreatedAt: 1500, UpdatedAt: 1200,
		})
		tokens = append(tokens, &Token{
			UserId: uid, Key: fmt.Sprintf("acq-batch-key-%d", uid),
			Name: "batch", CreatedTime: 1300, Status: 1,
		})
		logs = append(logs, &Log{
			UserId: uid, CreatedAt: 1400, Type: LogTypeConsume, ModelName: "batch-model",
		})
	}
	require.NoError(t, DB.CreateInBatches(touches, 100).Error)
	require.NoError(t, DB.CreateInBatches(tokens, 100).Error)
	require.NoError(t, LOG_DB.CreateInBatches(logs, 100).Error)
	return userCount
}

func TestAcquisitionFunnelBatchesCrossBoundary(t *testing.T) {
	userCount := funnelBatchFixture(t)
	require.Greater(t, userCount, acquisitionFunnelBatchSize, "fixture must span two batches")

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)
	assert.Equal(t, userCount, res.LandingView)
	assert.Equal(t, userCount, res.SignupCompleted)
	require.NotNil(t, res.ApiKeyCreated)
	assert.Equal(t, userCount, *res.ApiKeyCreated)
	require.NotNil(t, res.FirstApiCallSucceeded)
	assert.Equal(t, userCount, *res.FirstApiCallSucceeded)
	assert.Equal(t, "complete", res.DataCompleteness.Tokens)
	assert.Equal(t, "complete", res.DataCompleteness.ConsumeLogs)

	// Model exact-match still applies across batches.
	resWrong, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000, Model: "other-model"})
	require.NoError(t, err)
	require.NotNil(t, resWrong.FirstApiCallSucceeded)
	assert.Equal(t, 0, *resWrong.FirstApiCallSucceeded)

	// Per-user lower bound: user 7's log predates its signup_completed_at and
	// must not count, in whichever batch it lands.
	require.NoError(t, LOG_DB.Model(&Log{}).
		Where("user_id = ? AND type = ?", 7, LogTypeConsume).
		Update("created_at", 1100).Error)
	resEarly, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)
	require.NotNil(t, resEarly.FirstApiCallSucceeded)
	assert.Equal(t, userCount-1, *resEarly.FirstApiCallSucceeded)

	// to boundary: user 9's log at exactly `to` must not count.
	require.NoError(t, LOG_DB.Model(&Log{}).
		Where("user_id = ? AND type = ?", 9, LogTypeConsume).
		Update("created_at", 2000).Error)
	resBound, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)
	require.NotNil(t, resBound.FirstApiCallSucceeded)
	assert.Equal(t, userCount-2, *resBound.FirstApiCallSucceeded)
}

// injectSecondBatchFailure registers a deterministic Query callback that
// fails the second query against tableName. Cleanup is registered before the
// callback and restores the processor on test exit.
func injectSecondBatchFailure(t *testing.T, tableName, message string) {
	t.Helper()
	cbName := "test:fail_second_batch_" + tableName
	var calls int64
	t.Cleanup(func() {
		assert.NoError(t, DB.Callback().Query().Remove(cbName))
	})
	require.NoError(t, DB.Callback().Query().Before("gorm:query").Register(cbName, func(tx *gorm.DB) {
		if tx.Statement.Table != tableName {
			return
		}
		if atomic.AddInt64(&calls, 1) >= 2 {
			_ = tx.AddError(errors.New(message))
		}
	}))
}

// A second token batch failure must null api_key_created with tokens=error —
// the first batch's partial count may never masquerade as a complete result.
func TestAcquisitionFunnelTokenSecondBatchFailure(t *testing.T) {
	userCount := funnelBatchFixture(t)
	injectSecondBatchFailure(t, "tokens", "injected token batch failure")

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err, "touches still succeed")
	assert.Equal(t, userCount, res.LandingView)
	assert.Nil(t, res.ApiKeyCreated, "partial token batches must not yield a count")
	assert.Equal(t, "error", res.DataCompleteness.Tokens)
	assert.Equal(t, "complete", res.DataCompleteness.ConsumeLogs)
	require.NotNil(t, res.FirstApiCallSucceeded)
	assert.Equal(t, userCount, *res.FirstApiCallSucceeded)
}

// A second log batch failure must null first_api_call_succeeded with
// consume_logs=error; the rate depending on it nulls as well.
func TestAcquisitionFunnelLogSecondBatchFailure(t *testing.T) {
	userCount := funnelBatchFixture(t)
	injectSecondBatchFailure(t, "logs", "injected log batch failure")

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)
	assert.Equal(t, userCount, res.LandingView)
	require.NotNil(t, res.ApiKeyCreated)
	assert.Equal(t, userCount, *res.ApiKeyCreated)
	assert.Nil(t, res.FirstApiCallSucceeded, "partial log batches must not yield a count")
	assert.Nil(t, res.SignupToFirstCall)
	assert.Equal(t, "error", res.DataCompleteness.ConsumeLogs)
}

// ---------------------------------------------------------------------------
// Migration behavior: migrateDB / migrateDBFast on isolated fresh databases
// ---------------------------------------------------------------------------

// newMigrationTestDB opens an isolated in-memory SQLite database, publishes
// it as the global DB/LOG_DB with SQLite database types for the duration of
// the test, and restores everything. Cleanups run LIFO: globals are restored
// before the connection is closed.
func newMigrationTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	// Registered first → runs last: close only after globals were restored.
	t.Cleanup(func() {
		assert.NoError(t, sqlDB.Close())
	})

	origDB, origLogDB := DB, LOG_DB
	origMainType := common.MainDatabaseType()
	t.Cleanup(func() {
		DB = origDB
		LOG_DB = origLogDB
		common.SetMainDatabaseType(origMainType)
	})

	DB = db
	LOG_DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	return db
}

// coverageMarkerCount counts acquisition coverage rows on the isolated DB.
func coverageMarkerCount(t *testing.T, db *gorm.DB) int64 {
	t.Helper()
	if !db.Migrator().HasTable(&Option{}) {
		return 0
	}
	var count int64
	require.NoError(t, db.Model(&Option{}).Where("key = ?", AcquisitionCoverageStartedAtKey).Count(&count).Error)
	return count
}

// unregisterCallback removes a callback tolerantly so cleanup never fails on
// an already-removed registration.
func unregisterCallback(t *testing.T, processor string, name string) {
	t.Helper()
	var err error
	switch processor {
	case "raw":
		err = DB.Callback().Raw().Remove(name)
	case "create":
		err = DB.Callback().Create().Remove(name)
	}
	assert.NoError(t, err)
}

func TestAcquisitionMigrateDBFreshSuccess(t *testing.T) {
	db := newMigrationTestDB(t)

	require.NoError(t, migrateDB())

	assert.True(t, db.Migrator().HasTable(&AcquisitionTouch{}), "acquisition_touches must exist")
	assert.True(t, db.Migrator().HasTable(&Option{}), "options must exist")
	require.Equal(t, int64(1), coverageMarkerCount(t, db))
	v, err := GetAcquisitionCoverageStartedAt()
	require.NoError(t, err)
	assert.Greater(t, v, int64(0))
}

func TestAcquisitionMigrateDBFastFreshSuccess(t *testing.T) {
	db := newMigrationTestDB(t)
	logBuf := captureSysLog(t)

	require.NoError(t, migrateDBFast())

	assert.True(t, db.Migrator().HasTable(&AcquisitionTouch{}), "acquisition_touches must exist")
	assert.True(t, db.Migrator().HasTable(&Option{}), "options must exist")
	require.Equal(t, int64(1), coverageMarkerCount(t, db))
	v, err := GetAcquisitionCoverageStartedAt()
	require.NoError(t, err)
	assert.Greater(t, v, int64(0))
	// Positive control: only a fully successful fast migration emits the
	// externally observable success signal.
	assert.Contains(t, logBuf.String(), "database migrated")
}

// An AutoMigrate-stage failure aborts the migration before the coverage
// marker may be written.
func TestAcquisitionMigrateDBAutoMigrateFailureSkipsMarker(t *testing.T) {
	db := newMigrationTestDB(t)

	const cbName = "test:fail_create_table"
	t.Cleanup(func() { unregisterCallback(t, "raw", cbName) })
	require.NoError(t, DB.Callback().Raw().Before("gorm:raw").Register(cbName, func(tx *gorm.DB) {
		if strings.Contains(tx.Statement.SQL.String(), "CREATE TABLE") {
			_ = tx.AddError(errors.New("injected AutoMigrate failure"))
		}
	}))

	err := migrateDB()
	require.Error(t, err)
	assert.Equal(t, int64(0), coverageMarkerCount(t, db), "marker must not exist after AutoMigrate failure")
}

func TestAcquisitionMigrateDBFastAutoMigrateFailureSkipsMarker(t *testing.T) {
	db := newMigrationTestDB(t)

	const cbName = "test:fail_create_table_fast"
	t.Cleanup(func() { unregisterCallback(t, "raw", cbName) })
	require.NoError(t, DB.Callback().Raw().Before("gorm:raw").Register(cbName, func(tx *gorm.DB) {
		if strings.Contains(tx.Statement.SQL.String(), "CREATE TABLE") {
			_ = tx.AddError(errors.New("injected AutoMigrate failure"))
		}
	}))

	err := migrateDBFast()
	require.Error(t, err)
	assert.Equal(t, int64(0), coverageMarkerCount(t, db), "marker must not exist after a parallel migration failure")
}

// A post-AutoMigrate stage failure (the LongCat migration) also aborts
// before the coverage marker.
func TestAcquisitionMigrateDBPostStageFailureSkipsMarker(t *testing.T) {
	db := newMigrationTestDB(t)

	const cbName = "test:fail_longcat_claim"
	t.Cleanup(func() { unregisterCallback(t, "create", cbName) })
	require.NoError(t, DB.Callback().Create().Before("gorm:create").Register(cbName, func(tx *gorm.DB) {
		if opt, ok := tx.Statement.Dest.(*Option); ok && opt.Key == longcatChannelTypeMigrationOptionKey {
			_ = tx.AddError(errors.New("injected LongCat stage failure"))
		}
	}))

	err := migrateDB()
	require.Error(t, err)
	require.True(t, db.Migrator().HasTable(&AcquisitionTouch{}), "tables were migrated before the failing stage")
	assert.Equal(t, int64(0), coverageMarkerCount(t, db), "marker must not exist after a post-stage failure")
}

// A coverage CAS failure must fail the whole migration on both paths.
func TestAcquisitionMigrateDBCASFailureReturnsError(t *testing.T) {
	db := newMigrationTestDB(t)
	logBuf := captureSysLog(t)

	const cbName = "test:fail_coverage_cas"
	t.Cleanup(func() { unregisterCallback(t, "create", cbName) })
	require.NoError(t, DB.Callback().Create().Before("gorm:create").Register(cbName, func(tx *gorm.DB) {
		if opt, ok := tx.Statement.Dest.(*Option); ok && opt.Key == AcquisitionCoverageStartedAtKey {
			_ = tx.AddError(errors.New("injected coverage CAS failure"))
		}
	}))

	err := migrateDB()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "acquisition coverage marker init failed")
	assert.Equal(t, int64(0), coverageMarkerCount(t, db))
	assert.NotContains(t, logBuf.String(), "database migrated",
		"a CAS failure must not emit the success log")
}

func TestAcquisitionMigrateDBFastCASFailureReturnsError(t *testing.T) {
	db := newMigrationTestDB(t)
	logBuf := captureSysLog(t)

	const cbName = "test:fail_coverage_cas_fast"
	t.Cleanup(func() { unregisterCallback(t, "create", cbName) })
	require.NoError(t, DB.Callback().Create().Before("gorm:create").Register(cbName, func(tx *gorm.DB) {
		if opt, ok := tx.Statement.Dest.(*Option); ok && opt.Key == AcquisitionCoverageStartedAtKey {
			_ = tx.AddError(errors.New("injected coverage CAS failure"))
		}
	}))

	err := migrateDBFast()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "acquisition coverage marker init failed")
	assert.Equal(t, int64(0), coverageMarkerCount(t, db))
	assert.NotContains(t, logBuf.String(), "database migrated",
		"a CAS failure must not emit the success log")
}

// Restart over a migrated database keeps the original coverage value.
func TestAcquisitionMigrateRestartNeverOverwritesMarker(t *testing.T) {
	db := newMigrationTestDB(t)

	require.NoError(t, migrateDB())
	original, err := GetAcquisitionCoverageStartedAt()
	require.NoError(t, err)

	require.NoError(t, migrateDB())
	again, err := GetAcquisitionCoverageStartedAt()
	require.NoError(t, err)
	assert.Equal(t, original, again, "re-migration must never overwrite the marker")
	require.Equal(t, int64(1), coverageMarkerCount(t, db))
}

// Fast-path barrier order: when a parallel migration fails, the coverage CAS
// must never even be attempted (attempts counted deterministically), proving
// the marker is only produced after all parallel migrations completed and
// their errors were checked.
func TestAcquisitionMigrateDBFastMarkerOnlyAfterBarrier(t *testing.T) {
	db := newMigrationTestDB(t)

	const failTable = "CREATE TABLE `acquisition_touches`"
	const cbFailName = "test:fail_acquisition_touches_table"
	t.Cleanup(func() { unregisterCallback(t, "raw", cbFailName) })
	require.NoError(t, DB.Callback().Raw().Before("gorm:raw").Register(cbFailName, func(tx *gorm.DB) {
		if strings.Contains(tx.Statement.SQL.String(), failTable) {
			_ = tx.AddError(errors.New("injected AcquisitionTouch migration failure"))
		}
	}))

	var casAttempts int64
	const cbCasName = "test:count_coverage_cas_attempts"
	t.Cleanup(func() { unregisterCallback(t, "create", cbCasName) })
	require.NoError(t, DB.Callback().Create().Before("gorm:create").Register(cbCasName, func(tx *gorm.DB) {
		if opt, ok := tx.Statement.Dest.(*Option); ok && opt.Key == AcquisitionCoverageStartedAtKey {
			atomic.AddInt64(&casAttempts, 1)
		}
	}))

	err := migrateDBFast()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "AcquisitionTouch")
	assert.Equal(t, int64(0), atomic.LoadInt64(&casAttempts),
		"coverage CAS must not be attempted before all parallel migrations succeed")
	assert.Equal(t, int64(0), coverageMarkerCount(t, db))
}

// ---------------------------------------------------------------------------
// Funnel keyset pagination behavior
// ---------------------------------------------------------------------------

// isAcquisitionCompletedPageQuery identifies funnel keyset page queries for
// fault injection only: the completed-cohort pages are the acquisition
// touch queries scanning into the completedTouchRow result type. It couples
// the injection to neither clause internals, SQL text, nor the production
// batch-size constant.
func isAcquisitionCompletedPageQuery(tx *gorm.DB) bool {
	if tx.Statement.Table != "acquisition_touches" {
		return false
	}
	_, ok := tx.Statement.Dest.(*[]completedTouchRow)
	return ok
}

// A failing touch page aborts the whole funnel: no partial result may be
// returned once pagination cannot continue. The second page is proven to
// happen by counting page queries with batchSize+1 completed users.
func TestAcquisitionFunnelTouchSecondPageFailureFailsWhole(t *testing.T) {
	funnelBatchFixture(t)

	const cbName = "test:fail_acquisition_second_page"
	var pages int64
	t.Cleanup(func() {
		assert.NoError(t, DB.Callback().Query().Remove(cbName))
	})
	require.NoError(t, DB.Callback().Query().Before("gorm:query").Register(cbName, func(tx *gorm.DB) {
		if !isAcquisitionCompletedPageQuery(tx) {
			return
		}
		if atomic.AddInt64(&pages, 1) >= 2 {
			_ = tx.AddError(errors.New("injected touch page failure"))
		}
	}))

	_, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.Error(t, err, "a failed touch page must fail the whole funnel")
	assert.GreaterOrEqual(t, atomic.LoadInt64(&pages), int64(2),
		"batchSize+1 completed users must require at least two pages")
}

// Empty cohort: data-source availability decides the semantics before any
// cohort processing. LOG_DB unavailable with consume enabled must report
// error/null even though nothing would have been queried; disabled consume
// reports unavailable; a healthy setup reports honest zeros.
func TestAcquisitionFunnelEmptyCohortSemantics(t *testing.T) {
	t.Run("log db unavailable reports error not zero", func(t *testing.T) {
		acquisitionFixture(t)
		require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "1"}).Error)
		common.LogConsumeEnabled = true
		orig := LOG_DB
		LOG_DB = nil
		t.Cleanup(func() { LOG_DB = orig })

		res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
		require.NoError(t, err)
		assert.Equal(t, 0, res.LandingView)
		assert.Equal(t, 0, res.SignupCompleted)
		assert.Nil(t, res.FirstApiCallSucceeded)
		assert.Nil(t, res.SignupToFirstCall)
		assert.Equal(t, "error", res.DataCompleteness.ConsumeLogs)
		require.NotNil(t, res.ApiKeyCreated)
		assert.Equal(t, 0, *res.ApiKeyCreated)
	})

	t.Run("consume disabled reports unavailable", func(t *testing.T) {
		acquisitionFixture(t)
		require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "1"}).Error)
		common.LogConsumeEnabled = false

		res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
		require.NoError(t, err)
		assert.Nil(t, res.FirstApiCallSucceeded)
		assert.Nil(t, res.SignupToFirstCall)
		assert.Equal(t, "unavailable", res.DataCompleteness.ConsumeLogs)
	})

	t.Run("healthy setup reports honest zeros", func(t *testing.T) {
		acquisitionFixture(t)
		require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "1"}).Error)

		res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
		require.NoError(t, err)
		assert.Equal(t, 0, res.LandingView)
		require.NotNil(t, res.FirstApiCallSucceeded)
		assert.Equal(t, 0, *res.FirstApiCallSucceeded)
		assert.Nil(t, res.SignupToFirstCall, "zero denominator rate stays null")
		assert.Equal(t, "complete", res.DataCompleteness.ConsumeLogs)
	})
}

// ---------------------------------------------------------------------------
// Migration success/failure log contract
// ---------------------------------------------------------------------------

// captureSysLog redirects common.SysLog output into a buffer for the test
// duration so the externally observable "database migrated" success signal
// can be asserted (or its absence on failure paths).
func captureSysLog(t *testing.T) *bytes.Buffer {
	t.Helper()
	buf := &bytes.Buffer{}
	common.LogWriterMu.Lock()
	prev := gin.DefaultWriter
	gin.DefaultWriter = buf
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultWriter = prev
		common.LogWriterMu.Unlock()
	})
	return buf
}

// A post-barrier initializer failure in the fast path (the LongCat stage)
// must return an error, leave no coverage marker, and never emit the
// "database migrated" success signal.
func TestAcquisitionMigrateDBFastPostBarrierFailureSkipsMarkerAndSuccessLog(t *testing.T) {
	db := newMigrationTestDB(t)
	logBuf := captureSysLog(t)

	const cbName = "test:fail_longcat_claim_fast"
	t.Cleanup(func() { unregisterCallback(t, "create", cbName) })
	require.NoError(t, DB.Callback().Create().Before("gorm:create").Register(cbName, func(tx *gorm.DB) {
		if opt, ok := tx.Statement.Dest.(*Option); ok && opt.Key == longcatChannelTypeMigrationOptionKey {
			_ = tx.AddError(errors.New("injected LongCat stage failure"))
		}
	}))

	err := migrateDBFast()
	require.Error(t, err)
	assert.Equal(t, int64(0), coverageMarkerCount(t, db), "no marker after a post-barrier failure")
	assert.NotContains(t, logBuf.String(), "database migrated",
		"a failed post-barrier stage must not emit the success log")
}
