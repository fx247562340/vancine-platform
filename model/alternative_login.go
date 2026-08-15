package model

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"github.com/go-webauthn/webauthn/protocol/webauthncose"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ErrNoAlternativeLoginMethod is returned when a Google self-unbind would
// leave the user without any independently usable login method.
var ErrNoAlternativeLoginMethod = errors.New("no alternative login method remains")

// ErrGoogleIdentityNotBound is returned when a Google unbind is requested for
// a user that holds no durable Google claim.
var ErrGoogleIdentityNotBound = errors.New("google identity is not bound")

// AlternativeLoginPolicy carries the live capability state the model layer
// cannot derive itself: the password-login switch, the passkey feature
// switch, the enablement of the registered built-in OAuth providers
// (google excluded), and the stable database ids of the custom OAuth
// providers that are currently registered in the runtime OAuth registry AND
// enabled there. It is built by the controller/service layer because model
// must never import oauth. For custom providers the model intersects this
// runtime snapshot with the persisted provider.Enabled, a complete valid
// configuration and a valid binding inside the unbind transaction; a
// provider missing or disabled on either side never counts.
type AlternativeLoginPolicy struct {
	PasswordLoginEnabled    bool
	PasskeyFeatureEnabled   bool
	EnabledBuiltInProviders map[string]bool
	// RegisteredEnabledCustomProviderIds holds the stable database ids of the
	// custom OAuth providers that are currently registered in the runtime
	// OAuth registry AND enabled there. The model intersects this runtime set
	// with the persisted provider.Enabled, a complete valid configuration and
	// a valid binding inside the transaction; a provider missing or disabled
	// on either side never counts.
	RegisteredEnabledCustomProviderIds map[int]bool
}

// builtInOAuthBindingValue returns the users compatibility column value for a
// registered built-in OAuth provider. Google is never consulted here: it is
// the identity being released and cannot count as its own alternative.
func builtInOAuthBindingValue(user *User, providerName string) string {
	switch providerName {
	case "github":
		return user.GitHubId
	case "discord":
		return user.DiscordId
	case "oidc":
		return user.OidcId
	case "linuxdo":
		return user.LinuxDOId
	default:
		return ""
	}
}

// hasUsablePasswordHash reports whether the stored value is a password hash
// the project can actually verify. Arbitrary non-empty strings do not
// qualify.
func hasUsablePasswordHash(stored string) bool {
	if strings.TrimSpace(stored) == "" {
		return false
	}
	_, err := bcrypt.Cost([]byte(stored))
	return err == nil
}

// hasValidPasskeyWithTx reports whether the user holds a live passkey
// credential that could actually verify a login: not soft-deleted, with a
// CredentialID and a PublicKey that decode in the persisted base64 format and
// whose PublicKey parses as a real WebAuthn COSE key. Soft-deleted, blank,
// corrupted or COSE-invalid credentials never count. The row is read under
// the caller's transaction lock so the decision corresponds to one
// serializable state.
func hasValidPasskeyWithTx(tx *gorm.DB, userId int) (bool, error) {
	var credential PasskeyCredential
	if err := lockForUpdate(tx).Where("user_id = ?", userId).First(&credential).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	credentialID, err := base64.StdEncoding.DecodeString(credential.CredentialID)
	if err != nil || len(credentialID) == 0 {
		return false, nil
	}
	publicKeyBytes, err := base64.StdEncoding.DecodeString(credential.PublicKey)
	if err != nil || len(publicKeyBytes) == 0 {
		return false, nil
	}
	if _, err := webauthncose.ParsePublicKey(publicKeyBytes); err != nil {
		return false, nil
	}
	return true, nil
}

// hasEnabledCustomOAuthBindingWithTx reports whether the user holds a
// binding to a custom OAuth provider that is independently usable on BOTH
// sides: registered and enabled in the runtime OAuth registry (the policy
// snapshot built by the controller), and persisted in the database as
// enabled with a complete valid configuration. Deleted or disabled
// providers, providers missing from either side, missing bindings and blank
// provider user ids never count. Bindings and provider rows are read under
// the caller's transaction lock so a concurrent binding deletion or provider
// disable cannot change the decision mid-flight.
func hasEnabledCustomOAuthBindingWithTx(tx *gorm.DB, userId int, policy AlternativeLoginPolicy) (bool, error) {
	var bindings []UserOAuthBinding
	if err := lockForUpdate(tx).Where("user_id = ?", userId).Find(&bindings).Error; err != nil {
		return false, err
	}
	for _, binding := range bindings {
		if strings.TrimSpace(binding.ProviderUserId) == "" {
			continue
		}
		if !policy.RegisteredEnabledCustomProviderIds[binding.ProviderId] {
			continue
		}
		var provider CustomOAuthProvider
		err := lockForUpdate(tx).Where("id = ? AND enabled = ?", binding.ProviderId, true).First(&provider).Error
		if err == nil {
			if validateCustomOAuthProvider(&provider) != nil {
				continue
			}
			return true, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return false, err
		}
	}
	return false, nil
}

// hasAlternativeLoginWithTx decides, from data read inside the caller's
// transaction, whether at least one independently usable login method
// remains: a verifiable password while password login is enabled, a live
// COSE-valid passkey while the feature is enabled, an enabled built-in OAuth
// provider with a non-blank binding, or an enabled custom provider with a
// valid binding. Email, sessions, API/access tokens, 2FA artifacts and the
// Google identity itself never count. Every qualifying record is read under
// the transaction lock held on the user row (always the first lock), so the
// decision corresponds to one serializable state and shares the user-first
// lock order with every competing writer.
func hasAlternativeLoginWithTx(tx *gorm.DB, user *User, policy AlternativeLoginPolicy) (bool, error) {
	if policy.PasswordLoginEnabled && hasUsablePasswordHash(user.Password) {
		return true, nil
	}
	if policy.PasskeyFeatureEnabled {
		hasPasskey, err := hasValidPasskeyWithTx(tx, user.Id)
		if err != nil {
			return false, err
		}
		if hasPasskey {
			return true, nil
		}
	}
	for providerName, enabled := range policy.EnabledBuiltInProviders {
		if enabled && strings.TrimSpace(builtInOAuthBindingValue(user, providerName)) != "" {
			return true, nil
		}
	}
	return hasEnabledCustomOAuthBindingWithTx(tx, user.Id, policy)
}

// releaseGoogleIdentityWithTx deletes the user's Google claim and clears the
// users.google_sub compatibility mirror as one transactional unit, then
// proves the persisted end state inside the same transaction: no Google claim
// may remain and the mirror must actually be empty. The read-backs catch
// silent zero-hit writes (an error-free DELETE/UPDATE that touched no row) so
// a failure rolls everything back instead of committing a claim-only or
// mirror-only half-state.
//
// The user row is locked and verified first: this primitive is shared by the
// self-service and administrator paths, and the user-first lock is the same
// ordering every competing writer (bind, self-unbind, passkey deletion)
// uses, so a racing bind or unbind serializes on this row instead of
// interleaving into a half-state. external_identity_claims stays the only
// ownership source.
func releaseGoogleIdentityWithTx(tx *gorm.DB, userId int) error {
	var target User
	if err := lockForUpdate(tx).Where("id = ?", userId).First(&target).Error; err != nil {
		return err
	}
	if err := ReleaseExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, userId); err != nil {
		return err
	}
	if err := tx.Model(&User{}).Where("id = ?", userId).Update("google_sub", "").Error; err != nil {
		return err
	}
	var remaining int64
	if err := tx.Model(&ExternalIdentityClaim{}).
		Where("provider = ? AND user_id = ?", ExternalIdentityProviderGoogle, userId).
		Count(&remaining).Error; err != nil {
		return err
	}
	if remaining != 0 {
		return fmt.Errorf("release Google identity for user %d: claim still present after delete", userId)
	}
	var persisted User
	if err := tx.Where("id = ?", userId).First(&persisted).Error; err != nil {
		return err
	}
	if persisted.GoogleSub != "" {
		return fmt.Errorf("release Google identity for user %d: google_sub mirror was not cleared", userId)
	}
	return nil
}

// ReleaseGoogleIdentitySelf releases the calling user's own Google identity
// (durable claim and google_sub compatibility mirror) only when at least one
// independently usable alternative login method remains. The locked user row,
// the binding confirmation through the durable claim, the alternative-method
// decision and the release all run inside one transaction; a refusal changes
// nothing.
//
// Once the transaction has committed the function has nothing left to do:
// UserBase carries no OAuth binding fields, so no cache refresh is required
// and nothing after the commit can fail. The administrator recovery path
// (User.ClearBinding) deliberately does not call this function: it releases
// without the lockout guard.
func ReleaseGoogleIdentitySelf(userId int, policy AlternativeLoginPolicy) error {
	if userId == 0 {
		return errors.New("google self-unbind user id is empty")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Where("id = ?", userId).First(&user).Error; err != nil {
			return err
		}
		var claim ExternalIdentityClaim
		err := tx.Where("provider = ? AND user_id = ?", ExternalIdentityProviderGoogle, userId).First(&claim).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrGoogleIdentityNotBound
		}
		if err != nil {
			return err
		}
		hasAlternative, err := hasAlternativeLoginWithTx(tx, &user, policy)
		if err != nil {
			return err
		}
		if !hasAlternative {
			return ErrNoAlternativeLoginMethod
		}
		return releaseGoogleIdentityWithTx(tx, userId)
	})
}
