package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type bindConflictResponse struct {
	Success bool   `json:"success"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// writeBindConflict drives writeSecurityOperationError with a wrapped
// model.ErrExternalIdentityAlreadyClaimed, the exact shape the OAuth bind
// transaction surfaces it in, and with the provider slug the real
// /oauth/:provider route carries. The wrapped cause stands in for a private
// database detail that must never reach the client.
func writeBindConflict(t *testing.T, providerSlug, acceptLanguage string) bindConflictResponse {
	t.Helper()
	gin.SetMode(gin.TestMode)
	path := "/api/user/self/bindings"
	if providerSlug != "" {
		path = "/oauth/" + providerSlug + "/callback"
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, path, nil)
	if acceptLanguage != "" {
		c.Request.Header.Set("Accept-Language", acceptLanguage)
	}
	if providerSlug != "" {
		c.Params = gin.Params{{Key: "provider", Value: providerSlug}}
	}
	writeSecurityOperationError(c, fmt.Errorf("unique index violated: %w", model.ErrExternalIdentityAlreadyClaimed))
	var body bindConflictResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &body))
	return body
}

// TestWriteSecurityOperationErrorNamesProviderOnBindConflict pins the
// account-bind conflict contract: the machine-readable code stays stable while
// the human-readable copy names the provider and follows the request language,
// reusing the same i18n.MsgOAuthAlreadyBound catalog the pre-bind pre-checks in
// handleOAuthBind already use. Telegram keeps its dedicated upstream code and
// message unchanged.
func TestWriteSecurityOperationErrorNamesProviderOnBindConflict(t *testing.T) {
	require.NoError(t, i18n.Init())
	custom := &model.CustomOAuthProvider{Slug: "acme-sso", Name: "Acme SSO"}
	require.NoError(t, oauth.RegisterCustom(custom.Slug, oauth.NewGenericOAuthProvider(custom)))
	defer oauth.UnregisterCustomProvider(custom.Slug)

	for _, test := range []struct {
		name           string
		provider       string
		acceptLanguage string
		code           string
		message        string
	}{
		{
			name:     "google names the provider in the default language",
			provider: "google",
			code:     "ACCOUNT_ALREADY_BOUND",
			message:  "This Google account has already been bound",
		},
		{
			name:           "google is localized for zh-CN",
			provider:       "google",
			acceptLanguage: "zh-CN",
			code:           "ACCOUNT_ALREADY_BOUND",
			message:        "该 Google 账户已被绑定",
		},
		{
			name:           "google is localized for zh-TW",
			provider:       "google",
			acceptLanguage: "zh-TW",
			code:           "ACCOUNT_ALREADY_BOUND",
			message:        "該 Google 帳號已被綁定",
		},
		{
			name:           "google falls back to English for a catalogless locale",
			provider:       "google",
			acceptLanguage: "fr",
			code:           "ACCOUNT_ALREADY_BOUND",
			message:        "This Google account has already been bound",
		},
		{
			name:     "telegram keeps its dedicated code and message",
			provider: "telegram",
			code:     "TELEGRAM_BIND_ALREADY_BOUND",
			message:  "This Telegram account is already bound.",
		},
		{
			name:           "telegram keeps its dedicated message in every locale",
			provider:       "telegram",
			acceptLanguage: "zh-CN",
			code:           "TELEGRAM_BIND_ALREADY_BOUND",
			message:        "This Telegram account is already bound.",
		},
		{
			name:           "a generic built-in provider is named and localized",
			provider:       "github",
			acceptLanguage: "zh-CN",
			code:           "ACCOUNT_ALREADY_BOUND",
			message:        "该 GitHub 账户已被绑定",
		},
		{
			name:           "a custom provider is named by its display name",
			provider:       "acme-sso",
			acceptLanguage: "zh-CN",
			code:           "ACCOUNT_ALREADY_BOUND",
			message:        "该 Acme SSO 账户已被绑定",
		},
		{
			name:           "an unregistered provider slug keeps the generic message",
			provider:       "not-registered",
			acceptLanguage: "zh-CN",
			code:           "ACCOUNT_ALREADY_BOUND",
			message:        "This external account is already bound.",
		},
		{
			name:           "a route without a provider param keeps the generic message",
			provider:       "",
			acceptLanguage: "zh-CN",
			code:           "ACCOUNT_ALREADY_BOUND",
			message:        "This external account is already bound.",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			body := writeBindConflict(t, test.provider, test.acceptLanguage)
			assert.False(t, body.Success)
			assert.Equal(t, test.code, body.Code)
			assert.Equal(t, test.message, body.Message)
			// The wrapped cause is a private detail and must never be echoed.
			assert.NotContains(t, body.Message, "unique index violated")
		})
	}
}
