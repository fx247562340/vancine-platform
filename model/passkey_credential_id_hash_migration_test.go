package model

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// passkeyV1026Fixture mirrors the pre-hash PasskeyCredential schema that ships
// uniqueIndex on credential_id varchar(512). Used only to seed upgrade rows.
type passkeyV1026Fixture struct {
	ID              int            `gorm:"primaryKey"`
	UserID          int            `gorm:"uniqueIndex;not null"`
	CredentialID    string         `gorm:"type:varchar(512);uniqueIndex;not null"`
	PublicKey       string         `gorm:"type:text;not null"`
	AttestationType string         `gorm:"type:varchar(255)"`
	AAGUID          string         `gorm:"type:varchar(512)"`
	SignCount       uint32         `gorm:"default:0"`
	CloneWarning    bool           `gorm:""`
	UserPresent     bool           `gorm:""`
	UserVerified    bool           `gorm:""`
	BackupEligible  bool           `gorm:""`
	BackupState     bool           `gorm:""`
	Transports      string         `gorm:"type:text"`
	Attachment      string         `gorm:"type:varchar(32)"`
	LastUsedAt      *time.Time     `gorm:""`
	CreatedAt       time.Time      `gorm:""`
	UpdatedAt       time.Time      `gorm:""`
	DeletedAt       gorm.DeletedAt `gorm:"index"`
}

func (passkeyV1026Fixture) TableName() string { return "passkey_credentials" }

func openPasskeyHashMigrationDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	t.Cleanup(func() {
		assert.NoError(t, sqlDB.Close())
	})
	// Keep database-type flag aligned with the connection for index inspection.
	prevMain, prevLog := common.MainDatabaseType(), common.LogDatabaseType()
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		common.SetDatabaseTypes(prevMain, prevLog)
	})
	return db
}

func withPasskeyHashTestDB(t *testing.T, db *gorm.DB) {
	t.Helper()
	prevDB, prevLogDB := DB, LOG_DB
	DB, LOG_DB = db, db
	t.Cleanup(func() {
		DB, LOG_DB = prevDB, prevLogDB
	})
}

func expectedPasskeyCredentialIDHash(credentialID string) string {
	sum := sha256.Sum256([]byte(credentialID))
	return hex.EncodeToString(sum[:])
}

func assertPasskeyHashIndexShape(t *testing.T, db *gorm.DB) {
	t.Helper()
	found, info, err := inspectPasskeyCredentialIDHashIndex(db)
	require.NoError(t, err)
	require.True(t, found, "idx_passkey_cred_id_hash must exist")
	require.Equal(t, passkeyCredentialIDHashIndexName, info.Name)
	require.True(t, info.Unique, "hash index must be UNIQUE")
	require.Equal(t, []string{"credential_id_hash"}, info.Columns)
}

func listPasskeyIndexes(t *testing.T, db *gorm.DB) map[string][]string {
	t.Helper()
	sqlDB, err := db.DB()
	require.NoError(t, err)
	rows, err := sqlDB.Query(`PRAGMA index_list('passkey_credentials')`)
	require.NoError(t, err)
	defer func() { assert.NoError(t, rows.Close()) }()

	type meta struct {
		name   string
		unique int
	}
	var metas []meta
	for rows.Next() {
		var seq int
		var name string
		var unique int
		var origin string
		var partial int
		require.NoError(t, rows.Scan(&seq, &name, &unique, &origin, &partial))
		metas = append(metas, meta{name: name, unique: unique})
	}
	require.NoError(t, rows.Err())

	out := make(map[string][]string, len(metas))
	for _, m := range metas {
		infoRows, err := sqlDB.Query(fmt.Sprintf(`PRAGMA index_info(%q)`, m.name))
		require.NoError(t, err)
		type col struct {
			seqno int
			name  string
		}
		var cols []col
		for infoRows.Next() {
			var seqno, cid int
			var name string
			require.NoError(t, infoRows.Scan(&seqno, &cid, &name))
			cols = append(cols, col{seqno: seqno, name: name})
		}
		require.NoError(t, infoRows.Err())
		require.NoError(t, infoRows.Close())
		for i := 0; i < len(cols); i++ {
			for j := i + 1; j < len(cols); j++ {
				if cols[j].seqno < cols[i].seqno {
					cols[i], cols[j] = cols[j], cols[i]
				}
			}
		}
		names := make([]string, 0, len(cols)+1)
		if m.unique == 1 {
			names = append(names, "UNIQUE")
		}
		for _, c := range cols {
			names = append(names, c.name)
		}
		out[m.name] = names
	}
	return out
}

func passkeyIndexOnColumn(indexes map[string][]string, column string, uniqueOnly bool) []string {
	var hits []string
	for name, cols := range indexes {
		unique := false
		body := cols
		if len(cols) > 0 && cols[0] == "UNIQUE" {
			unique = true
			body = cols[1:]
		}
		if uniqueOnly && !unique {
			continue
		}
		for _, c := range body {
			if c == column {
				hits = append(hits, name)
				break
			}
		}
	}
	return hits
}

func seedLegacyPasskeyRows(t *testing.T, db *gorm.DB) (liveID, deletedID int) {
	t.Helper()
	require.NoError(t, db.AutoMigrate(&passkeyV1026Fixture{}))
	live := passkeyV1026Fixture{
		UserID:       101,
		CredentialID: base64.StdEncoding.EncodeToString([]byte("legacy-live-credential")),
		PublicKey:    base64.StdEncoding.EncodeToString([]byte("live-public-key")),
	}
	deleted := passkeyV1026Fixture{
		UserID:       102,
		CredentialID: base64.StdEncoding.EncodeToString([]byte("legacy-deleted-credential")),
		PublicKey:    base64.StdEncoding.EncodeToString([]byte("deleted-public-key")),
	}
	require.NoError(t, db.Create(&live).Error)
	require.NoError(t, db.Create(&deleted).Error)
	require.NoError(t, db.Delete(&deleted).Error)
	return live.ID, deleted.ID
}

func TestPasskeyCredentialIDHashFreshSchemaHasShortHashUniqueOnly(t *testing.T) {
	db := openPasskeyHashMigrationDB(t)
	withPasskeyHashTestDB(t, db)
	require.NoError(t, db.AutoMigrate(&PasskeyCredential{}))
	require.NoError(t, InitializePasskeyCredentialIDHashes())

	assertPasskeyHashIndexShape(t, db)

	indexes := listPasskeyIndexes(t, db)
	credUnique := passkeyIndexOnColumn(indexes, "credential_id", true)
	for _, name := range credUnique {
		assert.NotEqual(t, "idx_passkey_credentials_credential_id", name,
			"fresh install must not create the legacy long credential_id unique index")
		cols := indexes[name]
		body := cols
		if len(body) > 0 && body[0] == "UNIQUE" {
			body = body[1:]
		}
		assert.NotEqual(t, []string{"credential_id"}, body,
			"fresh install must not uniquely index credential_id alone")
	}
}

func TestPasskeyCredentialIDHashUpgradeBackfillsLiveAndSoftDeleted(t *testing.T) {
	db := openPasskeyHashMigrationDB(t)
	liveID, deletedID := seedLegacyPasskeyRows(t, db)
	withPasskeyHashTestDB(t, db)

	pre := listPasskeyIndexes(t, db)
	require.NotEmpty(t, passkeyIndexOnColumn(pre, "credential_id", true),
		"legacy fixture must create a unique index on credential_id")

	require.NoError(t, db.AutoMigrate(&PasskeyCredential{}))
	require.NoError(t, InitializePasskeyCredentialIDHashes())

	var live PasskeyCredential
	require.NoError(t, db.Unscoped().First(&live, liveID).Error)
	assert.Equal(t, expectedPasskeyCredentialIDHash(live.CredentialID), live.CredentialIDHash)
	assert.Len(t, live.CredentialIDHash, 64)
	assert.Equal(t, live.CredentialIDHash, strings.ToLower(live.CredentialIDHash))

	var deleted PasskeyCredential
	require.NoError(t, db.Unscoped().First(&deleted, deletedID).Error)
	assert.Equal(t, expectedPasskeyCredentialIDHash(deleted.CredentialID), deleted.CredentialIDHash)

	assertPasskeyHashIndexShape(t, db)
}

func TestPasskeyCredentialIDHashRestartIdempotent(t *testing.T) {
	db := openPasskeyHashMigrationDB(t)
	liveID, deletedID := seedLegacyPasskeyRows(t, db)
	withPasskeyHashTestDB(t, db)

	require.NoError(t, db.AutoMigrate(&PasskeyCredential{}))
	require.NoError(t, InitializePasskeyCredentialIDHashes())
	require.NoError(t, InitializePasskeyCredentialIDHashes())

	var live PasskeyCredential
	require.NoError(t, db.Unscoped().First(&live, liveID).Error)
	assert.Equal(t, expectedPasskeyCredentialIDHash(live.CredentialID), live.CredentialIDHash)
	var deleted PasskeyCredential
	require.NoError(t, db.Unscoped().First(&deleted, deletedID).Error)
	assert.Equal(t, expectedPasskeyCredentialIDHash(deleted.CredentialID), deleted.CredentialIDHash)

	assertPasskeyHashIndexShape(t, db)
	indexes := listPasskeyIndexes(t, db)
	assert.Len(t, passkeyIndexOnColumn(indexes, "credential_id_hash", true), 1,
		"restart must leave exactly one hash unique index")
}

func TestPasskeyCredentialIDHashRepairsMissingAndWrongValues(t *testing.T) {
	db := openPasskeyHashMigrationDB(t)
	withPasskeyHashTestDB(t, db)
	require.NoError(t, db.AutoMigrate(&User{}, &PasskeyCredential{}))

	user := User{Username: "passkey-hash-repair", Password: "password", AffCode: "pk-hash-repair"}
	require.NoError(t, db.Create(&user).Error)

	credID := base64.StdEncoding.EncodeToString([]byte("repair-credential"))
	require.NoError(t, db.Exec(
		`INSERT INTO passkey_credentials (user_id, credential_id, public_key, credential_id_hash, created_at, updated_at)
		 VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
		user.Id, credID, "pk", nil,
	).Error)
	var staged PasskeyCredential
	require.NoError(t, db.Where("user_id = ?", user.Id).First(&staged).Error)
	require.Equal(t, "", staged.CredentialIDHash)

	require.NoError(t, InitializePasskeyCredentialIDHashes())
	require.NoError(t, db.First(&staged, staged.ID).Error)
	assert.Equal(t, expectedPasskeyCredentialIDHash(credID), staged.CredentialIDHash)

	require.NoError(t, db.Model(&PasskeyCredential{}).Where("id = ?", staged.ID).
		Update("credential_id_hash", strings.Repeat("ab", 32)).Error)
	require.NoError(t, InitializePasskeyCredentialIDHashes())
	require.NoError(t, db.First(&staged, staged.ID).Error)
	assert.Equal(t, expectedPasskeyCredentialIDHash(credID), staged.CredentialIDHash)
}

func TestPasskeyCredentialIDHashCreateLookupAndAssertion(t *testing.T) {
	truncateTables(t)

	user := User{Username: "passkey-hash-live", Password: "password", AffCode: "pk-hash-live", AuthVersion: 1}
	require.NoError(t, DB.Create(&user).Error)

	rawID := []byte{0x01, 0x02, 0x03, 0xde, 0xad, 0xbe, 0xef, 0xff}
	waCred := &webauthn.Credential{
		ID:              rawID,
		PublicKey:       []byte("cose-public-key-bytes"),
		AttestationType: "none",
		Transport:       []protocol.AuthenticatorTransport{protocol.USB},
		Flags: webauthn.CredentialFlags{
			UserPresent:  true,
			UserVerified: true,
		},
		Authenticator: webauthn.Authenticator{
			AAGUID:    []byte("aaguid-bytes-here"),
			SignCount: 1,
		},
	}
	created := NewPasskeyCredentialFromWebAuthn(user.Id, waCred)
	require.NotNil(t, created)
	assert.Equal(t, expectedPasskeyCredentialIDHash(created.CredentialID), created.CredentialIDHash)
	require.NoError(t, UpsertPasskeyCredentialWithAuthVersion(created))

	var stored PasskeyCredential
	require.NoError(t, DB.Where("user_id = ?", user.Id).First(&stored).Error)
	assert.Equal(t, expectedPasskeyCredentialIDHash(stored.CredentialID), stored.CredentialIDHash)
	assert.Equal(t, base64.StdEncoding.EncodeToString(rawID), stored.CredentialID)

	found, err := GetPasskeyByCredentialID(rawID)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, stored.ID, found.ID)
	assert.Equal(t, stored.CredentialID, found.CredentialID)

	usedAt := time.Now().UTC().Truncate(time.Second)
	waCred.Authenticator.SignCount = 9
	waCred.Flags.BackupState = true
	require.NoError(t, UpdatePasskeyAssertionState(user.Id, waCred, usedAt))

	var after PasskeyCredential
	require.NoError(t, DB.First(&after, stored.ID).Error)
	assert.EqualValues(t, 9, after.SignCount)
	assert.True(t, after.BackupState)
	assert.Equal(t, stored.CredentialID, after.CredentialID)
	assert.Equal(t, stored.CredentialIDHash, after.CredentialIDHash)
	require.NotNil(t, after.LastUsedAt)
	assert.Equal(t, usedAt.Unix(), after.LastUsedAt.Unix())
}

func TestPasskeyCredentialIDHashLookupFailClosedOnCollision(t *testing.T) {
	truncateTables(t)

	user := User{Username: "passkey-hash-collision", Password: "password", AffCode: "pk-hash-coll", AuthVersion: 1}
	require.NoError(t, DB.Create(&user).Error)

	rawID := []byte("collision-lookup-id")
	credID := base64.StdEncoding.EncodeToString(rawID)
	hash := expectedPasskeyCredentialIDHash(credID)
	require.NoError(t, DB.Exec(
		`INSERT INTO passkey_credentials (user_id, credential_id, public_key, credential_id_hash, created_at, updated_at)
		 VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
		user.Id, base64.StdEncoding.EncodeToString([]byte("different-credential-id")), "pk", hash,
	).Error)

	found, err := GetPasskeyByCredentialID(rawID)
	assert.Nil(t, found)
	assert.ErrorIs(t, err, ErrFriendlyPasskeyNotFound)
}

func TestPasskeyCredentialIDHashDuplicateCredentialFailsClosed(t *testing.T) {
	db := openPasskeyHashMigrationDB(t)
	withPasskeyHashTestDB(t, db)
	require.NoError(t, db.AutoMigrate(&PasskeyCredential{}))

	dup := base64.StdEncoding.EncodeToString([]byte("duplicate-cred"))
	require.NoError(t, db.Exec(
		`INSERT INTO passkey_credentials (user_id, credential_id, public_key, credential_id_hash, created_at, updated_at)
		 VALUES (1, ?, 'pk', NULL, datetime('now'), datetime('now'))`, dup,
	).Error)
	require.NoError(t, db.Exec(
		`INSERT INTO passkey_credentials (user_id, credential_id, public_key, credential_id_hash, created_at, updated_at)
		 VALUES (2, ?, 'pk', NULL, datetime('now'), datetime('now'))`, dup,
	).Error)

	err := InitializePasskeyCredentialIDHashes()
	require.Error(t, err, "duplicate credential_id rows must fail the hash backfill closed")

	var rows []PasskeyCredential
	require.NoError(t, db.Unscoped().Order("id").Find(&rows).Error)
	require.Len(t, rows, 2)
	assert.Equal(t, "", rows[0].CredentialIDHash, "failed round must leave zero half-backfill")
	assert.Equal(t, "", rows[1].CredentialIDHash, "failed round must leave zero half-backfill")
	// Preflight fails before index creation, so the unique index must be absent.
	found, _, err := inspectPasskeyCredentialIDHashIndex(db)
	require.NoError(t, err)
	assert.False(t, found, "failed preflight must not install the hash unique index")
}

func TestPasskeyCredentialIDHashJSONOmitsInternalHash(t *testing.T) {
	cred := PasskeyCredential{
		UserID:           1,
		CredentialID:     base64.StdEncoding.EncodeToString([]byte("json-cred")),
		CredentialIDHash: expectedPasskeyCredentialIDHash(base64.StdEncoding.EncodeToString([]byte("json-cred"))),
		PublicKey:        "pk",
	}
	encoded, err := common.Marshal(cred)
	require.NoError(t, err)
	body := string(encoded)
	assert.NotContains(t, body, "credential_id_hash")
	assert.NotContains(t, body, cred.CredentialIDHash)
	assert.Contains(t, body, "credential_id")
}

// TestPasskeyCredentialIDHashSwappedHashesTwoPhaseRepair protects the order
// dependency fix: with a correct unique index already present, two rows whose
// hashes are swapped must succeed via NULL-then-canonical in one DML transaction.
func TestPasskeyCredentialIDHashSwappedHashesTwoPhaseRepair(t *testing.T) {
	db := openPasskeyHashMigrationDB(t)
	withPasskeyHashTestDB(t, db)
	require.NoError(t, db.AutoMigrate(&PasskeyCredential{}))
	require.NoError(t, ensurePasskeyCredentialIDHashUniqueIndex(db))
	assertPasskeyHashIndexShape(t, db)

	credA := base64.StdEncoding.EncodeToString([]byte("swap-cred-a"))
	credB := base64.StdEncoding.EncodeToString([]byte("swap-cred-b"))
	hashA := expectedPasskeyCredentialIDHash(credA)
	hashB := expectedPasskeyCredentialIDHash(credB)

	// Stage swapped hashes under the correct unique index.
	require.NoError(t, db.Exec(
		`INSERT INTO passkey_credentials (user_id, credential_id, public_key, credential_id_hash, created_at, updated_at)
		 VALUES (1, ?, 'pk', ?, datetime('now'), datetime('now'))`, credA, hashB,
	).Error)
	require.NoError(t, db.Exec(
		`INSERT INTO passkey_credentials (user_id, credential_id, public_key, credential_id_hash, created_at, updated_at)
		 VALUES (2, ?, 'pk', ?, datetime('now'), datetime('now'))`, credB, hashA,
	).Error)

	// Direct one-shot canonical update of the first row collides with the second
	// row's current hash — this is the RED shape the two-phase repair solves.
	err := db.Exec(
		`UPDATE passkey_credentials SET credential_id_hash = ? WHERE credential_id = ?`,
		hashA, credA,
	).Error
	require.Error(t, err, "direct single-row canonicalization of swapped hashes must hit the unique index")

	require.NoError(t, InitializePasskeyCredentialIDHashes())

	var rows []PasskeyCredential
	require.NoError(t, db.Unscoped().Order("user_id").Find(&rows).Error)
	require.Len(t, rows, 2)
	assert.Equal(t, hashA, rows[0].CredentialIDHash)
	assert.Equal(t, hashB, rows[1].CredentialIDHash)
}

// TestPasskeyCredentialIDHashDMLTransactionRollbackOnSecondWrite proves a mid-
// transaction failure rolls back the first hash clear/write (no half state).
func TestPasskeyCredentialIDHashDMLTransactionRollbackOnSecondWrite(t *testing.T) {
	db := openPasskeyHashMigrationDB(t)
	withPasskeyHashTestDB(t, db)
	require.NoError(t, db.AutoMigrate(&PasskeyCredential{}))
	require.NoError(t, ensurePasskeyCredentialIDHashUniqueIndex(db))

	credA := base64.StdEncoding.EncodeToString([]byte("tx-cred-a"))
	credB := base64.StdEncoding.EncodeToString([]byte("tx-cred-b"))
	wrongA := strings.Repeat("11", 32)
	wrongB := strings.Repeat("22", 32)
	require.NoError(t, db.Exec(
		`INSERT INTO passkey_credentials (id, user_id, credential_id, public_key, credential_id_hash, created_at, updated_at)
		 VALUES (1, 1, ?, 'pk', ?, datetime('now'), datetime('now'))`, credA, wrongA,
	).Error)
	require.NoError(t, db.Exec(
		`INSERT INTO passkey_credentials (id, user_id, credential_id, public_key, credential_id_hash, created_at, updated_at)
		 VALUES (2, 2, ?, 'pk', ?, datetime('now'), datetime('now'))`, credB, wrongB,
	).Error)

	// Abort any UPDATE that targets row id=2 after the clear/write path reaches it.
	require.NoError(t, db.Exec(`
CREATE TRIGGER passkey_hash_block_id2
BEFORE UPDATE ON passkey_credentials
FOR EACH ROW
WHEN NEW.id = 2
BEGIN
  SELECT RAISE(ABORT, 'injected second-row update failure');
END;
`).Error)
	t.Cleanup(func() {
		err := db.Exec(`DROP TRIGGER IF EXISTS passkey_hash_block_id2`).Error
		assert.NoError(t, err, "trigger cleanup must succeed")
		var n int
		require.NoError(t, db.Raw(
			`SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name='passkey_hash_block_id2'`,
		).Scan(&n).Error)
		assert.Zero(t, n, "trigger must be gone after cleanup")
	})

	err := InitializePasskeyCredentialIDHashes()
	require.Error(t, err, "second-row trigger must fail the DML transaction")

	var rows []PasskeyCredential
	require.NoError(t, db.Unscoped().Order("id").Find(&rows).Error)
	require.Len(t, rows, 2)
	assert.Equal(t, wrongA, rows[0].CredentialIDHash, "first-row clear/write must roll back")
	assert.Equal(t, wrongB, rows[1].CredentialIDHash, "second-row must remain unchanged")
}

// TestPasskeyCredentialIDHashRejectsSameNameNonUniqueIndex fails closed when a
// same-name non-unique index already exists, without writing any hash values.
func TestPasskeyCredentialIDHashRejectsSameNameNonUniqueIndex(t *testing.T) {
	db := openPasskeyHashMigrationDB(t)
	withPasskeyHashTestDB(t, db)
	require.NoError(t, db.AutoMigrate(&PasskeyCredential{}))

	credID := base64.StdEncoding.EncodeToString([]byte("nonuniq-cred"))
	require.NoError(t, db.Exec(
		`INSERT INTO passkey_credentials (user_id, credential_id, public_key, credential_id_hash, created_at, updated_at)
		 VALUES (1, ?, 'pk', NULL, datetime('now'), datetime('now'))`, credID,
	).Error)
	require.NoError(t, db.Exec(
		`CREATE INDEX idx_passkey_cred_id_hash ON passkey_credentials (credential_id_hash)`,
	).Error)

	// Structural inspect must see non-unique.
	found, info, err := inspectPasskeyCredentialIDHashIndex(db)
	require.NoError(t, err)
	require.True(t, found)
	require.False(t, info.Unique)

	err = InitializePasskeyCredentialIDHashes()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not UNIQUE")

	var row PasskeyCredential
	require.NoError(t, db.Unscoped().First(&row).Error)
	assert.Equal(t, "", row.CredentialIDHash, "wrong index must block all hash writes")
}

// TestPasskeyCredentialIDHashRejectsSameNameWrongColumnUniqueIndex fails closed
// when a same-name unique index points at the wrong column.
func TestPasskeyCredentialIDHashRejectsSameNameWrongColumnUniqueIndex(t *testing.T) {
	db := openPasskeyHashMigrationDB(t)
	withPasskeyHashTestDB(t, db)
	require.NoError(t, db.AutoMigrate(&PasskeyCredential{}))

	credID := base64.StdEncoding.EncodeToString([]byte("wrongcol-cred"))
	require.NoError(t, db.Exec(
		`INSERT INTO passkey_credentials (user_id, credential_id, public_key, credential_id_hash, created_at, updated_at)
		 VALUES (1, ?, 'pk', NULL, datetime('now'), datetime('now'))`, credID,
	).Error)
	// Unique on user_id under the hash index name — wrong column.
	require.NoError(t, db.Exec(
		`CREATE UNIQUE INDEX idx_passkey_cred_id_hash ON passkey_credentials (user_id)`,
	).Error)

	found, info, err := inspectPasskeyCredentialIDHashIndex(db)
	require.NoError(t, err)
	require.True(t, found)
	require.True(t, info.Unique)
	require.Equal(t, []string{"user_id"}, info.Columns)

	err = InitializePasskeyCredentialIDHashes()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "UNIQUE(credential_id_hash)")

	var row PasskeyCredential
	require.NoError(t, db.Unscoped().First(&row).Error)
	assert.Equal(t, "", row.CredentialIDHash, "wrong-column index must block all hash writes")
}

// dropPasskeyHashTrigger removes a named SQLite trigger and asserts it is gone.
func dropPasskeyHashTrigger(t *testing.T, db *gorm.DB, name string) {
	t.Helper()
	require.NoError(t, db.Exec(`DROP TRIGGER IF EXISTS `+name).Error,
		"trigger cleanup must succeed for %s", name)
	var n int
	require.NoError(t, db.Raw(
		`SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name=?`, name,
	).Scan(&n).Error)
	require.Zero(t, n, "trigger %s must be gone after cleanup", name)
}

func seedTwoNonCanonicalPasskeys(t *testing.T, db *gorm.DB) (credA, credB, wrongA, wrongB string) {
	t.Helper()
	credA = base64.StdEncoding.EncodeToString([]byte("fc-cred-a"))
	credB = base64.StdEncoding.EncodeToString([]byte("fc-cred-b"))
	wrongA = strings.Repeat("11", 32)
	wrongB = strings.Repeat("22", 32)
	require.NoError(t, db.Exec(
		`INSERT INTO passkey_credentials (id, user_id, credential_id, public_key, credential_id_hash, created_at, updated_at)
		 VALUES (1, 1, ?, 'pk', ?, datetime('now'), datetime('now'))`, credA, wrongA,
	).Error)
	require.NoError(t, db.Exec(
		`INSERT INTO passkey_credentials (id, user_id, credential_id, public_key, credential_id_hash, created_at, updated_at)
		 VALUES (2, 2, ?, 'pk', ?, datetime('now'), datetime('now'))`, credB, wrongB,
	).Error)
	return credA, credB, wrongA, wrongB
}

func assertPasskeyHashesUnchanged(t *testing.T, db *gorm.DB, wrongA, wrongB string) {
	t.Helper()
	var rows []PasskeyCredential
	require.NoError(t, db.Unscoped().Order("id").Find(&rows).Error)
	require.Len(t, rows, 2)
	assert.Equal(t, wrongA, rows[0].CredentialIDHash)
	assert.Equal(t, wrongB, rows[1].CredentialIDHash)
}

// TestPasskeyCredentialIDHashPhase1SilentZeroHitFailsClosed covers a silent
// zero-hit clear: SQLite RAISE(IGNORE) skips NULL-ing updates without surfacing
// a driver error. Production must fail on read-back ("not cleared to NULL") and
// roll back so every hash stays at its pre-transaction value.
func TestPasskeyCredentialIDHashPhase1SilentZeroHitFailsClosed(t *testing.T) {
	db := openPasskeyHashMigrationDB(t)
	withPasskeyHashTestDB(t, db)
	require.NoError(t, db.AutoMigrate(&PasskeyCredential{}))
	require.NoError(t, ensurePasskeyCredentialIDHashUniqueIndex(db))
	assertPasskeyHashIndexShape(t, db)

	_, _, wrongA, wrongB := seedTwoNonCanonicalPasskeys(t, db)

	const triggerName = "passkey_hash_ignore_phase1_clear"
	require.NoError(t, db.Exec(`
CREATE TRIGGER `+triggerName+`
BEFORE UPDATE OF credential_id_hash ON passkey_credentials
FOR EACH ROW
WHEN NEW.credential_id_hash IS NULL
BEGIN
  SELECT RAISE(IGNORE);
END;
`).Error)
	t.Cleanup(func() { dropPasskeyHashTrigger(t, db, triggerName) })

	err := InitializePasskeyCredentialIDHashes()
	require.Error(t, err, "phase-1 silent zero-hit must fail closed on clear read-back")
	assert.Contains(t, err.Error(), "was not cleared to NULL")

	assertPasskeyHashesUnchanged(t, db, wrongA, wrongB)
	assertPasskeyHashIndexShape(t, db)
}

// TestPasskeyCredentialIDHashPhase2SilentZeroHitFailsClosed lets phase 1 clear
// succeed, then RAISE(IGNORE)s the canonical write on the second row. Read-back
// must report the canonical value was not persisted and the whole DML round must
// roll back to the pre-transaction hashes.
func TestPasskeyCredentialIDHashPhase2SilentZeroHitFailsClosed(t *testing.T) {
	db := openPasskeyHashMigrationDB(t)
	withPasskeyHashTestDB(t, db)
	require.NoError(t, db.AutoMigrate(&PasskeyCredential{}))
	require.NoError(t, ensurePasskeyCredentialIDHashUniqueIndex(db))

	_, _, wrongA, wrongB := seedTwoNonCanonicalPasskeys(t, db)

	const triggerName = "passkey_hash_ignore_phase2_row2"
	require.NoError(t, db.Exec(`
CREATE TRIGGER `+triggerName+`
BEFORE UPDATE OF credential_id_hash ON passkey_credentials
FOR EACH ROW
WHEN NEW.id = 2 AND NEW.credential_id_hash IS NOT NULL
BEGIN
  SELECT RAISE(IGNORE);
END;
`).Error)
	t.Cleanup(func() { dropPasskeyHashTrigger(t, db, triggerName) })

	err := InitializePasskeyCredentialIDHashes()
	require.Error(t, err, "phase-2 silent zero-hit must fail closed on canonical read-back")
	assert.Contains(t, err.Error(), "was not persisted as canonical value")

	assertPasskeyHashesUnchanged(t, db, wrongA, wrongB)
	assertPasskeyHashIndexShape(t, db)
}

// TestPasskeyCredentialIDHashTargetRowDisappearsDuringClearFailsClosed deletes
// the target row after a successful clear UPDATE. The subsequent Unscoped
// primary-key read-back must report disappearance and roll the DML transaction
// back so the row still exists with its original hash.
func TestPasskeyCredentialIDHashTargetRowDisappearsDuringClearFailsClosed(t *testing.T) {
	db := openPasskeyHashMigrationDB(t)
	withPasskeyHashTestDB(t, db)
	require.NoError(t, db.AutoMigrate(&PasskeyCredential{}))
	require.NoError(t, ensurePasskeyCredentialIDHashUniqueIndex(db))

	_, _, wrongA, wrongB := seedTwoNonCanonicalPasskeys(t, db)

	const triggerName = "passkey_hash_delete_after_clear_row1"
	require.NoError(t, db.Exec(`
CREATE TRIGGER `+triggerName+`
AFTER UPDATE OF credential_id_hash ON passkey_credentials
FOR EACH ROW
WHEN NEW.id = 1 AND NEW.credential_id_hash IS NULL
BEGIN
  DELETE FROM passkey_credentials WHERE id = NEW.id;
END;
`).Error)
	t.Cleanup(func() { dropPasskeyHashTrigger(t, db, triggerName) })

	err := InitializePasskeyCredentialIDHashes()
	require.Error(t, err, "target disappearance during clear must fail closed")
	assert.Contains(t, err.Error(), "disappeared during hash clear")

	var count int64
	require.NoError(t, db.Unscoped().Model(&PasskeyCredential{}).Count(&count).Error)
	require.EqualValues(t, 2, count, "rolled-back delete must restore the target row")
	assertPasskeyHashesUnchanged(t, db, wrongA, wrongB)
	assertPasskeyHashIndexShape(t, db)
}

// TestPasskeyCredentialIDHashPersistedReadbackDriftFailsClosed rewrites a
// successful canonical UPDATE to a non-canonical value before read-back.
// Production must reject the drift and roll back every hash change.
func TestPasskeyCredentialIDHashPersistedReadbackDriftFailsClosed(t *testing.T) {
	db := openPasskeyHashMigrationDB(t)
	withPasskeyHashTestDB(t, db)
	require.NoError(t, db.AutoMigrate(&PasskeyCredential{}))
	require.NoError(t, ensurePasskeyCredentialIDHashUniqueIndex(db))

	credA, _, wrongA, wrongB := seedTwoNonCanonicalPasskeys(t, db)
	canonicalA := expectedPasskeyCredentialIDHash(credA)
	drift := strings.Repeat("dd", 32)

	const triggerName = "passkey_hash_drift_after_canonical_row1"
	// SQLite CREATE TRIGGER does not accept bound parameters; embed literals.
	ddl := fmt.Sprintf(`
CREATE TRIGGER %s
AFTER UPDATE OF credential_id_hash ON passkey_credentials
FOR EACH ROW
WHEN NEW.id = 1 AND NEW.credential_id_hash = '%s'
BEGIN
  UPDATE passkey_credentials SET credential_id_hash = '%s' WHERE id = 1;
END;
`, triggerName, canonicalA, drift)
	require.NoError(t, db.Exec(ddl).Error)
	t.Cleanup(func() { dropPasskeyHashTrigger(t, db, triggerName) })

	err := InitializePasskeyCredentialIDHashes()
	require.Error(t, err, "canonical read-back drift must fail closed")
	assert.Contains(t, err.Error(), "was not persisted as canonical value")

	assertPasskeyHashesUnchanged(t, db, wrongA, wrongB)
	assertPasskeyHashIndexShape(t, db)
}
