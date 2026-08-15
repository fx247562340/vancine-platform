package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	ExternalIdentityProviderTelegram = "telegram"
	ExternalIdentityProviderGoogle   = "google"
)

var ErrExternalIdentityAlreadyClaimed = errors.New("external identity is already claimed")

// ErrExternalIdentityClaimInconsistent reports a durable claim that cannot be
// reconciled with its owner row during the migration audit (missing owner,
// blank or diverging google_sub mirror, blank subject).
var ErrExternalIdentityClaimInconsistent = errors.New("external identity claim is inconsistent with its owner")

// ExternalIdentityClaim is the durable ownership record for an identity issued
// by an external provider. The two unique indexes make both the provider
// subject and the user's provider slot single-owner without relying on a
// check-then-update sequence.
type ExternalIdentityClaim struct {
	Id        int64     `json:"id" gorm:"primaryKey"`
	Provider  string    `json:"provider" gorm:"type:varchar(32);not null;uniqueIndex:idx_external_identity_subject,priority:1;uniqueIndex:idx_external_identity_user,priority:1"`
	Subject   string    `json:"subject" gorm:"type:varchar(128);not null;uniqueIndex:idx_external_identity_subject,priority:2"`
	UserId    int       `json:"user_id" gorm:"not null;index;uniqueIndex:idx_external_identity_user,priority:2"`
	CreatedAt time.Time `json:"created_at"`
}

func (ExternalIdentityClaim) TableName() string {
	return "external_identity_claims"
}

// ClaimExternalIdentityWithTx atomically claims a provider subject for one
// user. Repeating the exact mapping is idempotent; every competing subject or
// user is rejected. Ownership is read back instead of trusting RowsAffected,
// whose duplicate-key semantics differ between supported databases.
func ClaimExternalIdentityWithTx(tx *gorm.DB, provider, subject string, userId int) error {
	provider = strings.TrimSpace(provider)
	subject = strings.TrimSpace(subject)
	if tx == nil || provider == "" || subject == "" || userId == 0 {
		return errors.New("external identity claim is invalid")
	}

	claim := ExternalIdentityClaim{Provider: provider, Subject: subject, UserId: userId}
	result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&claim)
	if result.Error != nil {
		return result.Error
	}
	var subjectOwner ExternalIdentityClaim
	if err := tx.Where("provider = ? AND subject = ?", provider, subject).First(&subjectOwner).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrExternalIdentityAlreadyClaimed
		}
		return err
	}
	if subjectOwner.UserId != userId {
		return ErrExternalIdentityAlreadyClaimed
	}

	var userClaim ExternalIdentityClaim
	if err := tx.Where("provider = ? AND user_id = ?", provider, userId).First(&userClaim).Error; err != nil {
		return err
	}
	if userClaim.Subject != subject {
		return ErrExternalIdentityAlreadyClaimed
	}
	return nil
}

// FindExternalIdentityOwner resolves the durable owner of a provider subject
// from external_identity_claims, the single ownership source. Soft-deleted
// owners are returned with DeletedAt set so callers can refuse to create a
// replacement account for an occupied subject. A subject without a claim (or
// whose owner row no longer exists) returns gorm.ErrRecordNotFound.
func FindExternalIdentityOwner(provider, subject string) (*User, error) {
	provider = strings.TrimSpace(provider)
	subject = strings.TrimSpace(subject)
	if provider == "" || subject == "" {
		return nil, gorm.ErrRecordNotFound
	}
	var claim ExternalIdentityClaim
	if err := DB.Where("provider = ? AND subject = ?", provider, subject).First(&claim).Error; err != nil {
		return nil, err
	}
	var owner User
	if err := DB.Unscoped().First(&owner, claim.UserId).Error; err != nil {
		return nil, err
	}
	return &owner, nil
}

// BindGoogleIdentityWithTx durably binds a Google subject to a user inside
// the caller's transaction: the claim and the users.google_sub compatibility
// mirror are written as one unit, so they can never diverge. Binding is not
// idempotent: a user that already holds any Google claim is rejected, and a
// subject owned by another user is rejected. The two unique indexes on the
// claim table enforce ownership even under concurrent binds; the slot lookup
// only distinguishes a rebind from a competing claim inside the same
// transaction.
//
// The target user is verified and locked inside the transaction before any
// claim is written, so a bind can never commit an orphan claim for a user
// that does not exist (or was deleted mid-flight). Ownership is proven by
// that locked read, never by the mirror UPDATE's RowsAffected, whose
// "value unchanged" semantics differ between the supported databases.
func BindGoogleIdentityWithTx(tx *gorm.DB, subject string, userId int) error {
	subject = strings.TrimSpace(subject)
	if tx == nil || subject == "" || userId == 0 {
		return errors.New("external identity claim is invalid")
	}
	var target User
	if err := lockForUpdate(tx).Where("id = ?", userId).First(&target).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("bind Google identity (provider=%s user=%d subject=%q): target user does not exist",
				ExternalIdentityProviderGoogle, userId, subject)
		}
		return err
	}
	var slot ExternalIdentityClaim
	err := tx.Where("provider = ? AND user_id = ?", ExternalIdentityProviderGoogle, userId).First(&slot).Error
	if err == nil {
		return ErrExternalIdentityAlreadyClaimed
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	if err := ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, subject, userId); err != nil {
		return err
	}
	if err := tx.Model(&User{}).Where("id = ?", userId).Update("google_sub", subject).Error; err != nil {
		return err
	}
	// The persisted mirror value, read back inside the same transaction, is
	// the contract: a silent zero-hit write (for example a skipped UPDATE)
	// must roll the claim back instead of committing a diverging mirror.
	// RowsAffected is deliberately not consulted, because an already-canonical
	// legacy mirror can legitimately report zero changed rows on some
	// supported databases. The read-back only verifies transaction
	// consistency; ownership stays exclusively in external_identity_claims.
	var persistedTarget User
	if err := tx.Where("id = ?", userId).First(&persistedTarget).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("bind Google identity (provider=%s user=%d subject=%q): target user disappeared before the mirror read-back",
				ExternalIdentityProviderGoogle, userId, subject)
		}
		return err
	}
	if persistedTarget.GoogleSub != subject {
		return fmt.Errorf("bind Google identity (provider=%s user=%d subject=%q): google_sub mirror was not persisted as %q",
			ExternalIdentityProviderGoogle, userId, subject, subject)
	}
	return nil
}

func ReleaseExternalIdentityWithTx(tx *gorm.DB, provider string, userId int) error {
	provider = strings.TrimSpace(provider)
	if tx == nil || provider == "" || userId == 0 {
		return errors.New("external identity release is invalid")
	}
	return tx.Where("provider = ? AND user_id = ?", provider, userId).
		Delete(&ExternalIdentityClaim{}).Error
}

func releaseAllExternalIdentitiesWithTx(tx *gorm.DB, userId int) error {
	if tx == nil || userId == 0 {
		return errors.New("external identity release is invalid")
	}
	return tx.Where("user_id = ?", userId).Delete(&ExternalIdentityClaim{}).Error
}

// InitializeExternalIdentityClaims imports legacy Telegram and Google
// bindings after the claim table is migrated. Every read (Unscoped user scans
// and the existing-claim audit input), every audit decision, all
// normalization writes and the whole backfill run inside one transaction, so
// a conflict or inconsistency fails the migration and rolls back the entire
// round: no partial claims and no half-normalized mirrors survive. Existing
// duplicate or conflicting ownership fails rather than preserving an
// ambiguous login identity; a successful run is idempotent on every later
// startup. Soft-deleted users are included so their subjects stay occupied.
func InitializeExternalIdentityClaims() error {
	return DB.Transaction(func(tx *gorm.DB) error {
		// LENGTH(column) > 0 is the cross-dialect "raw stored length" predicate.
		// MySQL PAD SPACE collations treat all-spaces as equal to '' under
		// equality/inequality, which would silently drop whitespace-only legacy
		// bindings from <> '' scans. LENGTH still sees the stored bytes/chars on
		// SQLite, MySQL 5.7, and PostgreSQL. Normalization and empty rejection
		// stay in Go (TrimSpace / claim contract), never in SQL TRIM.
		var telegramUsers []User
		if err := tx.Unscoped().Select("id", "telegram_id").
			Where("telegram_id IS NOT NULL AND LENGTH(telegram_id) > 0").
			Find(&telegramUsers).Error; err != nil {
			return err
		}
		var googleUsers []User
		if err := tx.Unscoped().Select("id", "google_sub").
			Where("google_sub IS NOT NULL AND LENGTH(google_sub) > 0").
			Find(&googleUsers).Error; err != nil {
			return err
		}
		var googleClaims []ExternalIdentityClaim
		if err := tx.Where("provider = ?", ExternalIdentityProviderGoogle).Find(&googleClaims).Error; err != nil {
			return err
		}

		for _, user := range telegramUsers {
			if err := ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderTelegram, user.TelegramId, user.Id); err != nil {
				return fmt.Errorf("backfill Telegram identity for user %d: %w", user.Id, err)
			}
		}
		for _, claim := range googleClaims {
			if err := auditGoogleIdentityClaimWithTx(tx, claim); err != nil {
				return err
			}
		}
		for _, user := range googleUsers {
			subject := strings.TrimSpace(user.GoogleSub)
			if subject == "" {
				return fmt.Errorf("%w: Google backfill (provider=%s user=%d subject=%q) found a blank google_sub",
					ErrExternalIdentityClaimInconsistent, ExternalIdentityProviderGoogle, user.Id, user.GoogleSub)
			}
			if err := ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderGoogle, subject, user.Id); err != nil {
				return fmt.Errorf("backfill Google identity for user %d: %w", user.Id, err)
			}
			if user.GoogleSub != subject {
				context := fmt.Sprintf("Google backfill (provider=%s user=%d subject=%q)",
					ExternalIdentityProviderGoogle, user.Id, subject)
				if err := normalizeGoogleSubMirrorWithTx(tx, user.Id, subject, context); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// normalizeGoogleSubMirrorWithTx persists the canonical google_sub mirror for
// an owner that was scanned or audited Unscoped, so soft-deleted owners are
// normalized exactly like live ones. The write is Unscoped for the same
// reason the surrounding scan is: a soft-deleted owner still occupies the
// identity and must stay consistent with its claim.
//
// Success is defined by the persisted value, read back Unscoped by user id
// inside the same transaction, never by RowsAffected: the backfill iterates a
// transaction-start snapshot and can legitimately re-issue an update whose
// canonical value the audit already persisted, and an unchanged-value UPDATE
// may report zero affected rows on MySQL deployments without clientFoundRows.
// A read-back that shows anything other than the canonical subject (or a
// vanished owner) fails the whole round with context. The read-back only
// verifies claim/mirror consistency; identity ownership stays exclusively in
// external_identity_claims.
func normalizeGoogleSubMirrorWithTx(tx *gorm.DB, userId int, subject string, context string) error {
	if err := tx.Unscoped().Model(&User{}).Where("id = ?", userId).Update("google_sub", subject).Error; err != nil {
		return err
	}
	var persisted User
	if err := tx.Unscoped().First(&persisted, userId).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("%w: %s owner disappeared before the mirror read-back",
				ErrExternalIdentityClaimInconsistent, context)
		}
		return err
	}
	if persisted.GoogleSub != subject {
		return fmt.Errorf("%w: %s owner google_sub was not persisted as %q",
			ErrExternalIdentityClaimInconsistent, context, subject)
	}
	return nil
}

// auditGoogleIdentityClaimWithTx reconciles one pre-existing Google claim
// with its owner inside the migration transaction. The claim stays the single
// ownership source: the audit never derives ownership from the mirror, it
// only requires the owner's google_sub mirror to agree with the claim after
// TrimSpace. When both sides agree, both are persisted with the identical
// canonical value; a missing owner, a blank subject, a blank mirror or a
// diverging mirror fails the whole migration round with provider/user/subject
// context.
func auditGoogleIdentityClaimWithTx(tx *gorm.DB, claim ExternalIdentityClaim) error {
	subject := strings.TrimSpace(claim.Subject)
	context := fmt.Sprintf("Google identity claim (provider=%s user=%d subject=%q)",
		ExternalIdentityProviderGoogle, claim.UserId, claim.Subject)
	if subject == "" {
		return fmt.Errorf("%w: %s has a blank subject", ErrExternalIdentityClaimInconsistent, context)
	}
	var owner User
	if err := tx.Unscoped().First(&owner, claim.UserId).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("%w: %s owner does not exist", ErrExternalIdentityClaimInconsistent, context)
		}
		return err
	}
	mirror := strings.TrimSpace(owner.GoogleSub)
	if mirror == "" {
		return fmt.Errorf("%w: %s has no google_sub mirror on its owner", ErrExternalIdentityClaimInconsistent, context)
	}
	if mirror != subject {
		return fmt.Errorf("%w: %s conflicts with owner google_sub %q", ErrExternalIdentityClaimInconsistent, context, owner.GoogleSub)
	}
	if claim.Subject != subject {
		if err := tx.Model(&ExternalIdentityClaim{}).Where("id = ?", claim.Id).Update("subject", subject).Error; err != nil {
			return err
		}
	}
	// Read the persisted claim back by primary key inside the same
	// transaction: a silent zero-hit subject UPDATE (an error-free write that
	// touches no row) must fail the round before the mirror is normalized,
	// never commit a half-normalized pair. The read-back must match the
	// audited claim exactly; a lookup by canonical subject alone could accept
	// another owner's record.
	var persisted ExternalIdentityClaim
	if err := tx.First(&persisted, claim.Id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("%w: %s disappeared during subject normalization", ErrExternalIdentityClaimInconsistent, context)
		}
		return err
	}
	if persisted.Provider != claim.Provider || persisted.UserId != claim.UserId || persisted.Subject != subject {
		return fmt.Errorf("%w: %s was not persisted as canonical subject %q", ErrExternalIdentityClaimInconsistent, context, subject)
	}
	if owner.GoogleSub != subject {
		if err := normalizeGoogleSubMirrorWithTx(tx, owner.Id, subject, context); err != nil {
			return err
		}
	}
	return nil
}
