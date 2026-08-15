package model

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/alicebob/miniredis/v2"
	redis "github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestExternalIdentityClaimEnforcesSingleOwnerAtomically(t *testing.T) {
	truncateTables(t)

	first := User{Username: "telegram-owner-one", Password: "password", AffCode: "telegram-owner-one"}
	second := User{Username: "telegram-owner-two", Password: "password", AffCode: "telegram-owner-two"}
	require.NoError(t, DB.Create(&first).Error)
	require.NoError(t, DB.Create(&second).Error)

	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderTelegram, "telegram-123", first.Id)
	}))
	err := DB.Transaction(func(tx *gorm.DB) error {
		return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderTelegram, "telegram-123", second.Id)
	})
	assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed)

	err = DB.Transaction(func(tx *gorm.DB) error {
		return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderTelegram, "telegram-456", first.Id)
	})
	assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed)

	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, first.Id, claims[0].UserId)
	assert.Equal(t, "telegram-123", claims[0].Subject)

	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ReleaseExternalIdentityWithTx(tx, ExternalIdentityProviderTelegram, first.Id)
	}))
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderTelegram, "telegram-123", second.Id)
	}))
}

func TestClearTelegramBindingReleasesIdentityClaim(t *testing.T) {
	truncateTables(t)

	user := User{Username: "telegram-unbind", Password: "password", TelegramId: "telegram-unbind-id"}
	require.NoError(t, DB.Create(&user).Error)
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderTelegram, user.TelegramId, user.Id)
	}))

	require.NoError(t, user.ClearBinding(ExternalIdentityProviderTelegram))
	assert.Empty(t, user.TelegramId)

	var count int64
	require.NoError(t, DB.Model(&ExternalIdentityClaim{}).Where("user_id = ?", user.Id).Count(&count).Error)
	assert.Zero(t, count)
}

func TestInitializeExternalIdentityClaimsIsIdempotent(t *testing.T) {
	truncateTables(t)

	user := User{Username: "telegram-legacy", Password: "password", TelegramId: "telegram-legacy-id"}
	googleUser := User{Username: "google-legacy", Password: "password", GoogleSub: "google-legacy-sub", AffCode: "google-legacy"}
	require.NoError(t, DB.Create(&user).Error)
	require.NoError(t, DB.Create(&googleUser).Error)
	require.NoError(t, InitializeExternalIdentityClaims())
	require.NoError(t, InitializeExternalIdentityClaims())

	var telegramClaim ExternalIdentityClaim
	require.NoError(t, DB.Where("provider = ? AND subject = ?", ExternalIdentityProviderTelegram, user.TelegramId).
		First(&telegramClaim).Error)
	assert.Equal(t, user.Id, telegramClaim.UserId)

	var googleClaim ExternalIdentityClaim
	require.NoError(t, DB.Where("provider = ? AND subject = ?", ExternalIdentityProviderGoogle, googleUser.GoogleSub).
		First(&googleClaim).Error)
	assert.Equal(t, googleUser.Id, googleClaim.UserId)

	var count int64
	require.NoError(t, DB.Model(&ExternalIdentityClaim{}).Count(&count).Error)
	assert.EqualValues(t, 2, count, "rerunning the backfill must not duplicate claims")
}

func TestInitializeExternalIdentityClaimsBackfillsTelegramAndGoogle(t *testing.T) {
	truncateTables(t)

	telegramUser := User{Username: "backfill-tg", Password: "password", TelegramId: "tg-100", AffCode: "backfill-tg"}
	googleUser := User{Username: "backfill-google", Password: "password", GoogleSub: "google-100", AffCode: "backfill-google"}
	bothUser := User{Username: "backfill-both", Password: "password", TelegramId: "tg-200", GoogleSub: "google-200", AffCode: "backfill-both"}
	require.NoError(t, DB.Create(&telegramUser).Error)
	require.NoError(t, DB.Create(&googleUser).Error)
	require.NoError(t, DB.Create(&bothUser).Error)

	require.NoError(t, InitializeExternalIdentityClaims())

	expectClaim := func(provider, subject string, userID int) {
		t.Helper()
		var claim ExternalIdentityClaim
		require.NoError(t, DB.Where("provider = ? AND subject = ?", provider, subject).First(&claim).Error)
		assert.Equal(t, userID, claim.UserId)
	}
	expectClaim(ExternalIdentityProviderTelegram, "tg-100", telegramUser.Id)
	expectClaim(ExternalIdentityProviderTelegram, "tg-200", bothUser.Id)
	expectClaim(ExternalIdentityProviderGoogle, "google-100", googleUser.Id)
	expectClaim(ExternalIdentityProviderGoogle, "google-200", bothUser.Id)
}

func TestInitializeExternalIdentityClaimsTrimsGoogleSub(t *testing.T) {
	truncateTables(t)

	user := User{Username: "google-padded", Password: "password", GoogleSub: "  padded-sub  "}
	require.NoError(t, DB.Create(&user).Error)

	require.NoError(t, InitializeExternalIdentityClaims())

	var claim ExternalIdentityClaim
	require.NoError(t, DB.Where("provider = ?", ExternalIdentityProviderGoogle).First(&claim).Error)
	assert.Equal(t, "padded-sub", claim.Subject)
	assert.Equal(t, user.Id, claim.UserId)

	// The mirror column is normalized to the exact same canonical value in
	// the same migration round, so claim and mirror can never diverge.
	var stored User
	require.NoError(t, DB.First(&stored, user.Id).Error)
	assert.Equal(t, "padded-sub", stored.GoogleSub)
}

func TestInitializeExternalIdentityClaimsRejectsWhitespaceOnlyGoogleSub(t *testing.T) {
	truncateTables(t)

	user := User{Username: "google-blank", Password: "password", GoogleSub: "   "}
	require.NoError(t, DB.Create(&user).Error)

	err := InitializeExternalIdentityClaims()
	require.Error(t, err, "a whitespace-only google_sub must fail the migration closed")

	var count int64
	require.NoError(t, DB.Model(&ExternalIdentityClaim{}).Count(&count).Error)
	assert.Zero(t, count)
}

// TestInitializeExternalIdentityClaimsRejectsAllSpacesTelegramId protects the
// PAD SPACE fail-closed contract for Telegram: a telegram_id whose raw stored
// length is greater than zero but TrimSpace-canonical form is empty must be
// scanned and rejected with zero half-state claims.
func TestInitializeExternalIdentityClaimsRejectsAllSpacesTelegramId(t *testing.T) {
	truncateTables(t)

	user := User{Username: "telegram-blank", Password: "password", TelegramId: "   ", AffCode: "telegram-blank"}
	require.NoError(t, DB.Create(&user).Error)

	err := InitializeExternalIdentityClaims()
	require.Error(t, err, "an all-spaces telegram_id must fail the migration closed")

	var count int64
	require.NoError(t, DB.Model(&ExternalIdentityClaim{}).Count(&count).Error)
	assert.Zero(t, count, "failed telegram whitespace round must leave zero claims")
}

// TestInitializeExternalIdentityClaimsRejectsTabNewlineTelegramAndGoogle protects
// subjects that ops TRIM preflight can miss (tab/newline): both providers must
// still be scanned by raw stored length and fail closed after Go TrimSpace.
func TestInitializeExternalIdentityClaimsRejectsTabNewlineTelegramAndGoogle(t *testing.T) {
	truncateTables(t)

	telegramUser := User{Username: "telegram-tab", Password: "password", TelegramId: "\t\n", AffCode: "telegram-tab"}
	require.NoError(t, DB.Create(&telegramUser).Error)
	err := InitializeExternalIdentityClaims()
	require.Error(t, err, "tab/newline telegram_id must fail the migration closed")
	var count int64
	require.NoError(t, DB.Model(&ExternalIdentityClaim{}).Count(&count).Error)
	assert.Zero(t, count)

	truncateTables(t)
	googleUser := User{Username: "google-tab", Password: "password", GoogleSub: "\t\n", AffCode: "google-tab"}
	require.NoError(t, DB.Create(&googleUser).Error)
	err = InitializeExternalIdentityClaims()
	require.Error(t, err, "tab/newline google_sub must fail the migration closed")
	require.NoError(t, DB.Model(&ExternalIdentityClaim{}).Count(&count).Error)
	assert.Zero(t, count)
}

// TestInitializeExternalIdentityClaimsTelegramPaddedCanonical covers a padded
// telegram_id that canonicalizes to a real subject, with restart idempotency.
func TestInitializeExternalIdentityClaimsTelegramPaddedCanonical(t *testing.T) {
	truncateTables(t)

	padded := User{Username: "telegram-padded", Password: "password", TelegramId: "  tg-canonical  ", AffCode: "telegram-padded"}
	require.NoError(t, DB.Create(&padded).Error)
	require.NoError(t, InitializeExternalIdentityClaims())

	var claim ExternalIdentityClaim
	require.NoError(t, DB.Where("provider = ?", ExternalIdentityProviderTelegram).First(&claim).Error)
	assert.Equal(t, "tg-canonical", claim.Subject)
	assert.Equal(t, padded.Id, claim.UserId)

	require.NoError(t, InitializeExternalIdentityClaims())
	var count int64
	require.NoError(t, DB.Model(&ExternalIdentityClaim{}).Count(&count).Error)
	assert.EqualValues(t, 1, count)
}

// TestInitializeExternalIdentityClaimsTelegramPaddedCanonicalDuplicate fails
// closed when two legacy rows TrimSpace to the same telegram subject.
func TestInitializeExternalIdentityClaimsTelegramPaddedCanonicalDuplicate(t *testing.T) {
	truncateTables(t)

	first := User{Username: "telegram-pad-one", Password: "password", TelegramId: "  shared-tg  ", AffCode: "telegram-pad-one"}
	second := User{Username: "telegram-pad-two", Password: "password", TelegramId: "shared-tg", AffCode: "telegram-pad-two"}
	require.NoError(t, DB.Create(&first).Error)
	require.NoError(t, DB.Create(&second).Error)
	err := InitializeExternalIdentityClaims()
	assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed)
	var count int64
	require.NoError(t, DB.Model(&ExternalIdentityClaim{}).Count(&count).Error)
	assert.Zero(t, count, "duplicate canonical telegram subjects must leave zero half-state")
}

// TestInitializeExternalIdentityClaimsGooglePaddedCanonicalRestart covers padded
// google_sub normalization and restart idempotency.
func TestInitializeExternalIdentityClaimsGooglePaddedCanonicalRestart(t *testing.T) {
	truncateTables(t)

	padded := User{Username: "google-pad-ok", Password: "password", GoogleSub: "  google-canonical  ", AffCode: "google-pad-ok"}
	require.NoError(t, DB.Create(&padded).Error)
	require.NoError(t, InitializeExternalIdentityClaims())
	var claim ExternalIdentityClaim
	require.NoError(t, DB.Where("provider = ?", ExternalIdentityProviderGoogle).First(&claim).Error)
	assert.Equal(t, "google-canonical", claim.Subject)
	var stored User
	require.NoError(t, DB.First(&stored, padded.Id).Error)
	assert.Equal(t, "google-canonical", stored.GoogleSub)
	require.NoError(t, InitializeExternalIdentityClaims())
	var count int64
	require.NoError(t, DB.Model(&ExternalIdentityClaim{}).Count(&count).Error)
	assert.EqualValues(t, 1, count)
}

// TestInitializeExternalIdentityClaimsGooglePaddedCanonicalDuplicate fails closed
// when padded and bare google_sub values collide after TrimSpace.
func TestInitializeExternalIdentityClaimsGooglePaddedCanonicalDuplicate(t *testing.T) {
	truncateTables(t)

	first := User{Username: "google-pad-dup-a", Password: "password", GoogleSub: "  shared-google  ", AffCode: "google-pad-dup-a"}
	second := User{Username: "google-pad-dup-b", Password: "password", GoogleSub: "shared-google", AffCode: "google-pad-dup-b"}
	require.NoError(t, DB.Create(&first).Error)
	require.NoError(t, DB.Create(&second).Error)
	err := InitializeExternalIdentityClaims()
	assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed)
	var count int64
	require.NoError(t, DB.Model(&ExternalIdentityClaim{}).Count(&count).Error)
	assert.Zero(t, count)
}

// TestInitializeExternalIdentityClaimsRejectsSoftDeletedAllSpacesGoogleSub keeps
// Unscoped soft-deleted all-spaces owners inside the fail-closed scan.
func TestInitializeExternalIdentityClaimsRejectsSoftDeletedAllSpacesGoogleSub(t *testing.T) {
	truncateTables(t)

	deleted := User{Username: "google-spaces-deleted", Password: "password", GoogleSub: "   ", AffCode: "google-spaces-deleted"}
	require.NoError(t, DB.Create(&deleted).Error)
	require.NoError(t, DB.Delete(&deleted).Error)
	err := InitializeExternalIdentityClaims()
	require.Error(t, err, "soft-deleted all-spaces google_sub must still fail closed")
	var count int64
	require.NoError(t, DB.Model(&ExternalIdentityClaim{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestInitializeExternalIdentityClaimsRejectsDuplicateGoogleSub(t *testing.T) {
	truncateTables(t)

	telegramUser := User{Username: "google-dup-tg", Password: "password", TelegramId: "tg-valid", AffCode: "google-dup-tg"}
	first := User{Username: "google-dup-one", Password: "password", GoogleSub: "duplicate-google-sub", AffCode: "google-dup-one"}
	second := User{Username: "google-dup-two", Password: "password", GoogleSub: "duplicate-google-sub", AffCode: "google-dup-two"}
	require.NoError(t, DB.Create(&telegramUser).Error)
	require.NoError(t, DB.Create(&first).Error)
	require.NoError(t, DB.Create(&second).Error)

	err := InitializeExternalIdentityClaims()
	assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed)

	// The whole migration round rolls back: even the unambiguous Telegram
	// binding must not survive a duplicate Google subject.
	var count int64
	require.NoError(t, DB.Model(&ExternalIdentityClaim{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestInitializeExternalIdentityClaimsRejectsClaimColumnConflict(t *testing.T) {
	truncateTables(t)

	claimOwner := User{Username: "google-claim-owner", Password: "password", GoogleSub: "conflicted-sub", AffCode: "google-claim-owner"}
	legacyMirror := User{Username: "google-mirror-only", Password: "password", GoogleSub: "conflicted-sub", AffCode: "google-mirror-only"}
	require.NoError(t, DB.Create(&claimOwner).Error)
	require.NoError(t, DB.Create(&legacyMirror).Error)
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, "conflicted-sub", claimOwner.Id)
	}))

	err := InitializeExternalIdentityClaims()
	assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed)

	// The pre-existing claim survives untouched; the conflicting mirror row
	// must not have been granted a claim.
	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, claimOwner.Id, claims[0].UserId)
	assert.Equal(t, "conflicted-sub", claims[0].Subject)
	var stored User
	require.NoError(t, DB.First(&stored, claimOwner.Id).Error)
	assert.Equal(t, "conflicted-sub", stored.GoogleSub)
}

func TestInitializeExternalIdentityClaimsKeepsSoftDeletedGoogleOwnerOccupied(t *testing.T) {
	truncateTables(t)

	deleted := User{Username: "google-deleted", Password: "password", GoogleSub: "deleted-owner-sub"}
	require.NoError(t, DB.Create(&deleted).Error)
	require.NoError(t, DB.Delete(&deleted).Error)

	require.NoError(t, InitializeExternalIdentityClaims())

	var claim ExternalIdentityClaim
	require.NoError(t, DB.Where("provider = ? AND subject = ?", ExternalIdentityProviderGoogle, "deleted-owner-sub").
		First(&claim).Error)
	assert.Equal(t, deleted.Id, claim.UserId)

	// The subject stays occupied: no replacement account may claim it.
	replacement := User{Username: "google-replacement", Password: "password", AffCode: "google-replacement"}
	require.NoError(t, DB.Create(&replacement).Error)
	err := DB.Transaction(func(tx *gorm.DB) error {
		return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, "deleted-owner-sub", replacement.Id)
	})
	assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed)
}

func TestInitializeExternalIdentityClaimsRejectsAmbiguousLegacyBindings(t *testing.T) {
	truncateTables(t)

	first := User{Username: "telegram-legacy-one", Password: "password", TelegramId: "duplicate-telegram-id", AffCode: "telegram-legacy-one"}
	second := User{Username: "telegram-legacy-two", Password: "password", TelegramId: "duplicate-telegram-id", AffCode: "telegram-legacy-two"}
	require.NoError(t, DB.Create(&first).Error)
	require.NoError(t, DB.Create(&second).Error)

	err := InitializeExternalIdentityClaims()
	assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed)

	var count int64
	require.NoError(t, DB.Model(&ExternalIdentityClaim{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestFindExternalIdentityOwnerResolvesDurableClaim(t *testing.T) {
	truncateTables(t)

	// An unclaimed subject has no owner.
	_, err := FindExternalIdentityOwner(ExternalIdentityProviderGoogle, "missing-sub")
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)

	owner := User{Username: "owner-lookup", Password: "password"}
	require.NoError(t, DB.Create(&owner).Error)
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, "owned-sub", owner.Id)
	}))

	found, err := FindExternalIdentityOwner(ExternalIdentityProviderGoogle, "owned-sub")
	require.NoError(t, err)
	assert.Equal(t, owner.Id, found.Id)

	// A soft-deleted owner is still resolved: callers must reject the login
	// instead of creating a replacement account for the occupied subject.
	require.NoError(t, DB.Delete(&owner).Error)
	found, err = FindExternalIdentityOwner(ExternalIdentityProviderGoogle, "owned-sub")
	require.NoError(t, err)
	assert.Equal(t, owner.Id, found.Id)
	assert.True(t, found.DeletedAt.Valid)
}

func TestBindGoogleIdentityWritesClaimAndMirror(t *testing.T) {
	truncateTables(t)

	user := User{Username: "google-bind-model", Password: "password"}
	require.NoError(t, DB.Create(&user).Error)

	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return BindGoogleIdentityWithTx(tx, "bind-model-sub", user.Id)
	}))

	var claim ExternalIdentityClaim
	require.NoError(t, DB.Where("provider = ? AND subject = ?", ExternalIdentityProviderGoogle, "bind-model-sub").
		First(&claim).Error)
	assert.Equal(t, user.Id, claim.UserId)

	var stored User
	require.NoError(t, DB.First(&stored, user.Id).Error)
	assert.Equal(t, "bind-model-sub", stored.GoogleSub)
}

func TestBindGoogleIdentityRejectsRebind(t *testing.T) {
	truncateTables(t)

	user := User{Username: "google-rebind-model", Password: "password"}
	require.NoError(t, DB.Create(&user).Error)
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return BindGoogleIdentityWithTx(tx, "first-sub", user.Id)
	}))

	for _, subject := range []string{"first-sub", "second-sub"} {
		err := DB.Transaction(func(tx *gorm.DB) error {
			return BindGoogleIdentityWithTx(tx, subject, user.Id)
		})
		assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed,
			"rebinding subject %q must be rejected for an already-bound user", subject)
	}

	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, "first-sub", claims[0].Subject)

	var stored User
	require.NoError(t, DB.First(&stored, user.Id).Error)
	assert.Equal(t, "first-sub", stored.GoogleSub, "the original binding must be unchanged")
}

func TestBindGoogleIdentityRejectsSubjectOwnedByAnotherUser(t *testing.T) {
	truncateTables(t)

	owner := User{Username: "google-bind-owner", Password: "password", AffCode: "google-bind-owner"}
	binder := User{Username: "google-bind-binder", Password: "password", AffCode: "google-bind-binder"}
	require.NoError(t, DB.Create(&owner).Error)
	require.NoError(t, DB.Create(&binder).Error)
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return BindGoogleIdentityWithTx(tx, "taken-sub", owner.Id)
	}))

	err := DB.Transaction(func(tx *gorm.DB) error {
		return BindGoogleIdentityWithTx(tx, "taken-sub", binder.Id)
	})
	assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed)

	var stored User
	require.NoError(t, DB.First(&stored, binder.Id).Error)
	assert.Empty(t, stored.GoogleSub, "a failed bind must not touch the mirror column")

	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, owner.Id, claims[0].UserId)
}

// TestGoogleUserCreationAndClaimShareOneTransaction protects the registration
// composition: the new user row, the durable claim and the google_sub mirror
// commit together, and a conflicting claim rolls the whole unit back without
// leaving an orphan user.
func TestGoogleUserCreationAndClaimShareOneTransaction(t *testing.T) {
	truncateTables(t)

	existing := User{Username: "google-preclaimed-owner", Password: "password", AffCode: "google-preclaimed-owner"}
	require.NoError(t, DB.Create(&existing).Error)
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, "preclaimed-sub", existing.Id)
	}))

	// Conflict inside the transaction rolls the user back: no orphan user, no
	// second claim, no mirror drift.
	orphan := &User{Username: "google-orphan", Password: "password", GoogleSub: "preclaimed-sub", Role: 1, Status: 1}
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := orphan.InsertWithTx(tx, 0); err != nil {
			return err
		}
		return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, "preclaimed-sub", orphan.Id)
	})
	assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed)

	var userCount int64
	require.NoError(t, DB.Model(&User{}).Where("username = ?", "google-orphan").Count(&userCount).Error)
	assert.Zero(t, userCount)
	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, existing.Id, claims[0].UserId)

	// The uncontended composition commits user, claim and mirror together.
	fresh := &User{Username: "google-fresh", Password: "password", GoogleSub: "fresh-sub", Role: 1, Status: 1}
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		if err := fresh.InsertWithTx(tx, 0); err != nil {
			return err
		}
		return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, "fresh-sub", fresh.Id)
	}))
	require.Greater(t, fresh.Id, 0)
	var stored User
	require.NoError(t, DB.First(&stored, fresh.Id).Error)
	assert.Equal(t, "fresh-sub", stored.GoogleSub)
	var freshClaim ExternalIdentityClaim
	require.NoError(t, DB.Where("provider = ? AND subject = ?", ExternalIdentityProviderGoogle, "fresh-sub").
		First(&freshClaim).Error)
	assert.Equal(t, fresh.Id, freshClaim.UserId)
}

// TestBindGoogleIdentityRejectsMissingUser protects the no-orphan-claim
// invariant: a bind whose target user does not exist must fail, and the
// transaction must not commit a claim pointing at nothing.
func TestBindGoogleIdentityRejectsMissingUser(t *testing.T) {
	truncateTables(t)

	const missingUserID = 999999
	err := DB.Transaction(func(tx *gorm.DB) error {
		return BindGoogleIdentityWithTx(tx, "orphan-sub", missingUserID)
	})
	require.Error(t, err, "binding a missing user must fail")

	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	assert.Empty(t, claims, "no orphan claim may be committed for a missing user")
}

func TestInitializeExternalIdentityClaimsRejectsClaimWithoutMirror(t *testing.T) {
	truncateTables(t)

	owner := User{Username: "audit-claim-only", Password: "password"}
	require.NoError(t, DB.Create(&owner).Error)
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, "claim-only-sub", owner.Id)
	}))

	err := InitializeExternalIdentityClaims()
	require.Error(t, err, "a claim whose owner has no google_sub mirror must fail the migration")

	// The pre-existing claim survives the rolled-back round unchanged; the
	// mirror was not silently repaired from the claim.
	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, owner.Id, claims[0].UserId)
	assert.Equal(t, "claim-only-sub", claims[0].Subject)
	var stored User
	require.NoError(t, DB.First(&stored, owner.Id).Error)
	assert.Empty(t, stored.GoogleSub)
}

func TestInitializeExternalIdentityClaimsRejectsClaimWithMismatchedMirror(t *testing.T) {
	truncateTables(t)

	owner := User{Username: "audit-mismatch", Password: "password", GoogleSub: "subject-two"}
	require.NoError(t, DB.Create(&owner).Error)
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, "subject-one", owner.Id)
	}))

	err := InitializeExternalIdentityClaims()
	assert.ErrorIs(t, err, ErrExternalIdentityClaimInconsistent)

	// Neither side may have been rewritten by the failed round.
	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, "subject-one", claims[0].Subject)
	var stored User
	require.NoError(t, DB.First(&stored, owner.Id).Error)
	assert.Equal(t, "subject-two", stored.GoogleSub)
}

func TestInitializeExternalIdentityClaimsRejectsClaimWithMissingOwner(t *testing.T) {
	truncateTables(t)

	orphanClaim := ExternalIdentityClaim{Provider: ExternalIdentityProviderGoogle, Subject: "ghost-sub", UserId: 999999}
	require.NoError(t, DB.Create(&orphanClaim).Error)

	err := InitializeExternalIdentityClaims()
	require.Error(t, err, "a claim pointing at a missing user must fail the migration")

	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, "ghost-sub", claims[0].Subject)
}

// TestInitializeExternalIdentityClaimsConflictRollsBackAllResidue protects the
// whole-round rollback when a conflict hits mid-migration: Telegram claims,
// Google claims and google_sub normalizations written earlier in the same
// round must all disappear.
func TestInitializeExternalIdentityClaimsConflictRollsBackAllResidue(t *testing.T) {
	truncateTables(t)

	telegramUser := User{Username: "residue-tg", Password: "password", TelegramId: "tg-residue", AffCode: "residue-tg"}
	paddedUser := User{Username: "residue-padded", Password: "password", GoogleSub: "  residue-pad  ", AffCode: "residue-padded"}
	dupOne := User{Username: "residue-dup-one", Password: "password", GoogleSub: "residue-dup", AffCode: "residue-dup-one"}
	dupTwo := User{Username: "residue-dup-two", Password: "password", GoogleSub: "residue-dup", AffCode: "residue-dup-two"}
	require.NoError(t, DB.Create(&telegramUser).Error)
	require.NoError(t, DB.Create(&paddedUser).Error)
	require.NoError(t, DB.Create(&dupOne).Error)
	require.NoError(t, DB.Create(&dupTwo).Error)

	err := InitializeExternalIdentityClaims()
	require.Error(t, err)

	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	assert.Empty(t, claims, "no claim from the failed round may survive")
	var stored User
	require.NoError(t, DB.First(&stored, paddedUser.Id).Error)
	assert.Equal(t, "  residue-pad  ", stored.GoogleSub, "mirror normalization must roll back too")
}

// TestInitializeExternalIdentityClaimsAuditKeepsSoftDeletedOwner guards the
// Unscoped owner rule of the audit: a consistent claim owned by a
// soft-deleted user stays occupied and passes the migration.
func TestInitializeExternalIdentityClaimsAuditKeepsSoftDeletedOwner(t *testing.T) {
	truncateTables(t)

	deleted := User{Username: "audit-deleted", Password: "password", GoogleSub: "audit-deleted-sub"}
	require.NoError(t, DB.Create(&deleted).Error)
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, "audit-deleted-sub", deleted.Id)
	}))
	require.NoError(t, DB.Delete(&deleted).Error)

	require.NoError(t, InitializeExternalIdentityClaims())

	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, deleted.Id, claims[0].UserId)
	var stored User
	require.NoError(t, DB.Unscoped().First(&stored, deleted.Id).Error)
	assert.True(t, stored.DeletedAt.Valid)
	assert.Equal(t, "audit-deleted-sub", stored.GoogleSub)
}

// TestInitializeExternalIdentityClaimsAuditNormalizesSoftDeletedOwner protects
// the audit normalization for soft-deleted owners: a padded claim and a
// padded mirror that agree after TrimSpace must both be persisted as the
// exact same canonical value, even though the owner row is soft-deleted.
func TestInitializeExternalIdentityClaimsAuditNormalizesSoftDeletedOwner(t *testing.T) {
	truncateTables(t)

	owner := User{Username: "audit-soft-padded", Password: "password", GoogleSub: "  padded-claim-sub  "}
	require.NoError(t, DB.Create(&owner).Error)
	// Insert the claim with a padded subject directly: the claim primitive
	// trims, so only a raw insert can produce the legacy padded state.
	require.NoError(t, DB.Create(&ExternalIdentityClaim{
		Provider: ExternalIdentityProviderGoogle,
		Subject:  "  padded-claim-sub  ",
		UserId:   owner.Id,
	}).Error)
	require.NoError(t, DB.Delete(&owner).Error)

	require.NoError(t, InitializeExternalIdentityClaims())

	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, "padded-claim-sub", claims[0].Subject)

	var stored User
	require.NoError(t, DB.Unscoped().First(&stored, owner.Id).Error)
	assert.True(t, stored.DeletedAt.Valid)
	assert.Equal(t, "padded-claim-sub", stored.GoogleSub,
		"the soft-deleted owner's mirror must be normalized to the exact canonical value")
}

// TestInitializeExternalIdentityClaimsBackfillNormalizesSoftDeletedLegacyOwner
// protects the backfill normalization for soft-deleted legacy owners: the
// new claim and the padded mirror must both end up with the identical
// canonical subject.
func TestInitializeExternalIdentityClaimsBackfillNormalizesSoftDeletedLegacyOwner(t *testing.T) {
	truncateTables(t)

	owner := User{Username: "backfill-soft-padded", Password: "password", GoogleSub: "  legacy-pad  "}
	require.NoError(t, DB.Create(&owner).Error)
	require.NoError(t, DB.Delete(&owner).Error)

	require.NoError(t, InitializeExternalIdentityClaims())

	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, "legacy-pad", claims[0].Subject)
	assert.Equal(t, owner.Id, claims[0].UserId)

	var stored User
	require.NoError(t, DB.Unscoped().First(&stored, owner.Id).Error)
	assert.True(t, stored.DeletedAt.Valid)
	assert.Equal(t, "legacy-pad", stored.GoogleSub,
		"the soft-deleted owner's mirror must be normalized together with the claim")
}

// TestInitializeExternalIdentityClaimsNormalizationZeroHitFailsRound protects
// the zero-hit rule: when a normalization write that must happen updates no
// row, the migration must fail and roll the whole round back instead of
// committing a claim with a silently diverging mirror. The RAISE(IGNORE)
// trigger makes the google_sub UPDATE silently skip the row (RowsAffected 0,
// no statement error) and is dropped on cleanup.
func TestInitializeExternalIdentityClaimsNormalizationZeroHitFailsRound(t *testing.T) {
	truncateTables(t)

	telegramUser := User{Username: "zerohit-tg", Password: "password", TelegramId: "tg-zerohit", AffCode: "zerohit-tg"}
	paddedUser := User{Username: "zerohit-padded", Password: "password", GoogleSub: "  zerohit-pad  ", AffCode: "zerohit-padded"}
	require.NoError(t, DB.Create(&telegramUser).Error)
	require.NoError(t, DB.Create(&paddedUser).Error)

	const triggerName = "skip_google_sub_normalization"
	require.NoError(t, DB.Exec("CREATE TRIGGER "+triggerName+
		" BEFORE UPDATE OF google_sub ON users"+
		" BEGIN SELECT RAISE(IGNORE); END;").Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Exec("DROP TRIGGER "+triggerName).Error)
	})

	err := InitializeExternalIdentityClaims()
	require.Error(t, err, "a zero-hit normalization write must fail the migration")

	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	assert.Empty(t, claims, "the failed round must leave no claim behind")
	var stored User
	require.NoError(t, DB.First(&stored, paddedUser.Id).Error)
	assert.Equal(t, "  zerohit-pad  ", stored.GoogleSub, "no half-normalized mirror may survive")
}

// TestInitializeExternalIdentityClaimsClaimSubjectZeroHitFailsRound protects
// the claim-side normalization: when the subject UPDATE silently updates no
// row (RAISE(IGNORE) skips it without an error), the audit must detect the
// missing canonical subject by re-reading the persisted row and fail the
// whole round. Nothing may commit half-normalized: the claim keeps its padded
// subject, the owner mirror keeps its padded value, and earlier writes of the
// same round (here the Telegram claim) roll back. The trigger is dropped on
// cleanup with an explicit success assertion.
func TestInitializeExternalIdentityClaimsClaimSubjectZeroHitFailsRound(t *testing.T) {
	truncateTables(t)

	telegramUser := User{Username: "claim-norm-tg", Password: "password", TelegramId: "tg-claim-norm", AffCode: "claim-norm-tg"}
	owner := User{Username: "claim-norm-owner", Password: "password", GoogleSub: "  claim-norm-pad  ", AffCode: "claim-norm-owner"}
	require.NoError(t, DB.Create(&telegramUser).Error)
	require.NoError(t, DB.Create(&owner).Error)
	// Raw insert to produce the legacy padded claim subject (the claim
	// primitive trims).
	require.NoError(t, DB.Create(&ExternalIdentityClaim{
		Provider: ExternalIdentityProviderGoogle,
		Subject:  "  claim-norm-pad  ",
		UserId:   owner.Id,
	}).Error)

	const triggerName = "skip_claim_subject_normalization"
	require.NoError(t, DB.Exec("CREATE TRIGGER "+triggerName+
		" BEFORE UPDATE OF subject ON external_identity_claims"+
		" BEGIN SELECT RAISE(IGNORE); END;").Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Exec("DROP TRIGGER "+triggerName).Error)
	})

	err := InitializeExternalIdentityClaims()
	assert.ErrorIs(t, err, ErrExternalIdentityClaimInconsistent,
		"a silent zero-hit claim subject normalization must fail the migration")

	// The pre-existing claim stays padded; the mirror was never normalized;
	// the Telegram claim written earlier in the round rolled back.
	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, "  claim-norm-pad  ", claims[0].Subject)
	assert.Equal(t, owner.Id, claims[0].UserId)

	var stored User
	require.NoError(t, DB.First(&stored, owner.Id).Error)
	assert.Equal(t, "  claim-norm-pad  ", stored.GoogleSub,
		"the mirror must not be normalized when the claim normalization silently failed")
}

// TestInitializeExternalIdentityClaimsSameValueMirrorUpdateIsNotFailure
// reproduces the stale-snapshot hazard: googleUsers is scanned at the start
// of the migration transaction, the audit then normalizes the claim and the
// persisted mirror, and the backfill still iterates the padded snapshot and
// re-issues a canonical -> canonical mirror update. On MySQL without
// clientFoundRows (and under the WHEN OLD = NEW RAISE(IGNORE) trigger used
// here) that same-value update reports zero affected rows; it is a legal
// final state, not a failure. The migration must succeed, leave both sides
// exactly canonical, and stay idempotent on the next startup. The trigger is
// dropped on cleanup with an explicit success assertion.
func TestInitializeExternalIdentityClaimsSameValueMirrorUpdateIsNotFailure(t *testing.T) {
	truncateTables(t)

	owner := User{Username: "stale-snapshot-owner", Password: "password", GoogleSub: "  stale-snapshot-sub  "}
	require.NoError(t, DB.Create(&owner).Error)
	// Raw insert to produce the legacy padded claim subject (the claim
	// primitive trims).
	require.NoError(t, DB.Create(&ExternalIdentityClaim{
		Provider: ExternalIdentityProviderGoogle,
		Subject:  "  stale-snapshot-sub  ",
		UserId:   owner.Id,
	}).Error)

	const triggerName = "skip_same_value_google_sub_update"
	require.NoError(t, DB.Exec("CREATE TRIGGER "+triggerName+
		" BEFORE UPDATE OF google_sub ON users"+
		" WHEN OLD.google_sub = NEW.google_sub"+
		" BEGIN SELECT RAISE(IGNORE); END;").Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Exec("DROP TRIGGER "+triggerName).Error)
	})

	require.NoError(t, InitializeExternalIdentityClaims(),
		"a same-value mirror update re-issued from the stale snapshot must not fail the migration")

	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, "stale-snapshot-sub", claims[0].Subject)
	assert.Equal(t, owner.Id, claims[0].UserId)
	var stored User
	require.NoError(t, DB.First(&stored, owner.Id).Error)
	assert.Equal(t, "stale-snapshot-sub", stored.GoogleSub)

	// Idempotent: the next startup over the same state succeeds again.
	require.NoError(t, InitializeExternalIdentityClaims())
	require.NoError(t, DB.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, "stale-snapshot-sub", claims[0].Subject)
	assert.Equal(t, owner.Id, claims[0].UserId)
}

// TestGoogleUnbindAdminClearReleasesClaimAndMirror protects the admin
// recovery seam at the model boundary: ClearBinding("google") releases the
// durable claim, clears the google_sub mirror and syncs the receiver. The
// receiver is reloaded after the bind so the assertion runs against a real
// persisted mirror, not a stale empty struct field.
func TestGoogleUnbindAdminClearReleasesClaimAndMirror(t *testing.T) {
	truncateTables(t)

	user := User{Username: "google-admin-clear", Password: "password"}
	require.NoError(t, DB.Create(&user).Error)
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return BindGoogleIdentityWithTx(tx, "admin-clear-model-sub", user.Id)
	}))

	// Reload the receiver from the database: its GoogleSub must hold the
	// real persisted subject before the clear, otherwise the post-clear
	// assertion would be a false positive on a stale struct.
	var reloaded User
	require.NoError(t, DB.First(&reloaded, user.Id).Error)
	user = reloaded
	assert.Equal(t, "admin-clear-model-sub", user.GoogleSub)

	require.NoError(t, user.ClearBinding("google"))
	assert.Empty(t, user.GoogleSub, "the receiver must be synced with the committed clear")

	var claims []ExternalIdentityClaim
	require.NoError(t, DB.Find(&claims).Error)
	assert.Empty(t, claims, "the durable claim must be released with the mirror")
	var stored User
	require.NoError(t, DB.First(&stored, user.Id).Error)
	assert.Empty(t, stored.GoogleSub)
}

// TestClearBindingNonGoogleCacheFailureNotSwallowed protects the pre-existing
// contract for non-Google bindings: a cache refresh failure after the commit
// must still surface as an error (UserBase caches email, so the refresh is
// meaningful there). Only the Google branch may use the committed-outcome
// semantics. The cache failure is staged deterministically: an in-memory
// miniredis server is started, the client is verified against it, and only
// then is the server closed — no real network is involved.
func TestClearBindingNonGoogleCacheFailureNotSwallowed(t *testing.T) {
	truncateTables(t)

	user := User{Username: "email-cache-user", Password: "password", Email: "cache-fail@example.com"}
	require.NoError(t, DB.Create(&user).Error)

	server, err := miniredis.Run()
	require.NoError(t, err)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	// Register the client close immediately so it cannot leak even if the
	// verification or the outage staging below fails.
	t.Cleanup(func() {
		require.NoError(t, client.Close())
	})
	require.NoError(t, client.Ping(context.Background()).Err(),
		"the cache client must be verified before the failure is staged")
	server.Close()

	previousEnabled := common.RedisEnabled
	previousRDB := common.RDB
	common.RedisEnabled = true
	common.RDB = client
	t.Cleanup(func() {
		common.RedisEnabled = previousEnabled
		common.RDB = previousRDB
	})

	err = user.ClearBinding("email")
	require.Error(t, err, "a non-Google binding must not swallow cache refresh failures")

	// The binding change itself committed: the failure is post-commit and
	// must not pretend a rollback happened.
	var stored User
	require.NoError(t, DB.First(&stored, user.Id).Error)
	assert.Empty(t, stored.Email)
}

// withExternalIdentityRemoteDB opens an isolated remote database for the
// duration of fn, publishes it as package-level DB/LOG_DB, and restores
// globals on cleanup. Each call creates a throwaway database so parallel
// packages sharing TEST_*_DSN cannot collide. The DSN is never logged.
// Cleanup order (LIFO): restore globals → close test pool / DROP DB / close admin
// (registered progressively inside the opener).
func withExternalIdentityRemoteDB(t *testing.T, baseDSN string, dbType common.DatabaseType, fn func(db *gorm.DB)) {
	t.Helper()
	previousDB := DB
	previousLogDB := LOG_DB
	previousType := common.MainDatabaseType()
	previousRedisEnabled := common.RedisEnabled
	previousRDB := common.RDB

	db := openIsolatedConfiguredDB(t, baseDSN, dbType)
	// Restore globals before the opener's pool/database cleanups (LIFO).
	t.Cleanup(func() {
		DB = previousDB
		LOG_DB = previousLogDB
		common.SetMainDatabaseType(previousType)
		common.RedisEnabled = previousRedisEnabled
		common.RDB = previousRDB
	})
	require.NoError(t, db.AutoMigrate(
		&User{},
		&ExternalIdentityClaim{},
		&UserSession{},
		&PasskeyCredential{},
		&Log{},
		&UserOAuthBinding{},
		&CustomOAuthProvider{},
	))
	DB = db
	LOG_DB = db
	common.SetMainDatabaseType(dbType)
	common.RedisEnabled = false
	fn(db)
}

// openIsolatedConfiguredDB creates a throwaway MySQL/PostgreSQL database on
// the configured server. Progressive t.Cleanup registrations guarantee that a
// failure after CREATE DATABASE still drops the database and closes every
// pool. Credentials are never logged.
func openIsolatedConfiguredDB(t *testing.T, baseDSN string, dbType common.DatabaseType) *gorm.DB {
	t.Helper()
	baseDSN = strings.TrimSpace(baseDSN)
	require.NotEmpty(t, baseDSN)
	switch dbType {
	case common.DatabaseTypePostgreSQL:
		return openIsolatedPostgresDB(t, baseDSN)
	case common.DatabaseTypeMySQL:
		return openIsolatedMySQLDB(t, baseDSN)
	default:
		require.FailNowf(t, "unsupported configured database type", "%v", dbType)
		return nil
	}
}

// isolatedPostgresAfterCreateHook is a test-only seam used by the fatal
// cleanup subprocess fixture. Production tests leave it nil. A non-nil error
// is surfaced via require.NoError (FailNow) while already-registered DROP
// cleanup still runs.
var isolatedPostgresAfterCreateHook func(dbName string) error

func openIsolatedPostgresDB(t *testing.T, baseDSN string) *gorm.DB {
	t.Helper()
	dbName := fmt.Sprintf("p9b_%d_%d", os.Getpid(), time.Now().UnixNano())

	admin, err := gorm.Open(postgres.New(postgres.Config{DSN: baseDSN}), &gorm.Config{})
	require.NoError(t, err)
	adminSQL, err := admin.DB()
	require.NoError(t, err)

	var (
		adminCloseOnce sync.Once
		testCloseOnce  sync.Once
		dropOnce       sync.Once
		sqlDB          *sql.DB
		dbCreated      bool
	)
	closeAdmin := func() {
		adminCloseOnce.Do(func() {
			assert.NoError(t, adminSQL.Close())
		})
	}
	closeTest := func() {
		testCloseOnce.Do(func() {
			if sqlDB != nil {
				assert.NoError(t, sqlDB.Close())
			}
		})
	}
	dropDB := func() {
		dropOnce.Do(func() {
			if !dbCreated {
				return
			}
			_, termErr := adminSQL.Exec(
				`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
				dbName,
			)
			assert.NoError(t, termErr)
			_, dropErr := adminSQL.Exec("DROP DATABASE IF EXISTS " + dbName)
			assert.NoError(t, dropErr)
			dbCreated = false
		})
	}
	// LIFO: close test → DROP → close admin
	t.Cleanup(closeAdmin)

	_, err = adminSQL.Exec("CREATE DATABASE " + dbName)
	require.NoError(t, err)
	dbCreated = true
	t.Cleanup(func() {
		closeTest()
		dropDB()
	})

	if isolatedPostgresAfterCreateHook != nil {
		// require.NoError FailNows on error after CREATE DATABASE. Cleanups
		// already registered on t still run, so the throwaway database is dropped.
		require.NoError(t, isolatedPostgresAfterCreateHook(dbName))
	}

	testDSN, err := replacePostgresDSNDBName(baseDSN, dbName)
	require.NoError(t, err)
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: testDSN}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err = db.DB()
	require.NoError(t, err)
	t.Cleanup(closeTest)
	return db
}

func openIsolatedMySQLDB(t *testing.T, baseDSN string) *gorm.DB {
	t.Helper()
	dbName := fmt.Sprintf("p9b_%d_%d", os.Getpid(), time.Now().UnixNano())

	admin, err := gorm.Open(mysql.Open(baseDSN), &gorm.Config{})
	require.NoError(t, err)
	adminSQL, err := admin.DB()
	require.NoError(t, err)

	var (
		adminCloseOnce sync.Once
		testCloseOnce  sync.Once
		dropOnce       sync.Once
		sqlDB          *sql.DB
		dbCreated      bool
	)
	closeAdmin := func() {
		adminCloseOnce.Do(func() {
			assert.NoError(t, adminSQL.Close())
		})
	}
	closeTest := func() {
		testCloseOnce.Do(func() {
			if sqlDB != nil {
				assert.NoError(t, sqlDB.Close())
			}
		})
	}
	dropDB := func() {
		dropOnce.Do(func() {
			if !dbCreated {
				return
			}
			_, dropErr := adminSQL.Exec("DROP DATABASE IF EXISTS `" + dbName + "`")
			assert.NoError(t, dropErr)
			dbCreated = false
		})
	}
	t.Cleanup(closeAdmin)

	_, err = adminSQL.Exec("CREATE DATABASE `" + dbName + "`")
	require.NoError(t, err)
	dbCreated = true
	t.Cleanup(func() {
		closeTest()
		dropDB()
	})

	testDSN := replaceMySQLDSNDatabase(baseDSN, dbName)
	db, err := gorm.Open(mysql.Open(testDSN), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err = db.DB()
	require.NoError(t, err)
	t.Cleanup(closeTest)
	return db
}

// replacePostgresDSNDBName rewrites only the database name of a PostgreSQL DSN.
// Supports keyword/value and postgres:// / postgresql:// URIs; preserves query
// parameters and percent-encoded credentials. Never logs the DSN.
func replacePostgresDSNDBName(dsn, dbName string) (string, error) {
	dsn = strings.TrimSpace(dsn)
	if dbName == "" {
		return "", fmt.Errorf("postgres db name is empty")
	}
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		u, err := url.Parse(dsn)
		if err != nil {
			return "", err
		}
		u.Path = "/" + dbName
		u.RawPath = ""
		return u.String(), nil
	}
	parts := strings.Fields(dsn)
	replaced := false
	for i, part := range parts {
		if strings.HasPrefix(part, "dbname=") {
			parts[i] = "dbname=" + dbName
			replaced = true
		}
	}
	if !replaced {
		parts = append(parts, "dbname="+dbName)
	}
	return strings.Join(parts, " "), nil
}

func replaceMySQLDSNDatabase(dsn, dbName string) string {
	slash := strings.LastIndex(dsn, "/")
	if slash < 0 {
		return dsn + "/" + dbName
	}
	rest := dsn[slash+1:]
	q := strings.Index(rest, "?")
	if q >= 0 {
		return dsn[:slash+1] + dbName + rest[q:]
	}
	return dsn[:slash+1] + dbName
}

// TestExternalIdentityLaunchProfileConfiguredDatabases is the thin
// MySQL/PostgreSQL entry for durable-claim backfill, TrimSpace/conflict,
// soft-deleted owner occupation, bind/rebind, and admin clear final-state
// invariants. Ordinary `go test ./...` skips when TEST_*_DSN is unset.
func TestExternalIdentityLaunchProfileConfiguredDatabases(t *testing.T) {
	databases := []struct {
		name   string
		env    string
		dbType common.DatabaseType
	}{
		{name: "mysql", env: "TEST_MYSQL_DSN", dbType: common.DatabaseTypeMySQL},
		{name: "postgres", env: "TEST_POSTGRES_DSN", dbType: common.DatabaseTypePostgreSQL},
	}

	for _, database := range databases {
		t.Run(database.name, func(t *testing.T) {
			dsn := strings.TrimSpace(os.Getenv(database.env))
			if dsn == "" {
				t.Skip(database.env + " is not configured; skipping integration run")
			}
			dbType := database.dbType

			t.Run("backfillTelegramAndGoogleIdempotent", func(t *testing.T) {
				withExternalIdentityRemoteDB(t, dsn, dbType, func(db *gorm.DB) {
					telegramUser := User{Username: "backfill-tg", Password: "password", TelegramId: "tg-100", AffCode: "backfill-tg"}
					googleUser := User{Username: "backfill-google", Password: "password", GoogleSub: "google-100", AffCode: "backfill-google"}
					bothUser := User{Username: "backfill-both", Password: "password", TelegramId: "tg-200", GoogleSub: "google-200", AffCode: "backfill-both"}
					require.NoError(t, db.Create(&telegramUser).Error)
					require.NoError(t, db.Create(&googleUser).Error)
					require.NoError(t, db.Create(&bothUser).Error)
					require.NoError(t, InitializeExternalIdentityClaims())
					require.NoError(t, InitializeExternalIdentityClaims())
					var count int64
					require.NoError(t, db.Model(&ExternalIdentityClaim{}).Count(&count).Error)
					assert.EqualValues(t, 4, count)
					var googleClaim ExternalIdentityClaim
					require.NoError(t, db.Where("provider = ? AND subject = ?", ExternalIdentityProviderGoogle, "google-100").
						First(&googleClaim).Error)
					assert.Equal(t, googleUser.Id, googleClaim.UserId)
				})
			})

			t.Run("trimsGoogleSubAndNormalizesMirror", func(t *testing.T) {
				withExternalIdentityRemoteDB(t, dsn, dbType, func(db *gorm.DB) {
					user := User{Username: "google-padded", Password: "password", GoogleSub: "  padded-sub  ", AffCode: "google-padded"}
					require.NoError(t, db.Create(&user).Error)
					require.NoError(t, InitializeExternalIdentityClaims())
					var claim ExternalIdentityClaim
					require.NoError(t, db.Where("provider = ?", ExternalIdentityProviderGoogle).First(&claim).Error)
					assert.Equal(t, "padded-sub", claim.Subject)
					assert.Equal(t, user.Id, claim.UserId)
					var stored User
					require.NoError(t, db.First(&stored, user.Id).Error)
					assert.Equal(t, "padded-sub", stored.GoogleSub)
				})
			})

			t.Run("rejectsWhitespaceOnlyGoogleSub", func(t *testing.T) {
				withExternalIdentityRemoteDB(t, dsn, dbType, func(db *gorm.DB) {
					blank := User{Username: "google-blank", Password: "password", GoogleSub: "   ", AffCode: "google-blank"}
					require.NoError(t, db.Create(&blank).Error)
					err := InitializeExternalIdentityClaims()
					require.Error(t, err, "a whitespace-only google_sub must fail the migration closed")
					var count int64
					require.NoError(t, db.Model(&ExternalIdentityClaim{}).Count(&count).Error)
					assert.Zero(t, count)
				})
			})

			t.Run("rejectsDuplicateCanonicalGoogleSub", func(t *testing.T) {
				withExternalIdentityRemoteDB(t, dsn, dbType, func(db *gorm.DB) {
					first := User{Username: "google-dup-one", Password: "password", GoogleSub: "  shared-google  ", AffCode: "google-dup-one"}
					second := User{Username: "google-dup-two", Password: "password", GoogleSub: "shared-google", AffCode: "google-dup-two"}
					require.NoError(t, db.Create(&first).Error)
					require.NoError(t, db.Create(&second).Error)
					err := InitializeExternalIdentityClaims()
					assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed)
					var count int64
					require.NoError(t, db.Model(&ExternalIdentityClaim{}).Count(&count).Error)
					assert.Zero(t, count)
				})
			})

			t.Run("softDeletedOwnerKeepsSubjectOccupied", func(t *testing.T) {
				withExternalIdentityRemoteDB(t, dsn, dbType, func(db *gorm.DB) {
					deleted := User{Username: "google-deleted", Password: "password", GoogleSub: "deleted-owner-sub", AffCode: "google-deleted"}
					require.NoError(t, db.Create(&deleted).Error)
					require.NoError(t, db.Delete(&deleted).Error)
					require.NoError(t, InitializeExternalIdentityClaims())
					var claim ExternalIdentityClaim
					require.NoError(t, db.Where("provider = ? AND subject = ?", ExternalIdentityProviderGoogle, "deleted-owner-sub").
						First(&claim).Error)
					assert.Equal(t, deleted.Id, claim.UserId)
					replacement := User{Username: "google-replacement", Password: "password", AffCode: "google-replacement"}
					require.NoError(t, db.Create(&replacement).Error)
					err := db.Transaction(func(tx *gorm.DB) error {
						return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, "deleted-owner-sub", replacement.Id)
					})
					assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed)
					found, err := FindExternalIdentityOwner(ExternalIdentityProviderGoogle, "deleted-owner-sub")
					require.NoError(t, err)
					assert.Equal(t, deleted.Id, found.Id)
					assert.True(t, found.DeletedAt.Valid)
				})
			})

			t.Run("bindWritesClaimAndMirrorRejectsRebind", func(t *testing.T) {
				withExternalIdentityRemoteDB(t, dsn, dbType, func(db *gorm.DB) {
					user := User{Username: "google-bind-model", Password: "password", AffCode: "google-bind-model"}
					require.NoError(t, db.Create(&user).Error)
					require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
						return BindGoogleIdentityWithTx(tx, "bind-model-sub", user.Id)
					}))
					var claim ExternalIdentityClaim
					require.NoError(t, db.Where("provider = ? AND subject = ?", ExternalIdentityProviderGoogle, "bind-model-sub").
						First(&claim).Error)
					assert.Equal(t, user.Id, claim.UserId)
					var stored User
					require.NoError(t, db.First(&stored, user.Id).Error)
					assert.Equal(t, "bind-model-sub", stored.GoogleSub)
					for _, subject := range []string{"bind-model-sub", "second-sub"} {
						err := db.Transaction(func(tx *gorm.DB) error {
							return BindGoogleIdentityWithTx(tx, subject, user.Id)
						})
						assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed, subject)
					}
					var claims []ExternalIdentityClaim
					require.NoError(t, db.Find(&claims).Error)
					require.Len(t, claims, 1)
					assert.Equal(t, "bind-model-sub", claims[0].Subject)
					require.NoError(t, db.First(&stored, user.Id).Error)
					assert.Equal(t, "bind-model-sub", stored.GoogleSub)
				})
			})

			t.Run("adminClearReleasesClaimAndMirror", func(t *testing.T) {
				withExternalIdentityRemoteDB(t, dsn, dbType, func(db *gorm.DB) {
					user := User{Username: "google-admin-clear", Password: "password", AffCode: "google-admin-clear"}
					require.NoError(t, db.Create(&user).Error)
					require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
						return BindGoogleIdentityWithTx(tx, "admin-clear-model-sub", user.Id)
					}))
					var reloaded User
					require.NoError(t, db.First(&reloaded, user.Id).Error)
					require.NoError(t, reloaded.ClearBinding("google"))
					assert.Empty(t, reloaded.GoogleSub)
					var claims []ExternalIdentityClaim
					require.NoError(t, db.Find(&claims).Error)
					assert.Empty(t, claims)
					var stored User
					require.NoError(t, db.First(&stored, user.Id).Error)
					assert.Empty(t, stored.GoogleSub)
				})
			})

			t.Run("registrationCompositionRollsBackOnClaimConflict", func(t *testing.T) {
				withExternalIdentityRemoteDB(t, dsn, dbType, func(db *gorm.DB) {
					existing := User{Username: "google-preclaimed-owner", Password: "password", AffCode: "google-preclaimed-owner"}
					require.NoError(t, db.Create(&existing).Error)
					require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
						return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, "preclaimed-sub", existing.Id)
					}))
					orphan := &User{Username: "google-orphan", Password: "password", GoogleSub: "preclaimed-sub", Role: 1, Status: 1, AffCode: "google-orphan"}
					err := db.Transaction(func(tx *gorm.DB) error {
						if err := orphan.InsertWithTx(tx, 0); err != nil {
							return err
						}
						return ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, "preclaimed-sub", orphan.Id)
					})
					assert.ErrorIs(t, err, ErrExternalIdentityAlreadyClaimed)
					var userCount int64
					require.NoError(t, db.Model(&User{}).Where("username = ?", "google-orphan").Count(&userCount).Error)
					assert.Zero(t, userCount)
					var claims []ExternalIdentityClaim
					require.NoError(t, db.Find(&claims).Error)
					require.Len(t, claims, 1)
					assert.Equal(t, existing.Id, claims[0].UserId)
				})
			})
		})
	}
}

// TestReplacePostgresDSNDBName covers keyword and URI DSN rewriting used by the
// isolated-database helper. Credentials stay intact; only the database name
// changes. Test-infrastructure coverage, not a production defect.
func TestReplacePostgresDSNDBName(t *testing.T) {
	cases := []struct {
		name string
		in   string
		db   string
		want string
	}{
		{
			name: "keyword value",
			in:   "host=127.0.0.1 port=5432 user=u password=p dbname=p9b_launch sslmode=disable",
			db:   "p9b_isolated",
			want: "host=127.0.0.1 port=5432 user=u password=p dbname=p9b_isolated sslmode=disable",
		},
		{
			name: "postgres uri",
			in:   "postgres://u:p@127.0.0.1:5432/p9b_launch?sslmode=disable",
			db:   "p9b_isolated",
			want: "postgres://u:p@127.0.0.1:5432/p9b_isolated?sslmode=disable",
		},
		{
			name: "postgresql uri",
			in:   "postgresql://u:p@127.0.0.1:5432/p9b_launch?sslmode=disable",
			db:   "p9b_isolated",
			want: "postgresql://u:p@127.0.0.1:5432/p9b_isolated?sslmode=disable",
		},
		{
			name: "uri query and percent-encoded credential preserved",
			in:   "postgresql://u:p%40ss%2Fword@127.0.0.1:5432/p9b_launch?sslmode=disable&application_name=vancine",
			db:   "p9b_isolated",
			want: "postgresql://u:p%40ss%2Fword@127.0.0.1:5432/p9b_isolated?sslmode=disable&application_name=vancine",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := replacePostgresDSNDBName(tc.in, tc.db)
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
			assert.NotContains(t, got, "p9b_launch")
			if strings.Contains(tc.in, "password=p") {
				assert.Contains(t, got, "password=p")
			}
			if strings.Contains(tc.in, "p%40ss%2Fword") {
				assert.Contains(t, got, "p%40ss%2Fword")
			}
		})
	}
}

// TestOpenIsolatedPostgresDBCleansUpAfterPostCreateFatal proves that a real
// require.FailNow after CREATE DATABASE still runs t.Cleanup DROP/close. The
// child process exits non-zero; the parent only checks the named database is
// gone. Credentials and full DSNs must not appear in child output.
// Test-infrastructure contract, not a production defect.
func TestOpenIsolatedPostgresDBCleansUpAfterPostCreateFatal(t *testing.T) {
	if os.Getenv("P9B_ISOLATED_PG_FATAL_CHILD") == "1" {
		runIsolatedPostgresPostCreateFatalChild(t)
		return
	}
	baseDSN := strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN"))
	if baseDSN == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured; skipping integration run")
	}

	nameFile := filepath.Join(t.TempDir(), "created-db-name.txt")
	cmd := exec.Command(os.Args[0], "-test.run=^TestOpenIsolatedPostgresDBCleansUpAfterPostCreateFatal$", "-test.count=1", "-test.v=false")
	cmd.Env = append(os.Environ(),
		"P9B_ISOLATED_PG_FATAL_CHILD=1",
		"P9B_ISOLATED_PG_NAME_FILE="+nameFile,
	)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	require.Error(t, err, "child must exit non-zero after require fatal")

	combined := stdout.String() + stderr.String()
	// Evaluate Contains in plain booleans so a failed assertion never prints
	// combined output, baseDSN, or other secret material in the failure message.
	hasPasswordEq := strings.Contains(combined, "password=")
	hasPasswordWord := strings.Contains(combined, "PASSWORD")
	hasFullDSN := baseDSN != "" && strings.Contains(combined, baseDSN)
	assert.False(t, hasPasswordEq, "child output must not contain password= secret material")
	assert.False(t, hasPasswordWord, "child output must not contain PASSWORD secret material")
	assert.False(t, hasFullDSN, "child output must not contain the full database DSN")

	nameBytes, readErr := os.ReadFile(nameFile)
	require.NoError(t, readErr, "child must record the created database name before fatal")
	createdName := strings.TrimSpace(string(nameBytes))
	require.NotEmpty(t, createdName)
	require.True(t, strings.HasPrefix(createdName, "p9b_"), "unexpected database name prefix")

	admin, err := gorm.Open(postgres.New(postgres.Config{DSN: baseDSN}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := admin.DB()
	require.NoError(t, err)
	t.Cleanup(func() { assert.NoError(t, sqlDB.Close()) })
	var exists bool
	require.NoError(t, admin.Raw(
		"SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ?)", createdName,
	).Scan(&exists).Error)
	assert.False(t, exists, "throwaway database must be dropped after require fatal cleanup")
}

// runIsolatedPostgresPostCreateFatalChild is the subprocess body: CREATE
// succeeds, the name is written to a private file, then require.NoError on the
// hook error FailNows. Registered cleanups must still DROP the database.
func runIsolatedPostgresPostCreateFatalChild(t *testing.T) {
	baseDSN := strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN"))
	if baseDSN == "" {
		os.Exit(2)
	}
	nameFile := strings.TrimSpace(os.Getenv("P9B_ISOLATED_PG_NAME_FILE"))
	if nameFile == "" {
		os.Exit(2)
	}
	isolatedPostgresAfterCreateHook = func(dbName string) error {
		if err := os.WriteFile(nameFile, []byte(dbName), 0o600); err != nil {
			return err
		}
		return errors.New("forced post-create fatal")
	}
	t.Cleanup(func() { isolatedPostgresAfterCreateHook = nil })
	_ = openIsolatedPostgresDB(t, baseDSN)
}
