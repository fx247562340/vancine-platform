package acquisition

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsHTTPSRequest(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "http://localhost/", nil)
	assert.False(t, IsHTTPSRequest(req))

	req2 := httptest.NewRequest(http.MethodGet, "http://localhost/", nil)
	req2.Header.Set("X-Forwarded-Proto", "https")
	assert.True(t, IsHTTPSRequest(req2))

	req3 := httptest.NewRequest(http.MethodGet, "http://localhost/", nil)
	req3.Header.Set("X-Forwarded-Proto", "https, http")
	assert.True(t, IsHTTPSRequest(req3))

	req4 := httptest.NewRequest(http.MethodGet, "http://localhost/", nil)
	req4.Header.Set("X-Forwarded-Protocol", "https")
	assert.True(t, IsHTTPSRequest(req4))

	req5 := httptest.NewRequest(http.MethodGet, "https://localhost/", nil)
	req5.TLS = &tls.ConnectionState{}
	assert.True(t, IsHTTPSRequest(req5))
}

func TestSetTouchCookieSecureConditional(t *testing.T) {
	gin.SetMode(gin.TestMode)
	common.CryptoSecret = "cookie-test-secret"

	// HTTP → Secure=false
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "http://127.0.0.1/", nil)
	SetTouchCookie(c, "0123456789abcdef0123456789abcdef")
	cookies := w.Result().Cookies()
	require.Len(t, cookies, 1)
	assert.Equal(t, model.AcquisitionCookieName, cookies[0].Name)
	assert.False(t, cookies[0].Secure)
	assert.True(t, cookies[0].HttpOnly)
	assert.Equal(t, http.SameSiteLaxMode, cookies[0].SameSite)
	assert.Equal(t, "/", cookies[0].Path)
	assert.Equal(t, model.AcquisitionCookieMaxAge, cookies[0].MaxAge)
	assert.Empty(t, cookies[0].Domain)

	// HTTPS via forwarded proto → Secure=true
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request = httptest.NewRequest(http.MethodGet, "http://127.0.0.1/", nil)
	c2.Request.Header.Set("X-Forwarded-Proto", "https")
	SetTouchCookie(c2, "0123456789abcdef0123456789abcdef")
	cookies2 := w2.Result().Cookies()
	require.Len(t, cookies2, 1)
	assert.True(t, cookies2[0].Secure)
}
