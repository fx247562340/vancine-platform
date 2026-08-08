package acquisition

import (
	"crypto/tls"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

const serviceTestTouchID = "0123456789abcdef0123456789abcdef"

// serviceFixture swaps the model package globals onto a fresh in-memory DB
// and restores everything on cleanup so tests stay isolated. Cleanups run
// LIFO: globals are restored first, then the connection pool is closed.
func serviceFixture(t *testing.T) {
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
	origLogDB := model.LOG_DB
	origSecret := common.CryptoSecret
	t.Cleanup(func() {
		model.DB = origDB
		model.LOG_DB = origLogDB
		common.CryptoSecret = origSecret
	})

	require.NoError(t, db.AutoMigrate(&model.AcquisitionTouch{}, &model.Option{}))

	model.DB = db
	model.LOG_DB = db
	common.CryptoSecret = "acquisition-service-test-secret"
}

func newAcquisitionContext(target string) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, target, nil)
	return c, recorder
}

func touchCookieFromResponse(t *testing.T, recorder *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == model.AcquisitionCookieName {
			return cookie
		}
	}
	require.Fail(t, "vancine_ft cookie not set")
	return nil
}

func TestAcquisitionIsHTTPSRequest(t *testing.T) {
	plain := httptest.NewRequest(http.MethodGet, "http://localhost/", nil)
	assert.False(t, IsHTTPSRequest(plain))

	forwardedProto := httptest.NewRequest(http.MethodGet, "http://localhost/", nil)
	forwardedProto.Header.Set("X-Forwarded-Proto", "https")
	assert.True(t, IsHTTPSRequest(forwardedProto))

	forwardedList := httptest.NewRequest(http.MethodGet, "http://localhost/", nil)
	forwardedList.Header.Set("X-Forwarded-Proto", "https, http")
	assert.True(t, IsHTTPSRequest(forwardedList))

	forwardedProtocol := httptest.NewRequest(http.MethodGet, "http://localhost/", nil)
	forwardedProtocol.Header.Set("X-Forwarded-Protocol", "HTTPS")
	assert.True(t, IsHTTPSRequest(forwardedProtocol))

	tlsConn := httptest.NewRequest(http.MethodGet, "http://localhost/", nil)
	tlsConn.TLS = &tls.ConnectionState{}
	assert.True(t, IsHTTPSRequest(tlsConn))

	assert.False(t, IsHTTPSRequest(nil))
}

func TestAcquisitionSetTouchCookieAttributes(t *testing.T) {
	serviceFixture(t)

	// Plain HTTP keeps Secure=false so local development works.
	c, recorder := newAcquisitionContext("http://127.0.0.1/")
	SetTouchCookie(c, serviceTestTouchID)
	cookies := recorder.Result().Cookies()
	require.Len(t, cookies, 1)
	cookie := cookies[0]
	assert.Equal(t, model.AcquisitionCookieName, cookie.Name)
	assert.True(t, cookie.HttpOnly)
	assert.False(t, cookie.Secure)
	assert.Equal(t, http.SameSiteLaxMode, cookie.SameSite)
	assert.Equal(t, "/", cookie.Path)
	assert.Equal(t, model.AcquisitionCookieMaxAge, cookie.MaxAge)
	assert.Empty(t, cookie.Domain, "cookie must stay host-only")

	id, ok := model.ParseAndVerifyTouchCookie(cookie.Value)
	require.True(t, ok)
	assert.Equal(t, serviceTestTouchID, id)

	// Forwarded HTTPS flips Secure on.
	c2, recorder2 := newAcquisitionContext("http://127.0.0.1/")
	c2.Request.Header.Set("X-Forwarded-Proto", "https")
	SetTouchCookie(c2, serviceTestTouchID)
	require.Len(t, recorder2.Result().Cookies(), 1)
	assert.True(t, recorder2.Result().Cookies()[0].Secure)

	// Empty touch id writes no cookie.
	c3, recorder3 := newAcquisitionContext("http://127.0.0.1/")
	SetTouchCookie(c3, "")
	assert.Empty(t, recorder3.Result().Cookies())
}

func TestAcquisitionReadVerifiedTouchID(t *testing.T) {
	serviceFixture(t)

	// Valid cookie round-trips.
	c, _ := newAcquisitionContext("/")
	c.Request.AddCookie(&http.Cookie{
		Name:  model.AcquisitionCookieName,
		Value: model.FormatTouchCookieValue(serviceTestTouchID),
	})
	assert.Equal(t, serviceTestTouchID, ReadVerifiedTouchID(c))

	// Forged signature, malformed value, and missing cookie all yield "".
	forged, _ := newAcquisitionContext("/")
	forged.Request.AddCookie(&http.Cookie{Name: model.AcquisitionCookieName, Value: serviceTestTouchID + ".deadbeef"})
	assert.Equal(t, "", ReadVerifiedTouchID(forged))

	malformed, _ := newAcquisitionContext("/")
	malformed.Request.AddCookie(&http.Cookie{Name: model.AcquisitionCookieName, Value: "a.b.c"})
	assert.Equal(t, "", ReadVerifiedTouchID(malformed))

	missing, _ := newAcquisitionContext("/")
	assert.Equal(t, "", ReadVerifiedTouchID(missing))
}

func TestAcquisitionRecordLandingViewCreates(t *testing.T) {
	serviceFixture(t)

	c, recorder := newAcquisitionContext("/")
	result, err := RecordLandingView(c, TouchFields{
		UtmSource:   "reddit",
		LandingPath: "/kimi-k3-api",
	})
	require.NoError(t, err)
	assert.True(t, result.Ok)
	assert.True(t, result.TouchPresent)

	cookie := touchCookieFromResponse(t, recorder)
	id, ok := model.ParseAndVerifyTouchCookie(cookie.Value)
	require.True(t, ok)
	touch, err := model.GetAcquisitionTouchByTouchID(id)
	require.NoError(t, err)
	assert.Equal(t, "reddit", touch.UtmSource)
	assert.Equal(t, "/kimi-k3-api", touch.LandingPath)
	assert.Nil(t, touch.UserId)

	var count int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

// A repeat landing_view with a valid touch must be idempotent: no second row,
// no snapshot mutation, and the cookie is refreshed (re-Set-Cookie).
func TestAcquisitionRecordLandingViewIdempotentNoOverwrite(t *testing.T) {
	serviceFixture(t)

	touch, err := model.CreateAcquisitionTouch(model.AcquisitionUTMFields{
		UtmSource:   "reddit",
		LandingPath: "/a",
	})
	require.NoError(t, err)

	c, recorder := newAcquisitionContext("/")
	c.Request.AddCookie(&http.Cookie{
		Name:  model.AcquisitionCookieName,
		Value: model.FormatTouchCookieValue(touch.TouchId),
	})
	result, err := RecordLandingView(c, TouchFields{
		UtmSource:   "twitter",
		LandingPath: "/b",
	})
	require.NoError(t, err)
	assert.True(t, result.Ok)
	assert.True(t, result.TouchPresent)

	// Cookie refreshed for the same touch id, not rotated.
	cookie := touchCookieFromResponse(t, recorder)
	id, ok := model.ParseAndVerifyTouchCookie(cookie.Value)
	require.True(t, ok)
	assert.Equal(t, touch.TouchId, id)

	// Snapshot frozen: later UTM/path ignored.
	loaded, err := model.GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	assert.Equal(t, "reddit", loaded.UtmSource)
	assert.Equal(t, "/a", loaded.LandingPath)

	var count int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

// A signature-valid cookie whose row is gone must mint a replacement touch
// (rotate the cookie) instead of failing.
func TestAcquisitionRecordLandingViewOrphanCookieMintsNew(t *testing.T) {
	serviceFixture(t)

	c, recorder := newAcquisitionContext("/")
	c.Request.AddCookie(&http.Cookie{
		Name:  model.AcquisitionCookieName,
		Value: model.FormatTouchCookieValue(serviceTestTouchID), // signed but never stored
	})
	result, err := RecordLandingView(c, TouchFields{LandingPath: "/x"})
	require.NoError(t, err)
	assert.True(t, result.Ok)

	cookie := touchCookieFromResponse(t, recorder)
	id, ok := model.ParseAndVerifyTouchCookie(cookie.Value)
	require.True(t, ok)
	assert.NotEqual(t, serviceTestTouchID, id)
	_, err = model.GetAcquisitionTouchByTouchID(id)
	require.NoError(t, err)
}

func TestAcquisitionMarkSignupStarted(t *testing.T) {
	serviceFixture(t)

	// No cookie: soft success, no row created.
	noCookie, _ := newAcquisitionContext("/")
	result := MarkSignupStarted(noCookie)
	assert.True(t, result.Ok)
	assert.False(t, result.TouchPresent)
	var count int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(0), count)

	// Invalid cookie: same soft no-op.
	badCookie, _ := newAcquisitionContext("/")
	badCookie.Request.AddCookie(&http.Cookie{Name: model.AcquisitionCookieName, Value: "junk"})
	result = MarkSignupStarted(badCookie)
	assert.True(t, result.Ok)
	assert.False(t, result.TouchPresent)

	// Signature-valid cookie but no DB row: still a soft no-op.
	orphan, _ := newAcquisitionContext("/")
	orphan.Request.AddCookie(&http.Cookie{
		Name:  model.AcquisitionCookieName,
		Value: model.FormatTouchCookieValue(serviceTestTouchID),
	})
	result = MarkSignupStarted(orphan)
	assert.True(t, result.Ok)
	assert.False(t, result.TouchPresent)
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(0), count)

	// Valid touch: sets once, never rewrites the first timestamp.
	touch, err := model.CreateAcquisitionTouch(model.AcquisitionUTMFields{LandingPath: "/sign-up"})
	require.NoError(t, err)
	valid, _ := newAcquisitionContext("/")
	valid.Request.AddCookie(&http.Cookie{
		Name:  model.AcquisitionCookieName,
		Value: model.FormatTouchCookieValue(touch.TouchId),
	})
	result = MarkSignupStarted(valid)
	assert.True(t, result.Ok)
	assert.True(t, result.TouchPresent)

	loaded, err := model.GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.SignupStartedAt)
	first := *loaded.SignupStartedAt

	older := first - 1000
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Where("id = ?", loaded.Id).
		Update("signup_started_at", older).Error)
	result = MarkSignupStarted(valid)
	assert.True(t, result.Ok)
	assert.True(t, result.TouchPresent)
	reloaded, err := model.GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, reloaded.SignupStartedAt)
	assert.Equal(t, older, *reloaded.SignupStartedAt)
}

func TestAcquisitionBindTouchToUser(t *testing.T) {
	serviceFixture(t)

	touch, err := model.CreateAcquisitionTouch(model.AcquisitionUTMFields{LandingPath: "/bind"})
	require.NoError(t, err)

	// With a valid cookie the bind succeeds.
	c, _ := newAcquisitionContext("/")
	c.Request.AddCookie(&http.Cookie{
		Name:  model.AcquisitionCookieName,
		Value: model.FormatTouchCookieValue(touch.TouchId),
	})
	BindTouchToUser(c, 77)
	loaded, err := model.GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	require.NotNil(t, loaded.UserId)
	assert.Equal(t, 77, *loaded.UserId)
	require.NotNil(t, loaded.SignupCompletedAt)

	// Without a cookie the call is a silent no-op (registration unaffected).
	touch2, err := model.CreateAcquisitionTouch(model.AcquisitionUTMFields{LandingPath: "/nocookie"})
	require.NoError(t, err)
	noCookie, _ := newAcquisitionContext("/")
	BindTouchToUser(noCookie, 78)
	loaded2, err := model.GetAcquisitionTouchByTouchID(touch2.TouchId)
	require.NoError(t, err)
	assert.Nil(t, loaded2.UserId)

	// Invalid user ids never touch the table.
	BindTouchToUser(c, 0)
	BindTouchToUser(nil, 77)
}

// A transient touch-lookup failure must not mint a replacement touch: the
// existing row and cookie stay untouched and the error is surfaced. Only a
// true record-not-found result may rotate the touch.
func TestAcquisitionRecordLandingViewTransientLookupError(t *testing.T) {
	serviceFixture(t)

	touch, err := model.CreateAcquisitionTouch(model.AcquisitionUTMFields{
		UtmSource:   "reddit",
		LandingPath: "/keep",
	})
	require.NoError(t, err)

	const cbName = "test:fail_acquisition_touch_lookup"
	// Cleanup registered before the callback so the injection is always
	// removed, even on early failure.
	t.Cleanup(func() {
		assert.NoError(t, model.DB.Callback().Query().Remove(cbName))
	})
	require.NoError(t, model.DB.Callback().Query().Before("gorm:query").Register(cbName, func(tx *gorm.DB) {
		if tx.Statement.Table == "acquisition_touches" {
			_ = tx.AddError(errors.New("injected transient lookup failure"))
		}
	}))

	c, recorder := newAcquisitionContext("/")
	c.Request.AddCookie(&http.Cookie{
		Name:  model.AcquisitionCookieName,
		Value: model.FormatTouchCookieValue(touch.TouchId),
	})
	result, err := RecordLandingView(c, TouchFields{
		UtmSource:   "twitter",
		LandingPath: "/replace-attempt",
	})
	require.Error(t, err)
	assert.False(t, result.Ok)

	// Remove the injection, then verify nothing was created or rotated.
	require.NoError(t, model.DB.Callback().Query().Remove(cbName))

	assert.Empty(t, recorder.Result().Cookies(), "no replacement Set-Cookie on transient error")
	var count int64
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)

	loaded, err := model.GetAcquisitionTouchByTouchID(touch.TouchId)
	require.NoError(t, err)
	assert.Equal(t, "reddit", loaded.UtmSource)
	assert.Equal(t, "/keep", loaded.LandingPath)

	// Once the transient failure clears, the same request keeps the original
	// touch (refresh only), proving first-touch continuity.
	c2, recorder2 := newAcquisitionContext("/")
	c2.Request.AddCookie(&http.Cookie{
		Name:  model.AcquisitionCookieName,
		Value: model.FormatTouchCookieValue(touch.TouchId),
	})
	result2, err := RecordLandingView(c2, TouchFields{UtmSource: "twitter"})
	require.NoError(t, err)
	assert.True(t, result2.Ok)
	assert.True(t, result2.TouchPresent)
	cookie := touchCookieFromResponse(t, recorder2)
	id, ok := model.ParseAndVerifyTouchCookie(cookie.Value)
	require.True(t, ok)
	assert.Equal(t, touch.TouchId, id)
	require.NoError(t, model.DB.Model(&model.AcquisitionTouch{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}
