package controller

import (
	"net/http"
	"net/url"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/oauth"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

// googleAuthorizeEndpoint is Google's authorization endpoint.
const googleAuthorizeEndpoint = "https://accounts.google.com/o/oauth2/v2/auth"

// Minimal scopes per the Google Cloud "Vancine OAuth" consent configuration:
// openid + userinfo.email + userinfo.profile.
const googleOAuthScope = "openid email profile"

// GoogleLogin starts the authorization-code flow: it generates a CSRF state,
// persists it in the session (same "oauth_state" key the unified HandleOAuth
// callback validates) and sends the browser to Google's consent page.
//
// Google then redirects back to the SPA callback route (/oauth/google), whose
// page exchanges the code through the unified JSON endpoint GET
// /api/oauth/google (served by HandleOAuth via the /api/oauth/:provider
// wildcard). This keeps the login finalization inside the SPA so the auth
// store and localStorage "uid" are written exactly like GitHub/Discord.
func GoogleLogin(c *gin.Context) {
	if !common.GoogleOAuthEnabled || common.GoogleClientId == "" {
		common.ApiErrorMsg(c, "管理员未开启通过 Google 登录以及注册")
		return
	}

	session := sessions.Default(c)
	state := common.GetRandomString(12)
	session.Set("oauth_state", state)
	if affCode := c.Query("aff"); affCode != "" {
		session.Set("aff", affCode)
	}
	if err := session.Save(); err != nil {
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
// code+state preserved, where the unified JSON flow takes over.
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
