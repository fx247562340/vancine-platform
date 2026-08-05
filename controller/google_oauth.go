package controller

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"

	"github.com/gin-gonic/gin"
)

// googleAuthorizeEndpoint is Google's authorization endpoint.
const googleAuthorizeEndpoint = "https://accounts.google.com/o/oauth2/v2/auth"

// Minimal scopes per the Google Cloud "Vancine OAuth" consent configuration:
// openid + userinfo.email + userinfo.profile.
const googleOAuthScope = "openid email profile"

// GoogleLogin starts the authorization-code flow: it creates a one-time auth
// flow in the auth_flows table and uses its token as the CSRF state (the same
// purpose/provider pair the unified HandleOAuth callback validates via
// GetAuthFlow/ConsumeAuthFlow), then sends the browser to Google's consent
// page. The flow payload carries the affiliate code, matching the format
// GenerateOAuthCode writes for the client-driven providers.
//
// Google then redirects back to the SPA callback route (/oauth/google), whose
// page exchanges the code through the unified JSON endpoint GET
// /api/oauth/google (served by HandleOAuth via the /api/oauth/:provider
// wildcard). This keeps the login finalization inside the SPA so the auth
// store and localStorage "uid" are written exactly like GitHub/Discord.
func GoogleLogin(c *gin.Context) {
	if !common.GoogleOAuthEnabled || common.GoogleClientId == "" {
		common.ApiErrorI18n(c, i18n.MsgOAuthNotEnabled, providerParams("Google"))
		return
	}

	affCode := strings.TrimSpace(c.Query("aff"))
	if len(affCode) > 32 {
		affCode = ""
	}
	payload, err := common.Marshal(oauthFlowPayload{AffiliateCode: affCode})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	expiresAt := time.Now().Add(oauthAuthFlowTTL)
	state, _, err := model.CreateAuthFlow(model.AuthFlowCreate{
		Purpose:   model.AuthFlowPurposeOAuth,
		Provider:  "google",
		Intent:    model.AuthFlowIntentLogin,
		Payload:   string(payload),
		ExpiresAt: expiresAt,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}

	params := url.Values{}
	params.Set("client_id", common.GoogleClientId)
	params.Set("redirect_uri", oauth.GoogleRedirectUri())
	params.Set("response_type", "code")
	params.Set("scope", googleOAuthScope)
	params.Set("state", state)
	params.Set("prompt", "select_account")
	c.Redirect(http.StatusFound, googleAuthorizeEndpoint+"?"+params.Encode())
}

// GoogleCallback is a compatibility shim for the legacy authorized redirect
// URI (/api/oauth/google/callback). Google is now redirected to the SPA
// callback route directly; any hits on the old URI are forwarded there with
// code+state preserved, where the unified JSON flow takes over. The state is
// an auth_flows token, so no server-side session bookkeeping is needed here.
func GoogleCallback(c *gin.Context) {
	query := url.Values{}
	if code := c.Query("code"); code != "" {
		query.Set("code", code)
	}
	if state := c.Query("state"); state != "" {
		query.Set("state", state)
	}
	target := "/oauth/google"
	if encoded := query.Encode(); encoded != "" {
		target += "?" + encoded
	}
	c.Redirect(http.StatusFound, target)
}
