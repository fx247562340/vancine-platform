package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/QuantumNous/new-api/service/acquisition"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const oauthAuthFlowTTL = 10 * time.Minute

type oauthStateRequest struct {
	Provider string `json:"provider"`
	Intent   string `json:"intent"`
	Aff      string `json:"aff,omitempty"`
}

type oauthFlowPayload struct {
	AffiliateCode string `json:"affiliate_code,omitempty"`
}

// providerParams returns map with Provider key for i18n templates
func providerParams(name string) map[string]any {
	return map[string]any{"Provider": name}
}

// GenerateOAuthCode generates a state code for OAuth CSRF protection
func GenerateOAuthCode(c *gin.Context) {
	var request oauthStateRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	request.Provider = strings.TrimSpace(request.Provider)
	request.Intent = strings.TrimSpace(request.Intent)
	request.Aff = strings.TrimSpace(request.Aff)
	if oauth.GetProvider(request.Provider) == nil ||
		(request.Intent != model.AuthFlowIntentLogin && request.Intent != model.AuthFlowIntentBind) ||
		len(request.Aff) > 32 ||
		(request.Intent == model.AuthFlowIntentBind && request.Aff != "") {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	// Validate the provider is currently usable (DB row + runtime in sync)
	// so custom providers disabled mid-flight do not generate a state token.
	if _, ok := resolveValidOAuthProvider(c, request.Provider); !ok {
		return
	}
	userID := 0
	sessionID := ""
	if request.Intent == model.AuthFlowIntentBind {
		identity, ok := middleware.GetSessionAuthIdentity(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "绑定操作需要登录"})
			return
		}
		userID = identity.UserID
		sessionID = identity.SessionID
	}
	payload, err := common.Marshal(oauthFlowPayload{AffiliateCode: request.Aff})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	expiresAt := time.Now().Add(oauthAuthFlowTTL)
	state, _, err := model.CreateAuthFlow(model.AuthFlowCreate{
		Purpose:   model.AuthFlowPurposeOAuth,
		Provider:  request.Provider,
		Intent:    request.Intent,
		UserId:    userID,
		SessionId: sessionID,
		Payload:   string(payload),
		ExpiresAt: expiresAt,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"flow_token": state,
			"expires_at": expiresAt.Unix(),
		},
	})
}

// resolveValidOAuthProvider resolves the OAuth provider by name and validates
// it is currently usable, re-reading the persisted CustomOAuthProvider row
// for custom providers so a split state (runtime enabled, DB disabled,
// runtime/persisted ID mismatch, persisted row missing) is rejected before
// the caller proceeds. The returned bool is false and the response is
// already written when the caller should stop.
//
// Classification is based on both the runtime type and the registry custom
// marker. Inconsistency (isGeneric != isCustom) always fails closed.
func resolveValidOAuthProvider(c *gin.Context, providerName string) (oauth.Provider, bool) {
	provider := oauth.GetProvider(providerName)
	if provider == nil || !provider.IsEnabled() {
		common.ApiErrorI18n(c, i18n.MsgOAuthNotEnabled, providerParams(providerName))
		return nil, false
	}
	generic, isGeneric := provider.(*oauth.GenericOAuthProvider)
	isCustom := oauth.IsCustomProvider(providerName)

	switch {
	case isGeneric && isCustom:
		// Custom provider: persisted DB row must exist, be enabled, and
		// match the runtime registry by ID and slug.
		persisted, err := model.GetCustomOAuthProviderBySlug(providerName)
		if err != nil || persisted == nil {
			common.ApiErrorI18n(c, i18n.MsgOAuthNotEnabled, providerParams(providerName))
			return nil, false
		}
		if !persisted.Enabled || persisted.Id != generic.GetProviderId() || persisted.Slug != providerName {
			common.ApiErrorI18n(c, i18n.MsgOAuthNotEnabled, providerParams(providerName))
			return nil, false
		}
		return provider, true
	case !isGeneric && !isCustom:
		// Built-in provider: runtime registry is the source of truth.
		return provider, true
	default:
		// Inconsistent: registry says custom but runtime is not Generic,
		// or vice versa. Fail-closed.
		common.ApiErrorI18n(c, i18n.MsgOAuthNotEnabled, providerParams(providerName))
		return nil, false
	}
}

// HandleOAuth handles OAuth callback for all standard OAuth providers
func HandleOAuth(c *gin.Context) {
	providerName := c.Param("provider")
	// 1. Basic existence check.
	provider := oauth.GetProvider(providerName)
	if provider == nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": i18n.T(c, i18n.MsgOAuthUnknownProvider),
		})
		return
	}

	// 2. Validate state (CSRF protection).
	state := c.Query("state")
	pendingFlow, err := model.GetAuthFlow(state, model.AuthFlowMatch{
		Purpose:  model.AuthFlowPurposeOAuth,
		Provider: providerName,
	})
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": i18n.T(c, i18n.MsgOAuthStateInvalid),
		})
		return
	}

	consumeMatch := model.AuthFlowMatch{
		Purpose:  model.AuthFlowPurposeOAuth,
		Provider: providerName,
		Intent:   pendingFlow.Intent,
	}
	// Bind flows are bound to the live dashboard Session that created them.
	if pendingFlow.Intent == model.AuthFlowIntentBind {
		identity, ok := middleware.GetSessionAuthIdentity(c)
		if !ok || identity.UserID != pendingFlow.UserId || identity.SessionID != pendingFlow.SessionId {
			c.JSON(http.StatusForbidden, gin.H{
				"success": false,
				"message": i18n.T(c, i18n.MsgOAuthStateInvalid),
			})
			return
		}
		consumeMatch.UserId = identity.UserID
		consumeMatch.SessionId = identity.SessionID
	} else if pendingFlow.Intent != model.AuthFlowIntentLogin {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}

	// 3. Pre-wire validate: provider must be usable before any external
	// call. Uses the returned provider for all subsequent logic so a stale
	// registry pointer is never used.
	provider, ok := resolveValidOAuthProvider(c, providerName)
	if !ok {
		return
	}

	// 4. Handle error from provider.
	errorCode := c.Query("error")
	if errorCode != "" {
		if _, err := model.ConsumeAuthFlow(state, consumeMatch); err != nil {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "message": i18n.T(c, i18n.MsgOAuthStateInvalid)})
			return
		}
		errorDescription := c.Query("error_description")
		if errorDescription == "" {
			errorDescription = errorCode
		}
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": errorDescription,
		})
		return
	}
	if pendingFlow.Intent == model.AuthFlowIntentBind {
		handleOAuthBind(c, provider, pendingFlow, state)
		return
	}

	// 5. Exchange code for token.
	code := c.Query("code")
	token, err := provider.ExchangeToken(c.Request.Context(), code, c)
	if err != nil {
		handleOAuthError(c, err)
		return
	}

	// 6. Get user info.
	oauthUser, err := provider.GetUserInfo(c.Request.Context(), token)
	if err != nil {
		handleOAuthError(c, err)
		return
	}

	// 7. Post-wire validate: re-check the provider is still usable after
	// the external HTTP calls but BEFORE consuming the flow, creating a
	// user, binding, or session. Uses the returned provider for all
	// subsequent logic.
	provider, ok = resolveValidOAuthProvider(c, providerName)
	if !ok {
		return
	}

	// 8. Consume flow, parse payload, find/create user, status check.
	flow, err := model.ConsumeAuthFlow(state, consumeMatch)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": i18n.T(c, i18n.MsgOAuthStateInvalid)})
		return
	}

	var payload oauthFlowPayload
	if err := common.UnmarshalJsonStr(flow.Payload, &payload); err != nil {
		common.ApiError(c, err)
		return
	}
	var user *model.User
	if googleProvider, isGoogle := provider.(*oauth.GoogleProvider); isGoogle {
		user, err = findOrCreateGoogleUser(c, googleProvider, oauthUser, payload.AffiliateCode)
	} else {
		user, err = findOrCreateOAuthUser(c, provider, oauthUser, payload.AffiliateCode)
	}
	if err != nil {
		if errors.Is(err, model.ErrEmailAlreadyTaken) {
			common.ApiErrorI18n(c, i18n.MsgUserEmailAlreadyTaken)
			return
		}
		switch err.(type) {
		case *OAuthUserDeletedError:
			common.ApiErrorI18n(c, i18n.MsgOAuthUserDeleted)
		case *OAuthRegistrationDisabledError:
			common.ApiErrorI18n(c, i18n.MsgUserRegisterDisabled)
		case *OAuthEmailAlreadyTakenError:
			common.ApiErrorI18n(c, i18n.MsgUserEmailAlreadyTaken)
		default:
			common.ApiError(c, err)
		}
		return
	}

	if user.Status != common.UserStatusEnabled {
		common.ApiErrorI18n(c, i18n.MsgOAuthUserBanned)
		return
	}

	// 9. Setup login.
	setupLogin(user, c)
}

// handleOAuthBind handles binding OAuth account to existing user
func handleOAuthBind(c *gin.Context, provider oauth.Provider, pendingFlow *model.AuthFlow, flowToken string) {
	// Exchange code for token
	code := c.Query("code")
	token, err := provider.ExchangeToken(c.Request.Context(), code, c)
	if err != nil {
		handleOAuthError(c, err)
		return
	}

	// Get user info
	oauthUser, err := provider.GetUserInfo(c.Request.Context(), token)
	if err != nil {
		handleOAuthError(c, err)
		return
	}

	// Post-wire validate: re-check the provider is still usable after the
	// external HTTP calls but BEFORE IsUserIDTaken, ConsumeAuthFlow, or
	// any binding/claim/mirror write. Uses the returned provider for all
	// subsequent logic so a stale registry pointer is never used.
	provider, ok := resolveValidOAuthProvider(c, c.Param("provider"))
	if !ok {
		return
	}

	// Check if this OAuth account is already bound (check both new ID and
	// legacy ID). Google is skipped here: its ownership lives in
	// external_identity_claims and is enforced atomically inside the bind
	// transaction below, never by a check-then-write on the mirror column.
	if _, isGoogle := provider.(*oauth.GoogleProvider); !isGoogle {
		if provider.IsUserIDTaken(oauthUser.ProviderUserID) {
			common.ApiErrorI18n(c, i18n.MsgOAuthAlreadyBound, providerParams(provider.GetName()))
			return
		}
		// Also check legacy ID to prevent duplicate bindings during migration period
		if legacyID, ok := oauthUser.Extra["legacy_id"].(string); ok && legacyID != "" {
			if provider.IsUserIDTaken(legacyID) {
				common.ApiErrorI18n(c, i18n.MsgOAuthAlreadyBound, providerParams(provider.GetName()))
				return
			}
		}
	}

	if _, err := model.ConsumeAuthFlow(flowToken, model.AuthFlowMatch{
		Purpose:   model.AuthFlowPurposeOAuth,
		Provider:  pendingFlow.Provider,
		Intent:    model.AuthFlowIntentBind,
		UserId:    pendingFlow.UserId,
		SessionId: pendingFlow.SessionId,
	}); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": i18n.T(c, i18n.MsgOAuthStateInvalid)})
		return
	}

	user := model.User{Id: pendingFlow.UserId}
	err = user.FillUserById()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	// Handle binding based on provider type
	if genericProvider, ok := provider.(*oauth.GenericOAuthProvider); ok {
		// Custom provider: use user_oauth_bindings table
		err = model.UpdateUserOAuthBinding(user.Id, genericProvider.GetProviderId(), oauthUser.ProviderUserID)
		if err != nil {
			common.ApiError(c, err)
			return
		}
	} else if _, isGoogle := provider.(*oauth.GoogleProvider); isGoogle {
		// Google: the durable claim is the single ownership source. Claim and
		// google_sub mirror commit as one unit; the claim's unique indexes
		// reject a subject owned by another user and any rebind by an
		// already-bound user, including concurrent attempts.
		err = model.DB.Transaction(func(tx *gorm.DB) error {
			return model.BindGoogleIdentityWithTx(tx, strings.TrimSpace(oauthUser.ProviderUserID), user.Id)
		})
		if err != nil {
			if errors.Is(err, model.ErrExternalIdentityAlreadyClaimed) {
				common.ApiErrorI18n(c, i18n.MsgOAuthAlreadyBound, providerParams(provider.GetName()))
				return
			}
			common.ApiError(c, err)
			return
		}
	} else {
		// Built-in provider: update user record directly
		provider.SetProviderUserID(&user, oauthUser.ProviderUserID)
		err = user.Update(false)
		if err != nil {
			common.ApiError(c, err)
			return
		}
	}

	common.ApiSuccessI18n(c, i18n.MsgOAuthBindSuccess, gin.H{
		"action": "bind",
	})
}

// findOrCreateOAuthUser finds existing user or creates new user
func findOrCreateOAuthUser(c *gin.Context, provider oauth.Provider, oauthUser *oauth.OAuthUser, affiliateCode string) (*model.User, error) {
	user := &model.User{}

	// Check if user already exists with new ID
	if provider.IsUserIDTaken(oauthUser.ProviderUserID) {
		err := provider.FillUserByProviderID(user, oauthUser.ProviderUserID)
		if err != nil {
			return nil, err
		}
		// Check if user has been deleted
		if user.Id == 0 {
			return nil, &OAuthUserDeletedError{}
		}
		return user, nil
	}

	// Try to find user with legacy ID (for GitHub migration from login to numeric ID)
	if legacyID, ok := oauthUser.Extra["legacy_id"].(string); ok && legacyID != "" {
		if provider.IsUserIDTaken(legacyID) {
			err := provider.FillUserByProviderID(user, legacyID)
			if err != nil {
				return nil, err
			}
			if user.Id != 0 {
				// Found user with legacy ID, migrate to new ID
				common.SysLog(fmt.Sprintf("[OAuth] Migrating user %d from legacy_id=%s to new_id=%s",
					user.Id, legacyID, oauthUser.ProviderUserID))
				if err := user.UpdateGitHubId(oauthUser.ProviderUserID); err != nil {
					common.SysError(fmt.Sprintf("[OAuth] Failed to migrate user %d: %s", user.Id, err.Error()))
					// Continue with login even if migration fails
				}
				return user, nil
			}
		}
	}

	// User doesn't exist, create new user if registration is enabled
	if !common.RegisterEnabled {
		return nil, &OAuthRegistrationDisabledError{}
	}

	// Set up new user
	user.Username = provider.GetProviderPrefix() + strconv.Itoa(model.GetMaxUserId()+1)

	if oauthUser.Username != "" {
		if exists, err := model.CheckUserExistOrDeleted(oauthUser.Username, ""); err == nil && !exists {
			// 防止索引退化
			if len(oauthUser.Username) <= model.UserNameMaxLength {
				user.Username = oauthUser.Username
			}
		}
	}

	if oauthUser.DisplayName != "" {
		user.DisplayName = oauthUser.DisplayName
	} else if oauthUser.Username != "" {
		user.DisplayName = oauthUser.Username
	} else {
		user.DisplayName = provider.GetName() + " User"
	}
	if oauthUser.Email != "" {
		user.Email = model.NormalizeEmail(oauthUser.Email)
		if err := model.EnsureEmailAvailable(user.Email, 0); err != nil {
			if errors.Is(err, model.ErrEmailAlreadyTaken) {
				return nil, &OAuthEmailAlreadyTakenError{}
			}
			return nil, err
		}
	}
	user.Role = common.RoleCommonUser
	user.Status = common.UserStatusEnabled

	// Handle affiliate code
	inviterId := 0
	if affiliateCode != "" {
		inviterId, _ = model.GetUserIdByAffCode(affiliateCode)
	}

	// Use transaction to ensure user creation and OAuth binding are atomic
	if genericProvider, ok := provider.(*oauth.GenericOAuthProvider); ok {
		// Custom provider: create user and binding in a transaction
		err := model.DB.Transaction(func(tx *gorm.DB) error {
			// Create user
			if err := user.InsertWithTx(tx, inviterId); err != nil {
				return err
			}

			// Create OAuth binding
			binding := &model.UserOAuthBinding{
				UserId:         user.Id,
				ProviderId:     genericProvider.GetProviderId(),
				ProviderUserId: oauthUser.ProviderUserID,
			}
			if err := model.CreateUserOAuthBindingWithTx(tx, binding); err != nil {
				return err
			}

			return nil
		})
		if err != nil {
			return nil, err
		}

		// Perform post-transaction tasks (logs, sidebar config, inviter rewards)
		user.FinalizeOAuthUserCreation(inviterId)
	} else {
		// Built-in provider: create user and update provider ID in a transaction
		err := model.DB.Transaction(func(tx *gorm.DB) error {
			// Create user
			if err := user.InsertWithTx(tx, inviterId); err != nil {
				return err
			}

			// Set the provider user ID on the user model and update
			provider.SetProviderUserID(user, oauthUser.ProviderUserID)
			if err := tx.Model(user).Updates(map[string]interface{}{
				"github_id":   user.GitHubId,
				"discord_id":  user.DiscordId,
				"oidc_id":     user.OidcId,
				"linux_do_id": user.LinuxDOId,
				"wechat_id":   user.WeChatId,
				"telegram_id": user.TelegramId,
				"google_sub":  user.GoogleSub,
			}).Error; err != nil {
				return err
			}

			return nil
		})
		if err != nil {
			return nil, err
		}

		// Perform post-transaction tasks
		user.FinalizeOAuthUserCreation(inviterId)
	}

	// First-touch acquisition attribution: only brand-new users reach this
	// point. Existing-user logins, legacy-ID migration logins, and account
	// binds (handleOAuthBind) all returned earlier and never bind.
	acquisition.BindTouchToUser(c, user.Id)

	return user, nil
}

// findOrCreateGoogleUser resolves a Google callback identity through
// external_identity_claims, the single ownership source for Google logins,
// registrations and binds. users.google_sub is only written as a
// compatibility mirror inside the same transaction as the claim and is never
// consulted for ownership, so forged or duplicate mirror rows cannot hijack a
// login.
func findOrCreateGoogleUser(c *gin.Context, provider *oauth.GoogleProvider, oauthUser *oauth.OAuthUser, affiliateCode string) (*model.User, error) {
	subject := strings.TrimSpace(oauthUser.ProviderUserID)
	if subject == "" {
		return nil, errors.New("google subject is empty")
	}

	owner, err := model.FindExternalIdentityOwner(model.ExternalIdentityProviderGoogle, subject)
	if err == nil {
		if owner.DeletedAt.Valid {
			return nil, &OAuthUserDeletedError{}
		}
		return owner, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	if !common.RegisterEnabled {
		return nil, &OAuthRegistrationDisabledError{}
	}

	user := &model.User{}
	user.Username = provider.GetProviderPrefix() + strconv.Itoa(model.GetMaxUserId()+1)
	if oauthUser.DisplayName != "" {
		user.DisplayName = oauthUser.DisplayName
	} else {
		user.DisplayName = provider.GetName() + " User"
	}
	if oauthUser.Email != "" {
		user.Email = model.NormalizeEmail(oauthUser.Email)
		if err := model.EnsureEmailAvailable(user.Email, 0); err != nil {
			if errors.Is(err, model.ErrEmailAlreadyTaken) {
				return nil, &OAuthEmailAlreadyTakenError{}
			}
			return nil, err
		}
	}
	user.Role = common.RoleCommonUser
	user.Status = common.UserStatusEnabled
	user.GoogleSub = subject

	inviterId := 0
	if affiliateCode != "" {
		inviterId, _ = model.GetUserIdByAffCode(affiliateCode)
	}

	// User creation, durable claim and google_sub mirror commit as one unit;
	// any failure rolls all three back together.
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := user.InsertWithTx(tx, inviterId); err != nil {
			return err
		}
		return model.ClaimExternalIdentityWithTx(tx, model.ExternalIdentityProviderGoogle, subject, user.Id)
	}); err != nil {
		// A concurrent callback may have claimed the subject between the owner
		// lookup and this transaction. Re-read the durable owner and log into
		// it instead of turning the unique conflict into a second account.
		if owner, ownerErr := model.FindExternalIdentityOwner(model.ExternalIdentityProviderGoogle, subject); ownerErr == nil {
			if owner.DeletedAt.Valid {
				return nil, &OAuthUserDeletedError{}
			}
			return owner, nil
		}
		return nil, err
	}

	user.FinalizeOAuthUserCreation(inviterId)

	// First-touch acquisition attribution: only brand-new Google users reach
	// this point; owner logins returned above and never bind.
	acquisition.BindTouchToUser(c, user.Id)

	return user, nil
}

// Error types for OAuth
type OAuthUserDeletedError struct{}

func (e *OAuthUserDeletedError) Error() string {
	return "user has been deleted"
}

type OAuthRegistrationDisabledError struct{}

func (e *OAuthRegistrationDisabledError) Error() string {
	return "registration is disabled"
}

type OAuthEmailAlreadyTakenError struct{}

func (e *OAuthEmailAlreadyTakenError) Error() string {
	return "email is already in use"
}

// handleOAuthError handles OAuth errors and returns translated message
func handleOAuthError(c *gin.Context, err error) {
	switch e := err.(type) {
	case *oauth.OAuthError:
		if e.Params != nil {
			common.ApiErrorI18n(c, e.MsgKey, e.Params)
		} else {
			common.ApiErrorI18n(c, e.MsgKey)
		}
	case *oauth.AccessDeniedError:
		common.ApiErrorMsg(c, e.Message)
	case *oauth.TrustLevelError:
		common.ApiErrorI18n(c, i18n.MsgOAuthTrustLevelLow)
	default:
		common.ApiError(c, err)
	}
}
