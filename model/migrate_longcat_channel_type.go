package model

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// legacyLongcatChannelType is the channel type that meant LongCat on the
// production main branch before the rc23 upgrade. Upstream rc23 reuses
// type 58 for Advanced Custom, and Vancine rc23 moves LongCat to
// constant.ChannelTypeLongcat. This constant only expresses the legacy
// pre-upgrade semantics and must never be used for request routing.
const legacyLongcatChannelType = 58

// The one-time migration persists a completion marker into the options table.
// The committed marker is always exactly this key/value pair; once present, no
// later startup may touch type=58 channels again, so post-upgrade Advanced
// Custom channels are never misidentified as LongCat.
const (
	longcatChannelTypeMigrationOptionKey      = "migration.longcat_channel_type_58_to_100.v1"
	longcatChannelTypeMigrationCompletedValue = "completed"
)

// longcatChannelTypeMigrationClaimPrefix prefixes the per-invocation owner
// token, so an in-flight claim value can never collide with the final
// "completed" value.
const longcatChannelTypeMigrationClaimPrefix = "claim-"

// MigrateLongcatChannelType moves every legacy type=58 channel to
// constant.ChannelTypeLongcat exactly once. It must run after the Channel and
// Option tables finished AutoMigrate, both in migrateDB and migrateDBFast.
// Any failure is returned so the startup migration aborts instead of leaving
// a half-migrated database.
func MigrateLongcatChannelType() error {
	return migrateLongcatChannelType(DB)
}

// newLongcatMigrationOwnerToken returns a unique token identifying this
// invocation's ownership claim on the migration marker.
func newLongcatMigrationOwnerToken() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return longcatChannelTypeMigrationClaimPrefix + hex.EncodeToString(buf), nil
}

// longcatMigrationOutcome reports whether this invocation owned and executed
// the migration and how many channels it moved.
type longcatMigrationOutcome struct {
	owned bool
	rows  int64
}

// migrateLongcatChannelType is the shared LongCat legacy migration used by the
// startup wrapper (on the global DB) and by the migration tests (on isolated
// per-database fixtures).
//
// The whole migration runs in ONE transaction: insert an uncommitted claim
// marker holding a unique owner token -> prove ownership with a locked
// current read -> migrate the channels -> set the marker to "completed" ->
// commit once.
//
// The claim INSERT is deliberately the first statement of the transaction.
// Any plain SELECT before it would establish the transaction's consistent
// read view under MySQL REPEATABLE READ, and every later plain read of the
// marker would keep returning that stale view (e.g. "record not found") even
// after a competing winner commits. The ownership read after the INSERT goes
// through lockForUpdate, which is a current read on MySQL and PostgreSQL: it
// bypasses any MVCC snapshot, serializes competing claimers on the marker
// row, and shows the winner's committed "completed" state to the loser as
// soon as the loser's claim INSERT unblocks.
//
// Ownership is proven by comparing the read-back value with this call's
// token, never by INSERT RowsAffected, whose semantics differ across
// drivers and DSN flags (e.g. MySQL clientFoundRows). Losing instances and
// restarts that observe "completed" exit without ever updating channels. Any
// failure rolls the claim, the channel updates and the marker back together.
func migrateLongcatChannelType(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	ownerToken, err := newLongcatMigrationOwnerToken()
	if err != nil {
		return err
	}

	var outcome longcatMigrationOutcome
	err = db.Transaction(func(tx *gorm.DB) error {
		runOutcome, runErr := claimAndRunLongcatChannelTypeMigration(tx, ownerToken)
		if runErr != nil {
			return runErr
		}
		outcome = runOutcome
		return nil
	})
	if err != nil {
		return err
	}

	if outcome.owned {
		common.SysLog(fmt.Sprintf("LongCat legacy channel migration completed: %d channel(s) moved from type %d to type %d, marker completed", outcome.rows, legacyLongcatChannelType, constant.ChannelTypeLongcat))
	}
	return nil
}

// claimAndRunLongcatChannelTypeMigration executes the claim-then-migrate
// sequence inside the caller's transaction. The transaction commits only after
// the marker holds "completed"; every earlier state (missing marker, claim
// token) is invisible to other transactions and disappears on rollback.
func claimAndRunLongcatChannelTypeMigration(tx *gorm.DB, ownerToken string) (longcatMigrationOutcome, error) {
	// Claim ownership first: the INSERT is the transaction's first statement
	// on purpose, so no plain SELECT can establish a stale consistent
	// snapshot for the marker before the race is decided (MySQL REPEATABLE
	// READ). Concurrent claimers conflict on the primary key: one inserts,
	// the others wait on the uncommitted row and resolve to a no-op once the
	// winner commits.
	claim := Option{Key: longcatChannelTypeMigrationOptionKey, Value: ownerToken}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&claim).Error; err != nil {
		return longcatMigrationOutcome{}, err
	}

	// Decide ownership with a locked CURRENT read (SELECT ... FOR UPDATE on
	// MySQL/PostgreSQL via lockForUpdate; SQLite has no locking syntax and
	// serializes writers instead). The row must exist now: either this call
	// just inserted it or a committed competitor did.
	var marker Option
	if err := lockForUpdate(tx).
		Where(&Option{Key: longcatChannelTypeMigrationOptionKey}).
		First(&marker).Error; err != nil {
		return longcatMigrationOutcome{}, err
	}
	switch marker.Value {
	case ownerToken:
		// Ownership acquired; continue below.
	case longcatChannelTypeMigrationCompletedValue:
		// A concurrent owner finished and committed while this invocation
		// waited on its claim row. The migration already happened; exit
		// without touching any channel.
		return longcatMigrationOutcome{}, nil
	default:
		return longcatMigrationOutcome{}, fmt.Errorf("longcat channel type migration found an unexpected marker value for %s", longcatChannelTypeMigrationOptionKey)
	}

	// Migrate every legacy channel while the claim row is still uncommitted,
	// so no other startup can claim or complete the migration in between.
	result := tx.Model(&Channel{}).
		Where("type = ?", legacyLongcatChannelType).
		Update("type", constant.ChannelTypeLongcat)
	if result.Error != nil {
		return longcatMigrationOutcome{}, result.Error
	}

	// Finalize the marker to "completed", strictly scoped to this call's own
	// claim row, and require exactly one updated row.
	finalize := tx.Model(&Option{}).
		Where(&Option{Key: longcatChannelTypeMigrationOptionKey, Value: ownerToken}).
		Update("value", longcatChannelTypeMigrationCompletedValue)
	if finalize.Error != nil {
		return longcatMigrationOutcome{}, finalize.Error
	}
	if finalize.RowsAffected != 1 {
		return longcatMigrationOutcome{}, fmt.Errorf("longcat channel type migration marker finalization updated %d row(s), expected exactly 1", finalize.RowsAffected)
	}

	return longcatMigrationOutcome{owned: true, rows: result.RowsAffected}, nil
}
