package controller

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/acquisition"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Google OAuth endpoints.
//
// The token and userinfo endpoints are package variables so tests can point
// them at an httptest mock server; production always uses the Google URLs.
var googleAuthorizeEndpoint = "https://accounts.google.com/o/oauth2/v2/auth"
var googleTokenEndpoint = "https://oauth2.googleapis.com/token"
var googleUserInfoEndpoint = "https://openidconnect.googleapis.com/v1/userinfo"

// Minimal scopes per the Google Cloud "Vancine OAuth" consent configuration:
// openid + userinfo.email + userinfo.profile.
const googleOAuthScope = "openid email profile"

type googleTokenResponse struct {
	AccessToken      string `json:"access_token"`
	IDToken          string `json:"id_token"`
	TokenType        string `json:"token_type"`
	ExpiresIn        int    `json:"expires_in"`
	Scope            string `json:"scope"`
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

type googleUserInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

// getGoogleRedirectUri returns the configured callback URI, defaulting to
// ServerAddress + /api/oauth/google/callback (must match the authorized
// redirect URIs registered in the Google Cloud Console).
func getGoogleRedirectUri() string {
	if common.GoogleRedirectUri != "" {
		return common.GoogleRedirectUri
	}
	return strings.TrimSuffix(system_setting.ServerAddress, "/") + "/api/oauth/google/callback"
}

// sanitizeGoogleOAuthRedirect only allows same-site path redirects so the
// ?redirect= parameter cannot be abused as an open redirect.
func sanitizeGoogleOAuthRedirect(redirect string) string {
	if redirect == "" || !strings.HasPrefix(redirect, "/") || strings.HasPrefix(redirect, "//") {
		return "/"
	}
	return redirect
}

func getGoogleSessionString(session sessions.Session, key string) string {
	value := session.Get(key)
	if value == nil {
		return ""
	}
	str, _ := value.(string)
	return str
}

// GoogleLogin starts the authorization-code flow: it generates a CSRF state,
// persists it (plus the post-login redirect target) in the session and sends
// the browser to Google's consent page.
func GoogleLogin(c *gin.Context) {
	if !common.GoogleOAuthEnabled || common.GoogleClientId == "" {
		common.ApiErrorMsg(c, "管理员未开启通过 Google 登录以及注册")
		return
	}

	session := sessions.Default(c)
	state := common.GetRandomString(12)
	session.Set("oauth_state", state)
	if redirect := c.Query("redirect"); redirect != "" {
		session.Set("google_redirect", redirect)
	} else {
		session.Delete("google_redirect")
	}
	if affCode := c.Query("aff"); affCode != "" {
		session.Set("aff", affCode)
	}
	if err := session.Save(); err != nil {
		common.ApiError(c, err)
		return
	}

	params := url.Values{}
	params.Set("client_id", common.GoogleClientId)
	params.Set("redirect_uri", getGoogleRedirectUri())
	params.Set("response_type", "code")
	params.Set("scope", googleOAuthScope)
	params.Set("state", state)
	params.Set("prompt", "select_account")
	c.Redirect(http.StatusFound, googleAuthorizeEndpoint+"?"+params.Encode())
}

// GoogleCallback handles Google's redirect: validates the state, exchanges
// the code for tokens, resolves the Google identity and either logs in (with
// a redirect back into the SPA) or binds the account to the logged-in user.
func GoogleCallback(c *gin.Context) {
	session := sessions.Default(c)
	state := c.Query("state")
	if state == "" || session.Get("oauth_state") == nil || state != session.Get("oauth_state").(string) {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "state is empty or not same",
		})
		return
	}
	redirect := sanitizeGoogleOAuthRedirect(getGoogleSessionString(session, "google_redirect"))

	// Logged-in session → account bind flow.
	if session.Get("username") != nil {
		googleBind(c, redirect)
		return
	}

	// Surface provider-side errors (e.g. user denied access).
	if errorCode := c.Query("error"); errorCode != "" {
		errorDescription := c.Query("error_description")
		if errorDescription == "" {
			errorDescription = errorCode
		}
		common.ApiErrorMsg(c, errorDescription)
		return
	}

	if !common.GoogleOAuthEnabled || common.GoogleClientId == "" {
		common.ApiErrorMsg(c, "管理员未开启通过 Google 登录以及注册")
		return
	}

	info, err := getGoogleUserInfoByCode(c.Query("code"))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	user, err := findOrCreateGoogleUser(c, info, session)
	if err != nil {
		switch err.(type) {
		case *OAuthUserDeletedError:
			common.ApiErrorI18n(c, i18n.MsgOAuthUserDeleted)
		case *OAuthRegistrationDisabledError:
			common.ApiErrorI18n(c, i18n.MsgUserRegisterDisabled)
		default:
			common.ApiError(c, err)
		}
		return
	}

	if user.Status != common.UserStatusEnabled {
		common.ApiErrorMsg(c, "用户已被封禁")
		return
	}

	googleSessionLogin(user, c, redirect)
}

// getGoogleUserInfoByCode exchanges the authorization code for an access
// token and fetches the OpenID Connect userinfo.
func getGoogleUserInfoByCode(code string) (*googleUserInfo, error) {
	if code == "" {
		return nil, errors.New("无效的参数")
	}

	values := url.Values{}
	values.Set("client_id", common.GoogleClientId)
	values.Set("client_secret", common.GoogleClientSecret)
	values.Set("code", code)
	values.Set("grant_type", "authorization_code")
	values.Set("redirect_uri", getGoogleRedirectUri())

	req, err := http.NewRequest("POST", googleTokenEndpoint, strings.NewReader(values.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	client := http.Client{
		Timeout: 20 * time.Second,
	}
	res, err := client.Do(req)
	if err != nil {
		common.SysLog(err.Error())
		return nil, errors.New("无法连接至 Google 服务器，请稍后重试！")
	}
	defer res.Body.Close()
	var tokenResponse googleTokenResponse
	if err = common.DecodeJson(res.Body, &tokenResponse); err != nil {
		return nil, err
	}
	if tokenResponse.Error != "" {
		msg := tokenResponse.ErrorDescription
		if msg == "" {
			msg = tokenResponse.Error
		}
		common.SysLog("Google 获取 Token 失败: " + msg)
		return nil, fmt.Errorf("Google 授权失败：%s", msg)
	}
	if tokenResponse.AccessToken == "" {
		common.SysLog("Google 获取 Token 失败，请检查设置！")
		return nil, errors.New("Google 获取 Token 失败，请检查设置！")
	}

	req, err = http.NewRequest("GET", googleUserInfoEndpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tokenResponse.AccessToken)
	res2, err := client.Do(req)
	if err != nil {
		common.SysLog(err.Error())
		return nil, errors.New("无法连接至 Google 服务器，请稍后重试！")
	}
	defer res2.Body.Close()
	if res2.StatusCode != http.StatusOK {
		common.SysLog("Google 获取用户信息失败！请检查设置！")
		return nil, errors.New("Google 获取用户信息失败，请检查设置！")
	}

	var info googleUserInfo
	if err = common.DecodeJson(res2.Body, &info); err != nil {
		return nil, err
	}
	if info.Sub == "" {
		common.SysLog("Google 用户信息为空！请检查设置！")
		return nil, errors.New("Google 用户信息为空，请检查设置！")
	}
	return &info, nil
}

// findOrCreateGoogleUser resolves the Google identity to a local user:
//  1. google_sub already bound → that user logs in.
//  2. email matches an existing user → bind google_sub onto that account.
//  3. otherwise register a new user (when registration is enabled).
func findOrCreateGoogleUser(c *gin.Context, info *googleUserInfo, session sessions.Session) (*model.User, error) {
	user := &model.User{}

	if model.IsGoogleSubAlreadyTaken(info.Sub) {
		user.GoogleSub = info.Sub
		if err := user.FillUserByGoogleSub(); err != nil {
			return nil, err
		}
		if user.Id == 0 {
			return nil, &OAuthUserDeletedError{}
		}
		return user, nil
	}

	if info.Email != "" {
		existing := model.User{Email: info.Email}
		_ = existing.FillUserByEmail()
		if existing.Id != 0 {
			existing.GoogleSub = info.Sub
			if err := existing.Update(false); err != nil {
				return nil, err
			}
			return &existing, nil
		}
	}

	if !common.RegisterEnabled {
		return nil, &OAuthRegistrationDisabledError{}
	}

	user.Username = "google_" + strconv.Itoa(model.GetMaxUserId()+1)
	if info.Name != "" {
		user.DisplayName = info.Name
	} else {
		user.DisplayName = "Google User"
	}
	if info.Email != "" {
		user.Email = info.Email
	}
	user.GoogleSub = info.Sub
	user.Role = common.RoleCommonUser
	user.Status = common.UserStatusEnabled

	affCode := session.Get("aff")
	inviterId := 0
	if affCode != nil {
		inviterId, _ = model.GetUserIdByAffCode(affCode.(string))
	}

	// Create the user and persist the google_sub binding atomically, mirroring
	// the built-in provider path in findOrCreateOAuthUser.
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := user.InsertWithTx(tx, inviterId); err != nil {
			return err
		}
		if err := tx.Model(user).Updates(map[string]interface{}{
			"google_sub": user.GoogleSub,
		}).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	user.FinalizeOAuthUserCreation(inviterId)
	// Default token for the new user (mirrors password register); abort
	// before binding/login on failure to avoid a half-provisioned account.
	if err := ensureDefaultTokenForNewUser(user); err != nil {
		return nil, err
	}
	// New user only — bind first-touch attribution (soft-fail).
	acquisition.BindTouchToUser(c, user.Id)

	return user, nil
}

// googleBind binds the Google account to the currently logged-in user.
func googleBind(c *gin.Context, redirect string) {
	if !common.GoogleOAuthEnabled || common.GoogleClientId == "" {
		common.ApiErrorMsg(c, "管理员未开启通过 Google 登录以及注册")
		return
	}

	info, err := getGoogleUserInfoByCode(c.Query("code"))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	if model.IsGoogleSubAlreadyTaken(info.Sub) {
		common.ApiErrorMsg(c, "该 Google 账户已被绑定")
		return
	}

	session := sessions.Default(c)
	id := session.Get("id")
	if id == nil {
		common.ApiErrorMsg(c, "用户未登录")
		return
	}
	user := model.User{Id: id.(int)}
	if err := user.FillUserById(); err != nil {
		common.ApiError(c, err)
		return
	}
	user.GoogleSub = info.Sub
	if err := user.Update(false); err != nil {
		common.ApiError(c, err)
		return
	}
	c.Redirect(http.StatusFound, redirect)
}

// googleSessionLogin mirrors setupLogin's session setup but finishes with a
// browser redirect back into the SPA instead of a JSON response, since the
// callback is a full-page navigation from Google.
func googleSessionLogin(user *model.User, c *gin.Context, redirect string) {
	model.UpdateUserLastLoginAt(user.Id)
	session := sessions.Default(c)
	session.Clear()
	session.Set("id", user.Id)
	session.Set("username", user.Username)
	session.Set("role", user.Role)
	session.Set("status", user.Status)
	session.Set("group", user.Group)
	if err := session.Save(); err != nil {
		common.ApiError(c, err)
		return
	}
	c.Redirect(http.StatusFound, redirect)
}
