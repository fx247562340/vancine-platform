package controller

// CP2 P1-A11 Admin clear five-credential composite contract.
//
// The slice proves the admin-recovery path is surgical: when an
// administrator clears only the Google binding on a user that carries
// every other login method (password, valid Passkey, enabled built-in
// OIDC binding, enabled custom OAuth binding), every other credential is
// untouched and remains usable. The audit is exactly one row and never
// leaks the Google subject or operator access token.
//
// Evidence combined with A08/A09 proves the user can still log in through
// the remaining methods. A07 (Passkey ceremony) remains RED / Batch DB
// hard gate and is not claimed here.
//
// The fixture runs through the real model.InitDB / model.InitLogDB chain
// (p10SetupDatabase), on both SQLite and PostgreSQL.

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// TestAdminClearFiveCredentialCompositeContract covers the full A11
// contract on both SQLite and PostgreSQL fixtures.
func TestAdminClearFiveCredentialCompositeContract(t *testing.T) {
	require.NoError(t, i18n.Init())
	p10RunAcrossDatabases(t, "five-cred", a11FiveCredBody)
}

func a11FiveCredBody(t *testing.T, dbType common.DatabaseType) {
	p10SetupDatabase(t, dbType,
		&model.User{}, &model.ExternalIdentityClaim{}, &model.PasskeyCredential{},
		&model.CustomOAuthProvider{}, &model.UserOAuthBinding{},
		&model.Log{}, &model.UserSession{}, &model.TwoFA{},
		&model.TwoFABackupCode{}, &model.AuthFlow{},
	)

	prevCryptoSecret := common.CryptoSecret
	prevPasswordLogin := common.PasswordLoginEnabled
	passkeySettings := system_setting.GetPasskeySettings()
	prevPasskeyEnabled := passkeySettings.Enabled

	common.CryptoSecret = "a11-five-cred-secret"
	common.PasswordLoginEnabled = true
	passkeySettings.Enabled = true

	t.Cleanup(func() {
		common.CryptoSecret = prevCryptoSecret
		common.PasswordLoginEnabled = prevPasswordLogin
		passkeySettings.Enabled = prevPasskeyEnabled
	})

	const (
		passwordPlain = "a11-strong-password-9f3b"
		googleSub     = "a11-google-sub-001"
		oidcSubject   = "a11-oidc-sub-001"
		customSubject = "a11-custom-sub-001"
		customSlug    = "a11-custom-sso"
	)

	// Built-in OIDC: enable with a loopback mock URL so IsEnabled returns
	// true. The OIDC re-login path is exercised by A08.
	settings := system_setting.GetOIDCSettings()
	prevOIDCEnabled := settings.Enabled
	prevOIDCClientID := settings.ClientId
	prevOIDCClientSecret := settings.ClientSecret
	prevOIDCTokenEndpoint := settings.TokenEndpoint
	prevOIDCUserInfoEndpoint := settings.UserInfoEndpoint
	settings.Enabled = true
	settings.ClientId = "a11-oidc-client"
	settings.ClientSecret = "a11-oidc-secret"
	settings.TokenEndpoint = "http://127.0.0.1:0/token"
	settings.UserInfoEndpoint = "http://127.0.0.1:0/userinfo"
	t.Cleanup(func() {
		settings.Enabled = prevOIDCEnabled
		settings.ClientId = prevOIDCClientID
		settings.ClientSecret = prevOIDCClientSecret
		settings.TokenEndpoint = prevOIDCTokenEndpoint
		settings.UserInfoEndpoint = prevOIDCUserInfoEndpoint
	})

	// Custom OAuth: DB-enabled, runtime-registered provider (slug-guarded).
	mockURL := "http://127.0.0.1:0"
	provider := &model.CustomOAuthProvider{
		Name:                  "A11 Custom SSO",
		Slug:                  customSlug,
		Enabled:               true,
		ClientId:              "a11-custom-client",
		ClientSecret:          "a11-custom-secret",
		AuthorizationEndpoint: mockURL + "/authorize",
		TokenEndpoint:         mockURL + "/token",
		UserInfoEndpoint:      mockURL + "/userinfo",
		UserIdField:           "id",
		UsernameField:         "username",
		DisplayNameField:      "display_name",
		EmailField:            "email",
		AuthStyle:             oauth.AuthStyleInParams,
	}
	require.NoError(t, model.CreateCustomOAuthProvider(provider))
	registerOwnCustomSlug(t, provider)

	// Admin and target users.
	adminToken := common.GetRandomString(32)
	admin := &model.User{
		Id:          51001,
		Username:    "a11-admin",
		Password:    "ignored",
		Role:        common.RoleAdminUser,
		Status:      common.UserStatusEnabled,
		Group:       "default",
		AffCode:     "a11-admin-aff",
		AuthVersion: 1,
		AccessToken: &adminToken,
	}
	require.NoError(t, model.DB.Create(admin).Error)

	passwordHash, err := common.Password2Hash(passwordPlain)
	require.NoError(t, err)
	targetToken := common.GetRandomString(32)
	target := &model.User{
		Id:          51002,
		Username:    "a11-target",
		Password:    passwordHash,
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		Group:       "default",
		AffCode:     "a11-target-aff",
		AuthVersion: 1,
		OidcId:      oidcSubject,
		AccessToken: &targetToken,
	}
	require.NoError(t, model.DB.Create(target).Error)

	// Google claim + mirror via the production durable bind path.
	require.NoError(t, model.DB.Transaction(func(tx *gorm.DB) error {
		return model.BindGoogleIdentityWithTx(tx, googleSub, target.Id)
	}))
	require.NoError(t, model.DB.Model(&model.User{}).
		Where("id = ?", target.Id).
		Update("google_sub", googleSub).Error)

	// Valid parseable COSE public key (shared fixture) for the Passkey
	// credential, with an explicit ParsePublicKey success precondition.
	coseB64 := validCOSEPublicKeyBase64(t)
	passkey := model.PasskeyCredential{
		UserID:       target.Id,
		CredentialID: base64.StdEncoding.EncodeToString([]byte("a11-passkey-credential-id")),
		PublicKey:    coseB64,
	}
	require.NoError(t, model.DB.Create(&passkey).Error)

	// Custom OAuth binding row.
	require.NoError(t, model.DB.Transaction(func(tx *gorm.DB) error {
		return model.CreateUserOAuthBindingWithTx(tx, &model.UserOAuthBinding{
			UserId:         target.Id,
			ProviderId:     provider.Id,
			ProviderUserId: customSubject,
		})
	}))

	// 1. Snapshot every credential before the admin clear.
	var preUser model.User
	require.NoError(t, model.DB.First(&preUser, target.Id).Error)
	prePasswordHash := preUser.Password
	preOidcId := preUser.OidcId

	var prePasskey model.PasskeyCredential
	require.NoError(t, model.DB.Where("user_id = ?", target.Id).First(&prePasskey).Error)
	prePasskeyPublicKey := prePasskey.PublicKey
	prePasskeyCredID := prePasskey.CredentialID

	var preBinding model.UserOAuthBinding
	require.NoError(t, model.DB.Where("user_id = ? AND provider_id = ?",
		target.Id, provider.Id).First(&preBinding).Error)
	preBindingProviderUserID := preBinding.ProviderUserId

	var preClaims []model.ExternalIdentityClaim
	require.NoError(t, model.DB.Where("user_id = ? AND provider = ?",
		target.Id, model.ExternalIdentityProviderGoogle).Find(&preClaims).Error)
	require.Len(t, preClaims, 1, "target must have exactly one Google claim row")

	// 2. Drive the real AdminClearUserBinding handler through AdminAuth.
	router := gin.New()
	router.DELETE("/api/user/:id/bindings/:binding_type", middleware.AdminAuth(), AdminClearUserBinding)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete,
		fmt.Sprintf("/api/user/%d/bindings/google", target.Id), nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, "admin clear must return 2xx, body=%s", rec.Body.String())
	assert.Equal(t, true, decodeEnvelope(t, rec)["success"], "admin clear must succeed")

	// 3. Claim + mirror are cleared.
	postClaims := findGoogleClaims(t, model.DB)
	assert.Empty(t, postClaims, "the Google claim row must be deleted by admin clear")
	var postUser model.User
	require.NoError(t, model.DB.First(&postUser, target.Id).Error)
	assert.Empty(t, postUser.GoogleSub, "the Google mirror must be cleared by admin clear")

	// 4. Password hash is byte-for-byte unchanged.
	assert.Equal(t, prePasswordHash, postUser.Password,
		"the password hash must be untouched by admin clear of Google")

	// 5. Passkey credential is byte-for-byte unchanged.
	var postPasskey model.PasskeyCredential
	require.NoError(t, model.DB.Where("user_id = ?", target.Id).First(&postPasskey).Error)
	assert.Equal(t, prePasskeyPublicKey, postPasskey.PublicKey,
		"the Passkey public key must be untouched")
	assert.Equal(t, prePasskeyCredID, postPasskey.CredentialID,
		"the Passkey credential id must be untouched")

	// 6. OIDC binding is unchanged.
	assert.Equal(t, preOidcId, postUser.OidcId,
		"the OIDC id must be untouched by admin clear of Google")

	// 7. Custom OAuth binding row is unchanged.
	var postBinding model.UserOAuthBinding
	require.NoError(t, model.DB.Where("user_id = ? AND provider_id = ?",
		target.Id, provider.Id).First(&postBinding).Error)
	assert.Equal(t, preBindingProviderUserID, postBinding.ProviderUserId,
		"the custom OAuth binding row must be untouched")

	// 8. Audit is exactly one row with the right operator and no sensitive
	//    values.
	var auditLogs []model.Log
	require.NoError(t, model.DB.Where("type = ?", model.LogTypeManage).Find(&auditLogs).Error)
	var bindingClearLogs []model.Log
	for _, l := range auditLogs {
		if strings.Contains(l.Other, "user.binding_clear") {
			bindingClearLogs = append(bindingClearLogs, l)
		}
	}
	require.Len(t, bindingClearLogs, 1,
		"admin clear must produce exactly one user.binding_clear audit row")
	audit := bindingClearLogs[0]
	assert.Equal(t, admin.Id, audit.UserId, "the audit must be attributed to the admin")
	assert.NotContains(t, audit.Other, googleSub,
		"the audit other field must not contain the Google subject")
	assert.NotContains(t, audit.Content, googleSub,
		"the audit content field must not contain the Google subject")
	assert.NotContains(t, audit.Other, adminToken,
		"the audit other field must not contain the admin access token")
	assert.NotContains(t, audit.Other, targetToken,
		"the audit other field must not contain the target access token")

	// 9. Password re-login still works through the real Login handler.
	loginRouter := gin.New()
	loginRouter.POST("/api/user/login", Login)
	loginReq := httptest.NewRequest(http.MethodPost, "/api/user/login",
		strings.NewReader(fmt.Sprintf(`{"username":%q,"password":%q}`, target.Username, passwordPlain)))
	loginReq.Header.Set("Content-Type", "application/json")
	loginRec := httptest.NewRecorder()
	loginRouter.ServeHTTP(loginRec, loginReq)
	require.Equal(t, http.StatusOK, loginRec.Code,
		"retained password must still complete a real login, body=%s", loginRec.Body.String())
	assert.Equal(t, true, decodeEnvelope(t, loginRec)["success"],
		"password re-login must succeed after admin clear of Google")
}
