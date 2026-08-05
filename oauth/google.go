package oauth

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

func init() {
	Register("google", &GoogleProvider{})
}

// Google OAuth token/userinfo endpoints.
//
// Exported variables (like the common.* config globals) so tests can point
// them at an httptest mock server; production always uses the Google URLs.
var (
	GoogleTokenEndpoint    = "https://oauth2.googleapis.com/token"
	GoogleUserInfoEndpoint = "https://openidconnect.googleapis.com/v1/userinfo"
)

// GoogleRedirectUri resolves the authorized redirect URI for the Google
// authorization-code flow. It must point at the SPA callback route
// (/oauth/google) so the unified JSON flow (/api/oauth/google) can finalize
// the login client-side, mirroring the OIDC provider. An admin-provided
// override (GoogleRedirectUri option) wins.
func GoogleRedirectUri() string {
	if common.GoogleRedirectUri != "" {
		return common.GoogleRedirectUri
	}
	return strings.TrimSuffix(system_setting.ServerAddress, "/") + "/oauth/google"
}

// GoogleProvider implements OAuth for Google (standard Google accounts only;
// scopes openid + userinfo.email + userinfo.profile).
type GoogleProvider struct{}

type googleTokenResponse struct {
	AccessToken      string `json:"access_token"`
	IDToken          string `json:"id_token"`
	TokenType        string `json:"token_type"`
	ExpiresIn        int    `json:"expires_in"`
	Scope            string `json:"scope"`
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

type googleUser struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

func (p *GoogleProvider) GetName() string {
	return "Google"
}

func (p *GoogleProvider) IsEnabled() bool {
	return common.GoogleOAuthEnabled
}

func (p *GoogleProvider) ExchangeToken(ctx context.Context, code string, c *gin.Context) (*OAuthToken, error) {
	if code == "" {
		return nil, NewOAuthError(i18n.MsgOAuthInvalidCode, nil)
	}

	logger.LogDebug(ctx, "[OAuth-Google] ExchangeToken: code=%s...", code[:min(len(code), 10)])

	// redirect_uri must match the one used in the authorize request.
	values := url.Values{}
	values.Set("client_id", common.GoogleClientId)
	values.Set("client_secret", common.GoogleClientSecret)
	values.Set("code", code)
	values.Set("grant_type", "authorization_code")
	values.Set("redirect_uri", GoogleRedirectUri())

	req, err := http.NewRequestWithContext(ctx, "POST", GoogleTokenEndpoint, strings.NewReader(values.Encode()))
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
		logger.LogError(ctx, fmt.Sprintf("[OAuth-Google] ExchangeToken error: %s", err.Error()))
		return nil, NewOAuthErrorWithRaw(i18n.MsgOAuthConnectFailed, map[string]any{"Provider": "Google"}, err.Error())
	}
	defer res.Body.Close()

	var tokenResponse googleTokenResponse
	if err = common.DecodeJson(res.Body, &tokenResponse); err != nil {
		logger.LogError(ctx, fmt.Sprintf("[OAuth-Google] ExchangeToken decode error: %s", err.Error()))
		return nil, err
	}

	if tokenResponse.Error != "" {
		msg := tokenResponse.ErrorDescription
		if msg == "" {
			msg = tokenResponse.Error
		}
		logger.LogError(ctx, fmt.Sprintf("[OAuth-Google] ExchangeToken failed: %s", msg))
		return nil, NewOAuthErrorWithRaw(i18n.MsgOAuthTokenFailed, map[string]any{"Provider": "Google"}, msg)
	}
	if tokenResponse.AccessToken == "" {
		logger.LogError(ctx, "[OAuth-Google] ExchangeToken failed: empty access token")
		return nil, NewOAuthError(i18n.MsgOAuthTokenFailed, map[string]any{"Provider": "Google"})
	}

	logger.LogDebug(ctx, "[OAuth-Google] ExchangeToken success: scope=%s", tokenResponse.Scope)

	return &OAuthToken{
		AccessToken: tokenResponse.AccessToken,
		TokenType:   tokenResponse.TokenType,
		ExpiresIn:   tokenResponse.ExpiresIn,
		Scope:       tokenResponse.Scope,
		IDToken:     tokenResponse.IDToken,
	}, nil
}

func (p *GoogleProvider) GetUserInfo(ctx context.Context, token *OAuthToken) (*OAuthUser, error) {
	logger.LogDebug(ctx, "[OAuth-Google] GetUserInfo: fetching user info")

	req, err := http.NewRequestWithContext(ctx, "GET", GoogleUserInfoEndpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token.AccessToken))

	client := http.Client{
		Timeout: 20 * time.Second,
	}
	res, err := client.Do(req)
	if err != nil {
		logger.LogError(ctx, fmt.Sprintf("[OAuth-Google] GetUserInfo error: %s", err.Error()))
		return nil, NewOAuthErrorWithRaw(i18n.MsgOAuthConnectFailed, map[string]any{"Provider": "Google"}, err.Error())
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		logger.LogError(ctx, fmt.Sprintf("[OAuth-Google] GetUserInfo failed: status=%d", res.StatusCode))
		return nil, NewOAuthErrorWithRaw(i18n.MsgOAuthGetUserErr, map[string]any{"Provider": "Google"}, fmt.Sprintf("status %d", res.StatusCode))
	}

	var info googleUser
	if err = common.DecodeJson(res.Body, &info); err != nil {
		logger.LogError(ctx, fmt.Sprintf("[OAuth-Google] GetUserInfo decode error: %s", err.Error()))
		return nil, err
	}

	if info.Sub == "" {
		logger.LogError(ctx, "[OAuth-Google] GetUserInfo failed: empty sub field")
		return nil, NewOAuthError(i18n.MsgOAuthUserInfoEmpty, map[string]any{"Provider": "Google"})
	}

	logger.LogDebug(ctx, "[OAuth-Google] GetUserInfo success: sub=%s, name=%s, email=%s",
		info.Sub, info.Name, info.Email)

	return &OAuthUser{
		ProviderUserID: info.Sub, // Google's stable, unique subject identifier
		DisplayName:    info.Name,
		Email:          info.Email,
		Extra: map[string]any{
			"picture":        info.Picture,
			"email_verified": info.EmailVerified,
		},
	}, nil
}

func (p *GoogleProvider) IsUserIDTaken(providerUserID string) bool {
	return model.IsGoogleSubAlreadyTaken(providerUserID)
}

func (p *GoogleProvider) FillUserByProviderID(user *model.User, providerUserID string) error {
	user.GoogleSub = providerUserID
	return user.FillUserByGoogleSub()
}

func (p *GoogleProvider) SetProviderUserID(user *model.User, providerUserID string) {
	user.GoogleSub = providerUserID
}

func (p *GoogleProvider) GetProviderPrefix() string {
	return "google_"
}
