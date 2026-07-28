package model

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func resetAcquisitionFixtures(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.Exec("DELETE FROM acquisition_touches").Error)
	require.NoError(t, DB.Where(&Option{Key: AcquisitionCoverageStartedAtKey}).Delete(&Option{}).Error)
	require.NoError(t, DB.Exec("DELETE FROM tokens").Error)
	require.NoError(t, DB.Exec("DELETE FROM logs").Error)
	// Keep users table isolation light — delete test users by username prefix if any.
	common.CryptoSecret = "test-crypto-secret-for-acquisition"
	common.LogConsumeEnabled = true
}

func TestSanitizeUTMValue(t *testing.T) {
	resetAcquisitionFixtures(t)

	assert.Equal(t, "reddit", SanitizeUTMValue("  reddit  ", 64))
	assert.Equal(t, "foo_bar", SanitizeUTMValue("foo   bar", 64))
	assert.Equal(t, "ab", SanitizeUTMValue("a\x00b", 64))
	assert.Equal(t, "", SanitizeUTMValue("@@@", 64))
	assert.Equal(t, "a.b_c-d%e", SanitizeUTMValue("a.b_c-d%e", 64))
	long := strings.Repeat("x", 100)
	assert.Equal(t, 64, len(SanitizeUTMValue(long, 64)))
	assert.Equal(t, 128, len(SanitizeUTMValue(strings.Repeat("y", 200), 128)))
}

// TestSanitizeUTMValueOrder§7.2 distinguishes truncate-before-allowlist (correct)
// from allowlist-before-truncate (incorrect prior order).
func TestSanitizeUTMValueOrderTruncateBeforeAllowlist(t *testing.T) {
	// maxLen=5, input "a!!!b!!!c!!!d"
	// Correct §7.2: hard-truncate to 5 → "a!!!b" → allowlist strip → "ab"
	// Wrong (allowlist then truncate): strip ! → "abcd" → truncate → "abcd"
	got := SanitizeUTMValue("a!!!b!!!c!!!d", 5)
	assert.Equal(t, "ab", got)

	// maxLen=5, input "a  b  c"
	// Correct: truncate "a  b " → Fields→"a_b"
	// Wrong (whitespace first): "a_b_c" → truncate → "a_b_c"
	got2 := SanitizeUTMValue("a  b  c", 5)
	assert.Equal(t, "a_b", got2)

	// UTF-8: never split multi-byte rune. "é" is 2 bytes; maxLen=3 keeps one rune only.
	got3 := SanitizeUTMValue("ééé", 3)
	// é not in allowlist → stripped after truncate of first rune+partial rejected
	// truncateUTF8("ééé", 3) → "é" (2 bytes), allowlist strips → ""
	assert.Equal(t, "", got3)

	// Controls stripped before truncate so they do not consume budget.
	// 3 nulls + 10 x, maxLen=5 → after control strip "xxxxxxxxxx", truncate "xxxxx"
	got4 := SanitizeUTMValue("\x00\x00\x00xxxxxxxxxx", 5)
	assert.Equal(t, "xxxxx", got4)
}

func TestSanitizeLandingPath(t *testing.T) {
	assert.Equal(t, "/kimi-k3-api", SanitizeLandingPath("/kimi-k3-api?utm_source=x#frag"))
	assert.Equal(t, "", SanitizeLandingPath("//evil.com/path"))
	assert.Equal(t, "", SanitizeLandingPath("https://evil.com/x"))
	assert.Equal(t, "", SanitizeLandingPath("http://evil.com/x"))
	assert.Equal(t, "", SanitizeLandingPath("/path\\with\\slash"))
	assert.Equal(t, "", SanitizeLandingPath("relative"))
	assert.Equal(t, "/a/b", SanitizeLandingPath("/a//b"))
	assert.Equal(t, "", SanitizeLandingPath("/has space"))
}

func TestCookieSignAndVerify(t *testing.T) {
	resetAcquisitionFixtures(t)
	common.CryptoSecret = "secret-a"
	id := "0123456789abcdef0123456789abcdef"
	val := FormatTouchCookieValue(id)
	got, ok := ParseAndVerifyTouchCookie(val)
	require.True(t, ok)
	assert.Equal(t, id, got)

	// Tampered sig
	_, ok = ParseAndVerifyTouchCookie(id + ".deadbeef")
	assert.False(t, ok)

	// Wrong secret
	common.CryptoSecret = "secret-b"
	_, ok = ParseAndVerifyTouchCookie(val)
	assert.False(t, ok)

	// Bad charset
	_, ok = ParseAndVerifyTouchCookie("NOT-HEX-ID!!!!!!!!!!!!!!!!!!!!!!!!.abc")
	assert.False(t, ok)

	// Multiple dots
	_, ok = ParseAndVerifyTouchCookie("a.b.c")
	assert.False(t, ok)
}

func TestFirstLandingSnapshotImmutable(t *testing.T) {
	resetAcquisitionFixtures(t)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{
		UtmSource:   "reddit",
		UtmCampaign: "kimi_k3_launch",
		LandingPath: "/kimi-k3-api",
	})
	require.NoError(t, err)
	require.NotEmpty(t, touch.TouchId)
	assert.Equal(t, "reddit", touch.UtmSource)
	assert.Equal(t, "/kimi-k3-api", touch.LandingPath)

	// Simulate second landing attempting overwrite — application must not call Updates on UTM.
	// Verify create-then-reload still has original; and a second create is a new row.
	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	assert.Equal(t, "reddit", loaded.UtmSource)

	// Empty UTM first touch is valid (direct/unknown)
	direct, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/home"})
	require.NoError(t, err)
	assert.Equal(t, "", direct.UtmSource)
	assert.Equal(t, "", direct.UtmCampaign)
	assert.Equal(t, "/home", direct.LandingPath)

	// Later UTM must not fill empty snapshot (no update path)
	reloaded, err := GetAcquisitionTouchByTouchID(direct.TouchId)
	require.NoError(t, err)
	assert.Equal(t, "", reloaded.UtmSource)
}

func TestSignupStartedIdempotentAndNoCreate(t *testing.T) {
	resetAcquisitionFixtures(t)

	// Without touch — soft no-op, no rows
	present, err := MarkAcquisitionSignupStarted("0123456789abcdef0123456789abcdef")
	require.NoError(t, err)
	assert.False(t, present)
	var count int64
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(0), count)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/sign-up"})
	require.NoError(t, err)

	present, err = MarkAcquisitionSignupStarted(touch.TouchId)
	require.NoError(t, err)
	assert.True(t, present)
	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.SignupStartedAt)
	first := *loaded.SignupStartedAt

	time.Sleep(10 * time.Millisecond)
	present, err = MarkAcquisitionSignupStarted(touch.TouchId)
	require.NoError(t, err)
	assert.True(t, present)
	loaded2, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded2.SignupStartedAt)
	assert.Equal(t, first, *loaded2.SignupStartedAt)
}

func TestBindTouchToUserIdempotentAndGuards(t *testing.T) {
	resetAcquisitionFixtures(t)

	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{UtmSource: "x", LandingPath: "/"})
	require.NoError(t, err)

	require.NoError(t, BindAcquisitionTouchToUser(touch.TouchId, 42))
	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.UserId)
	assert.Equal(t, 42, *loaded.UserId)
	require.NotNil(t, loaded.SignupCompletedAt)
	// OAuth skip client milestone → signup_started filled
	require.NotNil(t, loaded.SignupStartedAt)

	// Repeat bind same user — ok
	require.NoError(t, BindAcquisitionTouchToUser(touch.TouchId, 42))

	// Different user cannot steal
	require.NoError(t, BindAcquisitionTouchToUser(touch.TouchId, 99))
	loaded2, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	assert.Equal(t, 42, *loaded2.UserId)

	// New touch cannot bind to already-bound user
	touch2, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/b"})
	require.NoError(t, err)
	require.NoError(t, BindAcquisitionTouchToUser(touch2.TouchId, 42))
	loaded3, err := GetAcquisitionTouchByTouchID(touch2.TouchId)
	require.NoError(t, err)
	assert.Nil(t, loaded3.UserId)
}

// Same-user re-bind must use set-if-null only — never overwrite an existing
// signup_completed_at / signup_started_at first-write timestamp.
func TestBindSameUserSetIfNullPreservesMilestones(t *testing.T) {
	resetAcquisitionFixtures(t)
	touch, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/bind"})
	require.NoError(t, err)
	require.NoError(t, BindAcquisitionTouchToUser(touch.TouchId, 55))
	loaded, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.SignupCompletedAt)
	require.NotNil(t, loaded.SignupStartedAt)
	// Force known older timestamps.
	oldCompleted := *loaded.SignupCompletedAt - 1000
	oldStarted := *loaded.SignupStartedAt - 1000
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Where("id = ?", loaded.Id).Updates(map[string]interface{}{
		"signup_completed_at": oldCompleted,
		"signup_started_at":   oldStarted,
	}).Error)

	// Re-bind same user — must NOT bump timestamps.
	require.NoError(t, BindAcquisitionTouchToUser(touch.TouchId, 55))
	again, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	assert.Equal(t, oldCompleted, *again.SignupCompletedAt)
	assert.Equal(t, oldStarted, *again.SignupStartedAt)

	// If completed_at is null but user already bound, set-if-null fills it once.
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Where("id = ?", loaded.Id).
		Update("signup_completed_at", nil).Error)
	require.NoError(t, BindAcquisitionTouchToUser(touch.TouchId, 55))
	filled, err := GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, filled.SignupCompletedAt)
	assert.Greater(t, *filled.SignupCompletedAt, oldCompleted)
}

func TestNullableUserIdUniqueAllowsManyNulls(t *testing.T) {
	resetAcquisitionFixtures(t)
	for i := 0; i < 3; i++ {
		_, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/"})
		require.NoError(t, err)
	}
	var n int64
	require.NoError(t, DB.Model(&AcquisitionTouch{}).Where("user_id IS NULL").Count(&n).Error)
	assert.Equal(t, int64(3), n)

	// Duplicate non-null user_id rejected by unique index
	u := 7
	t1, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/1"})
	require.NoError(t, err)
	require.NoError(t, DB.Model(t1).Update("user_id", u).Error)

	t2, err := CreateAcquisitionTouch(AcquisitionUTMFields{LandingPath: "/2"})
	require.NoError(t, err)
	err = DB.Model(t2).Update("user_id", u).Error
	require.Error(t, err)
}

func TestCoverageCASNeverOverwrite(t *testing.T) {
	resetAcquisitionFixtures(t)

	v1, err := EnsureAcquisitionCoverageStartedAt()
	require.NoError(t, err)
	assert.Greater(t, v1, int64(0))

	// Force a different wall value would not matter — second call keeps original.
	time.Sleep(1100 * time.Millisecond)
	v2, err := EnsureAcquisitionCoverageStartedAt()
	require.NoError(t, err)
	assert.Equal(t, v1, v2)

	// Manual overwrite attempt via helper must not change value even if Create races.
	v3, err := GetAcquisitionCoverageStartedAt()
	require.NoError(t, err)
	assert.Equal(t, v1, v3)
}

func TestCoverageCASInsertIfAbsentNotUpdateOption(t *testing.T) {
	resetAcquisitionFixtures(t)
	// Pre-seed with known value
	require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "100"}).Error)
	v, err := EnsureAcquisitionCoverageStartedAt()
	require.NoError(t, err)
	assert.Equal(t, int64(100), v)
}

func TestFunnelWindowStabilityAndRates(t *testing.T) {
	resetAcquisitionFixtures(t)
	require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "1"}).Error)

	from := int64(1000)
	to := int64(2000)

	// Touch in window, completed after to → landing only
	late := &AcquisitionTouch{
		TouchId:     common.GetUUID(),
		FirstSeenAt: 1500,
		CreatedAt:   1500,
		UpdatedAt:   1500,
	}
	completedLate := int64(2500)
	late.SignupCompletedAt = &completedLate
	uidLate := 10
	late.UserId = &uidLate
	require.NoError(t, DB.Create(late).Error)

	// Touch in window, fully completed inside window
	uid := 11
	started := int64(1600)
	completed := int64(1700)
	good := &AcquisitionTouch{
		TouchId:           common.GetUUID(),
		UserId:            &uid,
		UtmSource:         "reddit",
		UtmCampaign:       "kimi_k3_launch",
		FirstSeenAt:       1500,
		SignupStartedAt:   &started,
		SignupCompletedAt: &completed,
		CreatedAt:         1500,
		UpdatedAt:         1700,
	}
	require.NoError(t, DB.Create(good).Error)

	// Soft-deleted token still counts
	tok := &Token{
		UserId:      uid,
		Key:         "testkey1111111111111111111111111111111111111111",
		Name:        "t",
		CreatedTime: 1800,
		Status:      1,
	}
	require.NoError(t, DB.Create(tok).Error)
	require.NoError(t, DB.Delete(tok).Error) // soft delete

	// Consume log inside window after signup
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    uid,
		CreatedAt: 1900,
		Type:      LogTypeConsume,
		ModelName: "kimi-k3",
	}).Error)
	// Consume at/after to excluded
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    uid,
		CreatedAt: 2000,
		Type:      LogTypeConsume,
		ModelName: "kimi-k3",
	}).Error)
	// Wrong model excluded when filter set
	require.NoError(t, LOG_DB.Create(&Log{
		UserId:    uid,
		CreatedAt: 1850,
		Type:      LogTypeConsume,
		ModelName: "other-model",
	}).Error)

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{
		From:        from,
		To:          to,
		UtmSource:   "reddit",
		UtmCampaign: "kimi_k3_launch",
		Model:       "kimi-k3",
	})
	require.NoError(t, err)
	assert.Equal(t, 1, res.LandingView) // only reddit/kimi campaign
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

	// Unfiltered includes late-completed touch in landing only
	res2, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: from, To: to})
	require.NoError(t, err)
	assert.Equal(t, 2, res2.LandingView)
	assert.Equal(t, 1, res2.SignupCompleted) // late completion excluded

	// Zero denominator rates → null
	resEmpty, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 9000, To: 9001})
	require.NoError(t, err)
	assert.Equal(t, 0, resEmpty.LandingView)
	assert.Nil(t, resEmpty.LandingToSignup)
	assert.Nil(t, resEmpty.SignupToFirstCall)
}

func TestFunnelConsumeLogsDisabled(t *testing.T) {
	resetAcquisitionFixtures(t)
	require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "1"}).Error)
	common.LogConsumeEnabled = false
	defer func() { common.LogConsumeEnabled = true }()

	uid := 21
	started := int64(1100)
	completed := int64(1200)
	require.NoError(t, DB.Create(&AcquisitionTouch{
		TouchId: common.GetUUID(), UserId: &uid, FirstSeenAt: 1050,
		SignupStartedAt: &started, SignupCompletedAt: &completed,
		CreatedAt: 1050, UpdatedAt: 1200,
	}).Error)

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)
	assert.Nil(t, res.FirstApiCallSucceeded)
	assert.Nil(t, res.SignupToFirstCall)
	assert.False(t, res.ConsumeLogsEnabled)
	assert.Equal(t, "unavailable", res.DataCompleteness.ConsumeLogs)
	assert.Equal(t, 1, res.SignupCompleted)
}

func TestFunnelExactModelMatch(t *testing.T) {
	resetAcquisitionFixtures(t)
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

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000, Model: "kimi-k3"})
	require.NoError(t, err)
	require.NotNil(t, res.FirstApiCallSucceeded)
	assert.Equal(t, 0, *res.FirstApiCallSucceeded)

	res2, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000, Model: "seedance-1-0-pro"})
	require.NoError(t, err)
	require.NotNil(t, res2.FirstApiCallSucceeded)
	assert.Equal(t, 1, *res2.FirstApiCallSucceeded)
}

func TestFunnelJSONNullSemantics(t *testing.T) {
	resetAcquisitionFixtures(t)
	require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "1"}).Error)
	common.LogConsumeEnabled = false
	defer func() { common.LogConsumeEnabled = true }()

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)
	b, err := json.Marshal(res)
	require.NoError(t, err)
	s := string(b)
	assert.Contains(t, s, `"first_api_call_succeeded":null`)
	assert.Contains(t, s, `"signup_to_first_call":null`)
	assert.Contains(t, s, `"landing_to_signup":null`)
	assert.Contains(t, s, `"historical_backfill_available":false`)
}

func TestMigrateListsIncludeAcquisitionTouch(t *testing.T) {
	// Structural source contract: both migrate paths list AcquisitionTouch and
	// run coverage CAS only after AutoMigrate success / wg.Wait + error drain.
	b, err := os.ReadFile("main.go")
	require.NoError(t, err)
	s := string(b)

	// migrateDB: AutoMigrate block contains AcquisitionTouch, then CAS after SubscriptionPlan.
	migDBStart := strings.Index(s, "func migrateDB() error")
	require.Greater(t, migDBStart, 0)
	migDBFastStart := strings.Index(s, "func migrateDBFast() error")
	require.Greater(t, migDBFastStart, migDBStart)
	migDB := s[migDBStart:migDBFastStart]
	assert.Contains(t, migDB, "&AcquisitionTouch{}")
	casIdx := strings.Index(migDB, "EnsureAcquisitionCoverageStartedAt()")
	touchIdx := strings.Index(migDB, "&AcquisitionTouch{}")
	require.Greater(t, casIdx, touchIdx, "CAS must come after AcquisitionTouch AutoMigrate entry")
	// CAS error must fail migrate
	assert.Contains(t, migDB, "acquisition coverage marker init failed")

	// migrateDBFast: AcquisitionTouch in parallel list; CAS after wg.Wait + err drain.
	migLOG := strings.Index(s, "func migrateLOGDB()")
	require.Greater(t, migLOG, migDBFastStart)
	fast := s[migDBFastStart:migLOG]
	assert.Contains(t, fast, `{&AcquisitionTouch{}, "AcquisitionTouch"}`)
	waitIdx := strings.Index(fast, "wg.Wait()")
	casFast := strings.Index(fast, "EnsureAcquisitionCoverageStartedAt()")
	require.Greater(t, waitIdx, 0)
	require.Greater(t, casFast, waitIdx, "CAS must be after wg.Wait barrier")
	// errChan drain before CAS
	errDrain := strings.Index(fast, "for err := range errChan")
	require.Greater(t, errDrain, waitIdx)
	require.Greater(t, casFast, errDrain)
	assert.Contains(t, fast, "acquisition coverage marker init failed")
}

func TestFunnelTokensErrorCompleteness(t *testing.T) {
	resetAcquisitionFixtures(t)
	require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "1"}).Error)
	uid := 88
	completed := int64(1500)
	require.NoError(t, DB.Create(&AcquisitionTouch{
		TouchId: common.GetUUID(), UserId: &uid, FirstSeenAt: 1100,
		SignupCompletedAt: &completed, CreatedAt: 1100, UpdatedAt: 1500,
	}).Error)

	// Break tokens table so Unscoped token query fails → completeness.tokens=error.
	require.NoError(t, DB.Migrator().DropTable(&Token{}))

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err) // touches still OK → overall success
	assert.Nil(t, res.ApiKeyCreated)
	assert.Equal(t, "error", res.DataCompleteness.Tokens)
	assert.Equal(t, "complete", res.DataCompleteness.Touches)
	// Restore tokens table for other tests in package.
	require.NoError(t, DB.AutoMigrate(&Token{}))
}

func TestFunnelLogDBNilCompletenessError(t *testing.T) {
	resetAcquisitionFixtures(t)
	require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "1"}).Error)
	common.LogConsumeEnabled = true
	uid := 89
	completed := int64(1500)
	require.NoError(t, DB.Create(&AcquisitionTouch{
		TouchId: common.GetUUID(), UserId: &uid, FirstSeenAt: 1100,
		SignupCompletedAt: &completed, CreatedAt: 1100, UpdatedAt: 1500,
	}).Error)

	orig := LOG_DB
	LOG_DB = nil
	t.Cleanup(func() { LOG_DB = orig })

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)
	assert.Nil(t, res.FirstApiCallSucceeded)
	assert.Nil(t, res.SignupToFirstCall)
	assert.Equal(t, "error", res.DataCompleteness.ConsumeLogs)
}

func TestSoftDeletedTokenCountsForApiKeyCreated(t *testing.T) {
	resetAcquisitionFixtures(t)
	require.NoError(t, DB.Create(&Option{Key: AcquisitionCoverageStartedAtKey, Value: "1"}).Error)
	uid := 41
	completed := int64(1200)
	require.NoError(t, DB.Create(&AcquisitionTouch{
		TouchId: common.GetUUID(), UserId: &uid, FirstSeenAt: 1100,
		SignupCompletedAt: &completed, CreatedAt: 1100, UpdatedAt: 1200,
	}).Error)
	tok := &Token{UserId: uid, Key: "softdelkey111111111111111111111111111111111111", Name: "n", CreatedTime: 1300, Status: 1}
	require.NoError(t, DB.Create(tok).Error)
	require.NoError(t, DB.Delete(tok).Error)

	// Ensure Unscoped still finds it
	var n int64
	require.NoError(t, DB.Unscoped().Model(&Token{}).Where("user_id = ?", uid).Count(&n).Error)
	assert.Equal(t, int64(1), n)
	// Scoped should be 0
	require.NoError(t, DB.Model(&Token{}).Where("user_id = ?", uid).Count(&n).Error)
	assert.Equal(t, int64(0), n)

	res, err := QueryAcquisitionFunnel(AcquisitionFunnelFilter{From: 1000, To: 2000})
	require.NoError(t, err)
	require.NotNil(t, res.ApiKeyCreated)
	assert.Equal(t, 1, *res.ApiKeyCreated)
}

func TestGetTouchMissing(t *testing.T) {
	resetAcquisitionFixtures(t)
	_, err := GetAcquisitionTouchByTouchID("0123456789abcdef0123456789abcdef")
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
}
