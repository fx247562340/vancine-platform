package model

import (
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"gorm.io/gorm"
)

var (
	ErrPasskeyNotFound         = errors.New("passkey credential not found")
	ErrFriendlyPasskeyNotFound = errors.New("Passkey 验证失败，请重试或联系管理员")
)

type PasskeyCredential struct {
	ID           int    `json:"id" gorm:"primaryKey"`
	UserID       int    `json:"user_id" gorm:"uniqueIndex;not null"`
	CredentialID string `json:"credential_id" gorm:"type:varchar(512);not null"` // base64 encoded
	// CredentialIDHash is the internal unique identity for CredentialID. It is the
	// lowercase hex SHA-256 of the persisted CredentialID string (fixed 64 ASCII
	// chars), safe for unique indexes on SQLite, MySQL 5.7.8, and PostgreSQL 9.6.
	// It is never exposed on JSON/API/UI surfaces. The unique index is created by
	// InitializePasskeyCredentialIDHashes after backfill so SQLite upgrades can
	// ADD COLUMN on non-empty tables (SQLite rejects ADD UNIQUE COLUMN).
	CredentialIDHash string         `json:"-" gorm:"column:credential_id_hash;type:varchar(64)"`
	PublicKey        string         `json:"public_key" gorm:"type:text;not null"` // base64 encoded
	AttestationType  string         `json:"attestation_type" gorm:"type:varchar(255)"`
	AAGUID           string         `json:"aaguid" gorm:"type:varchar(512)"` // base64 encoded
	SignCount        uint32         `json:"sign_count" gorm:"default:0"`
	CloneWarning     bool           `json:"clone_warning"`
	UserPresent      bool           `json:"user_present"`
	UserVerified     bool           `json:"user_verified"`
	BackupEligible   bool           `json:"backup_eligible"`
	BackupState      bool           `json:"backup_state"`
	Transports       string         `json:"transports" gorm:"type:text"`
	Attachment       string         `json:"attachment" gorm:"type:varchar(32)"`
	LastUsedAt       *time.Time     `json:"last_used_at"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	DeletedAt        gorm.DeletedAt `json:"-" gorm:"index"`
}

// passkeyCredentialIDHash returns the canonical internal identity hash for a
// persisted CredentialID string: lowercase hex SHA-256, always 64 ASCII chars.
func passkeyCredentialIDHash(credentialID string) string {
	sum := sha256.Sum256([]byte(credentialID))
	return hex.EncodeToString(sum[:])
}

// ensureCredentialIDHash populates CredentialIDHash from the persisted
// CredentialID string. Empty CredentialID is rejected so write paths cannot
// create an unindexed identity.
func (p *PasskeyCredential) ensureCredentialIDHash() error {
	if p == nil {
		return fmt.Errorf("passkey credential is nil")
	}
	if p.CredentialID == "" {
		return fmt.Errorf("passkey credential_id is required")
	}
	p.CredentialIDHash = passkeyCredentialIDHash(p.CredentialID)
	return nil
}

// BeforeCreate is the model-layer write contract: every insert computes the
// internal CredentialIDHash before persistence, including raw DB.Create callers.
func (p *PasskeyCredential) BeforeCreate(tx *gorm.DB) error {
	return p.ensureCredentialIDHash()
}

func (p *PasskeyCredential) TransportList() []protocol.AuthenticatorTransport {
	if p == nil || strings.TrimSpace(p.Transports) == "" {
		return nil
	}
	var transports []string
	if err := common.Unmarshal([]byte(p.Transports), &transports); err != nil {
		return nil
	}
	result := make([]protocol.AuthenticatorTransport, 0, len(transports))
	for _, transport := range transports {
		result = append(result, protocol.AuthenticatorTransport(transport))
	}
	return result
}

func (p *PasskeyCredential) SetTransports(list []protocol.AuthenticatorTransport) {
	if len(list) == 0 {
		p.Transports = ""
		return
	}
	stringList := make([]string, len(list))
	for i, transport := range list {
		stringList[i] = string(transport)
	}
	encoded, err := common.Marshal(stringList)
	if err != nil {
		return
	}
	p.Transports = string(encoded)
}

func (p *PasskeyCredential) ToWebAuthnCredential() webauthn.Credential {
	flags := webauthn.CredentialFlags{
		UserPresent:    p.UserPresent,
		UserVerified:   p.UserVerified,
		BackupEligible: p.BackupEligible,
		BackupState:    p.BackupState,
	}

	credID, _ := base64.StdEncoding.DecodeString(p.CredentialID)
	pubKey, _ := base64.StdEncoding.DecodeString(p.PublicKey)
	aaguid, _ := base64.StdEncoding.DecodeString(p.AAGUID)

	return webauthn.Credential{
		ID:              credID,
		PublicKey:       pubKey,
		AttestationType: p.AttestationType,
		Transport:       p.TransportList(),
		Flags:           flags,
		Authenticator: webauthn.Authenticator{
			AAGUID:       aaguid,
			SignCount:    p.SignCount,
			CloneWarning: p.CloneWarning,
			Attachment:   protocol.AuthenticatorAttachment(p.Attachment),
		},
	}
}

func NewPasskeyCredentialFromWebAuthn(userID int, credential *webauthn.Credential) *PasskeyCredential {
	if credential == nil {
		return nil
	}
	passkey := &PasskeyCredential{
		UserID:          userID,
		CredentialID:    base64.StdEncoding.EncodeToString(credential.ID),
		PublicKey:       base64.StdEncoding.EncodeToString(credential.PublicKey),
		AttestationType: credential.AttestationType,
		AAGUID:          base64.StdEncoding.EncodeToString(credential.Authenticator.AAGUID),
		SignCount:       credential.Authenticator.SignCount,
		CloneWarning:    credential.Authenticator.CloneWarning,
		UserPresent:     credential.Flags.UserPresent,
		UserVerified:    credential.Flags.UserVerified,
		BackupEligible:  credential.Flags.BackupEligible,
		BackupState:     credential.Flags.BackupState,
		Attachment:      string(credential.Authenticator.Attachment),
	}
	passkey.SetTransports(credential.Transport)
	// Populate the internal hash before return so callers and tests can observe
	// the write contract without waiting for the BeforeCreate hook.
	if err := passkey.ensureCredentialIDHash(); err != nil {
		return nil
	}
	return passkey
}

func GetPasskeyByUserID(userID int) (*PasskeyCredential, error) {
	if userID == 0 {
		common.SysLog("GetPasskeyByUserID: empty user ID")
		return nil, ErrFriendlyPasskeyNotFound
	}
	var credential PasskeyCredential
	if err := DB.Where("user_id = ?", userID).First(&credential).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// 未找到记录是正常情况（用户未绑定），返回 ErrPasskeyNotFound 而不记录日志
			return nil, ErrPasskeyNotFound
		}
		// 只有真正的数据库错误才记录日志
		common.SysLog(fmt.Sprintf("GetPasskeyByUserID: database error for user %d: %v", userID, err))
		return nil, ErrFriendlyPasskeyNotFound
	}
	return &credential, nil
}

func GetPasskeyByCredentialID(credentialID []byte) (*PasskeyCredential, error) {
	if len(credentialID) == 0 {
		common.SysLog("GetPasskeyByCredentialID: empty credential ID")
		return nil, ErrFriendlyPasskeyNotFound
	}

	credIDStr := base64.StdEncoding.EncodeToString(credentialID)
	hash := passkeyCredentialIDHash(credIDStr)
	var credential PasskeyCredential
	if err := DB.Where("credential_id_hash = ?", hash).First(&credential).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.SysLog(fmt.Sprintf("GetPasskeyByCredentialID: passkey not found for credential ID length %d", len(credentialID)))
			return nil, ErrFriendlyPasskeyNotFound
		}
		common.SysLog(fmt.Sprintf("GetPasskeyByCredentialID: database error for credential ID: %v", err))
		return nil, ErrFriendlyPasskeyNotFound
	}
	// Fail closed on hash collision or storage drift: the hash is only a candidate
	// key; the persisted CredentialID must match the request exactly.
	if credential.CredentialID != credIDStr || credential.CredentialIDHash != hash {
		common.SysLog("GetPasskeyByCredentialID: credential_id mismatch after hash lookup")
		return nil, ErrFriendlyPasskeyNotFound
	}

	return &credential, nil
}

// UpdatePasskeyAssertionState persists only fields produced by a successful
// assertion. Registration identity (credential ID, public key, AAGUID,
// transports and attestation metadata) is immutable on this path.
func UpdatePasskeyAssertionState(userID int, credential *webauthn.Credential, lastUsedAt time.Time) error {
	if userID <= 0 || credential == nil || len(credential.ID) == 0 || lastUsedAt.IsZero() {
		return fmt.Errorf("Passkey 保存失败，请重试")
	}
	credentialID := base64.StdEncoding.EncodeToString(credential.ID)
	result := DB.Model(&PasskeyCredential{}).
		Where("user_id = ? AND credential_id = ?", userID, credentialID).
		Updates(map[string]interface{}{
			"sign_count":      credential.Authenticator.SignCount,
			"clone_warning":   credential.Authenticator.CloneWarning,
			"user_present":    credential.Flags.UserPresent,
			"user_verified":   credential.Flags.UserVerified,
			"backup_eligible": credential.Flags.BackupEligible,
			"backup_state":    credential.Flags.BackupState,
			"last_used_at":    lastUsedAt,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrPasskeyNotFound
	}
	return nil
}

func upsertPasskeyCredentialWithTx(tx *gorm.DB, credential *PasskeyCredential) error {
	if err := credential.ensureCredentialIDHash(); err != nil {
		common.SysLog(fmt.Sprintf("UpsertPasskeyCredential: invalid credential for user %d: %v", credential.UserID, err))
		return fmt.Errorf("Passkey 保存失败，请重试")
	}
	if err := tx.Unscoped().Where("user_id = ?", credential.UserID).Delete(&PasskeyCredential{}).Error; err != nil {
		common.SysLog(fmt.Sprintf("UpsertPasskeyCredential: failed to delete existing credential for user %d: %v", credential.UserID, err))
		return fmt.Errorf("Passkey 保存失败，请重试")
	}
	if err := tx.Create(credential).Error; err != nil {
		common.SysLog(fmt.Sprintf("UpsertPasskeyCredential: failed to create credential for user %d: %v", credential.UserID, err))
		return fmt.Errorf("Passkey 保存失败，请重试")
	}
	return nil
}

// UpsertPasskeyCredentialWithAuthVersion is reserved for enrollment changes;
// assertion sign-count updates must use UpdatePasskeyAssertionState.
func UpsertPasskeyCredentialWithAuthVersion(credential *PasskeyCredential) error {
	if credential == nil || credential.UserID <= 0 {
		return fmt.Errorf("Passkey 保存失败，请重试")
	}
	if err := DB.Transaction(func(tx *gorm.DB) error {
		if _, err := IncrementUserAuthVersionWithTx(tx, credential.UserID); err != nil {
			return err
		}
		return upsertPasskeyCredentialWithTx(tx, credential)
	}); err != nil {
		return err
	}
	return PublishUserAuthCache(credential.UserID)
}

func DeletePasskeyByUserIDWithAuthVersion(userID int) error {
	if userID == 0 {
		return fmt.Errorf("删除失败，请重试")
	}
	if err := DB.Transaction(func(tx *gorm.DB) error {
		// Lock the user row first: every path that combines user-level state
		// with identity records (Google unbind, Google bind) takes the user
		// row as its first lock, and this deletion must share that order to
		// stay deadlock-free and serializable against them.
		var user User
		if err := lockForUpdate(tx).Where("id = ?", userID).First(&user).Error; err != nil {
			return err
		}
		var credential PasskeyCredential
		if err := lockForUpdate(tx).Where("user_id = ?", userID).First(&credential).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPasskeyNotFound
			}
			return err
		}
		if _, err := IncrementUserAuthVersionWithTx(tx, userID); err != nil {
			return err
		}
		result := tx.Unscoped().Delete(&credential)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrPasskeyNotFound
		}
		return nil
	}); err != nil {
		return err
	}
	return PublishUserAuthCache(userID)
}

// InitializePasskeyCredentialIDHashes backfills the internal CredentialIDHash
// for every passkey row after AutoMigrate has added the nullable hash column.
//
// Ordering is intentional and MySQL-safe:
//  1. Read-only Unscoped scan + preflight (empty CredentialID / canonical-hash
//     conflicts) with no writes.
//  2. Ensure idx_passkey_cred_id_hash exists with the exact UNIQUE
//     (credential_id_hash) structure. CREATE UNIQUE INDEX runs outside any
//     data transaction because MySQL 5.7 DDL implicitly commits and cannot be
//     rolled back with DML.
//  3. A pure DML transaction then normalizes hashes in two phases
//     (non-canonical -> NULL, then NULL/wrong -> canonical) so unique-preserving
//     swaps cannot collide mid-round. Success is proven by primary-key
//     Unscoped read-back, never RowsAffected. Soft-deleted rows are included.
//
// Already-canonical hashes are left untouched (restart-idempotent).
func InitializePasskeyCredentialIDHashes() error {
	if DB == nil {
		return fmt.Errorf("passkey credential id hash init: database is not initialized")
	}

	var credentials []PasskeyCredential
	if err := DB.Unscoped().Find(&credentials).Error; err != nil {
		return err
	}
	if err := preflightPasskeyCredentialIDHashes(credentials); err != nil {
		return err
	}

	// DDL outside any DML transaction: MySQL 5.7 CREATE INDEX implicitly commits.
	if err := ensurePasskeyCredentialIDHashUniqueIndex(DB); err != nil {
		return err
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		var rows []PasskeyCredential
		if err := tx.Unscoped().Find(&rows).Error; err != nil {
			return err
		}
		if err := preflightPasskeyCredentialIDHashes(rows); err != nil {
			return err
		}

		// Phase 1: clear every non-canonical hash to NULL so unique-preserving
		// swaps (and any mid-set collisions) cannot fail the unique index.
		for i := range rows {
			c := &rows[i]
			expected := passkeyCredentialIDHash(c.CredentialID)
			if c.CredentialIDHash == expected {
				continue
			}
			if err := tx.Unscoped().Model(&PasskeyCredential{}).
				Where("id = ? AND credential_id = ?", c.ID, c.CredentialID).
				Update("credential_id_hash", nil).Error; err != nil {
				return err
			}
			var cleared PasskeyCredential
			if err := tx.Unscoped().Select("id", "credential_id", "credential_id_hash").
				Where("id = ?", c.ID).First(&cleared).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return fmt.Errorf("passkey credential id hash init: credential %d disappeared during hash clear", c.ID)
				}
				return err
			}
			if cleared.CredentialID != c.CredentialID {
				return fmt.Errorf("passkey credential id hash init: credential %d credential_id changed during hash clear", c.ID)
			}
			if cleared.CredentialIDHash != "" {
				return fmt.Errorf("passkey credential id hash init: credential %d hash was not cleared to NULL", c.ID)
			}
		}

		// Phase 2: write canonical hashes and read back.
		for i := range rows {
			c := &rows[i]
			expected := passkeyCredentialIDHash(c.CredentialID)
			if c.CredentialIDHash != expected {
				if err := tx.Unscoped().Model(&PasskeyCredential{}).
					Where("id = ? AND credential_id = ?", c.ID, c.CredentialID).
					Update("credential_id_hash", expected).Error; err != nil {
					return err
				}
			}
			var persisted PasskeyCredential
			if err := tx.Unscoped().Select("id", "credential_id", "credential_id_hash").
				Where("id = ?", c.ID).First(&persisted).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return fmt.Errorf("passkey credential id hash init: credential %d disappeared during hash backfill", c.ID)
				}
				return err
			}
			if persisted.CredentialID != c.CredentialID || persisted.CredentialIDHash != expected {
				return fmt.Errorf("passkey credential id hash init: credential %d hash was not persisted as canonical value", c.ID)
			}
		}
		return nil
	})
}

func preflightPasskeyCredentialIDHashes(credentials []PasskeyCredential) error {
	hashOwners := make(map[string]int, len(credentials))
	for i := range credentials {
		c := &credentials[i]
		if c.CredentialID == "" {
			return fmt.Errorf("passkey credential id hash init: credential %d has empty credential_id", c.ID)
		}
		hash := passkeyCredentialIDHash(c.CredentialID)
		if prevID, exists := hashOwners[hash]; exists {
			return fmt.Errorf("passkey credential id hash init: hash conflict between credentials %d and %d", prevID, c.ID)
		}
		hashOwners[hash] = c.ID
	}
	return nil
}

const passkeyCredentialIDHashIndexName = "idx_passkey_cred_id_hash"

// passkeyIndexSnapshot is the inspected shape of one index on passkey_credentials.
type passkeyIndexSnapshot struct {
	Name    string
	Unique  bool
	Columns []string
}

// ensurePasskeyCredentialIDHashUniqueIndex makes sure idx_passkey_cred_id_hash
// exists with UNIQUE=true and columns exactly [credential_id_hash]. A same-name
// index with the wrong shape fails closed without modifying or replacing it.
// CREATE UNIQUE INDEX is followed by a structural re-read. Callers must invoke
// this outside any DML transaction that also writes hash data on MySQL.
func ensurePasskeyCredentialIDHashUniqueIndex(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("passkey credential id hash init: database is not initialized")
	}
	found, info, err := inspectPasskeyCredentialIDHashIndex(db)
	if err != nil {
		return err
	}
	if found {
		return validatePasskeyCredentialIDHashIndex(info)
	}
	if err := db.Exec("CREATE UNIQUE INDEX idx_passkey_cred_id_hash ON passkey_credentials (credential_id_hash)").Error; err != nil {
		return fmt.Errorf("passkey credential id hash init: create unique index: %w", err)
	}
	found, info, err = inspectPasskeyCredentialIDHashIndex(db)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("passkey credential id hash init: unique index %s was not created", passkeyCredentialIDHashIndexName)
	}
	return validatePasskeyCredentialIDHashIndex(info)
}

func validatePasskeyCredentialIDHashIndex(info passkeyIndexSnapshot) error {
	if info.Name != passkeyCredentialIDHashIndexName {
		return fmt.Errorf("passkey credential id hash init: unexpected index name %q", info.Name)
	}
	if !info.Unique {
		return fmt.Errorf("passkey credential id hash init: index %s exists but is not UNIQUE", passkeyCredentialIDHashIndexName)
	}
	if len(info.Columns) != 1 || info.Columns[0] != "credential_id_hash" {
		return fmt.Errorf("passkey credential id hash init: index %s must be UNIQUE(credential_id_hash), got columns=%v",
			passkeyCredentialIDHashIndexName, info.Columns)
	}
	return nil
}

// inspectPasskeyCredentialIDHashIndex returns the live shape of
// idx_passkey_cred_id_hash. Prefer GORM Migrator.GetIndexes when the dialect
// implements it; otherwise use catalog queries for SQLite, MySQL, and PostgreSQL.
func inspectPasskeyCredentialIDHashIndex(db *gorm.DB) (bool, passkeyIndexSnapshot, error) {
	if indexes, err := db.Migrator().GetIndexes(&PasskeyCredential{}); err == nil {
		for _, idx := range indexes {
			if idx == nil || idx.Name() != passkeyCredentialIDHashIndexName {
				continue
			}
			unique, ok := idx.Unique()
			if !ok {
				unique = false
			}
			return true, passkeyIndexSnapshot{
				Name:    idx.Name(),
				Unique:  unique,
				Columns: append([]string(nil), idx.Columns()...),
			}, nil
		}
		return false, passkeyIndexSnapshot{}, nil
	}

	switch {
	case common.UsingMainDatabase(common.DatabaseTypeSQLite):
		return inspectPasskeyHashIndexSQLite(db)
	case common.UsingMainDatabase(common.DatabaseTypeMySQL):
		return inspectPasskeyHashIndexMySQL(db)
	case common.UsingMainDatabase(common.DatabaseTypePostgreSQL):
		return inspectPasskeyHashIndexPostgres(db)
	default:
		return false, passkeyIndexSnapshot{}, fmt.Errorf("passkey credential id hash init: unsupported database for index inspection")
	}
}

func inspectPasskeyHashIndexSQLite(db *gorm.DB) (bool, passkeyIndexSnapshot, error) {
	var count int
	if err := db.Raw(
		`SELECT COUNT(*) FROM pragma_index_list('passkey_credentials') WHERE name = ?`,
		passkeyCredentialIDHashIndexName,
	).Scan(&count).Error; err != nil {
		return false, passkeyIndexSnapshot{}, err
	}
	if count == 0 {
		return false, passkeyIndexSnapshot{}, nil
	}
	var unique int
	var name string
	if err := db.Raw(
		`SELECT name, "unique" FROM pragma_index_list('passkey_credentials') WHERE name = ?`,
		passkeyCredentialIDHashIndexName,
	).Row().Scan(&name, &unique); err != nil {
		return false, passkeyIndexSnapshot{}, err
	}
	cols, err := loadSQLiteIndexColumns(db, passkeyCredentialIDHashIndexName)
	if err != nil {
		return false, passkeyIndexSnapshot{}, err
	}
	return true, passkeyIndexSnapshot{Name: name, Unique: unique == 1, Columns: cols}, nil
}

func loadSQLiteIndexColumns(db *gorm.DB, indexName string) ([]string, error) {
	rows, err := db.Raw(fmt.Sprintf(`PRAGMA index_info(%q)`, indexName)).Rows()
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	type col struct {
		seqno int
		name  string
	}
	var cols []col
	for rows.Next() {
		var seqno, cid int
		var name string
		if err := rows.Scan(&seqno, &cid, &name); err != nil {
			return nil, err
		}
		cols = append(cols, col{seqno: seqno, name: name})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := 0; i < len(cols); i++ {
		for j := i + 1; j < len(cols); j++ {
			if cols[j].seqno < cols[i].seqno {
				cols[i], cols[j] = cols[j], cols[i]
			}
		}
	}
	out := make([]string, 0, len(cols))
	for _, c := range cols {
		out = append(out, c.name)
	}
	return out, nil
}

func inspectPasskeyHashIndexMySQL(db *gorm.DB) (bool, passkeyIndexSnapshot, error) {
	type row struct {
		NonUnique  int    `gorm:"column:non_unique"`
		ColumnName string `gorm:"column:column_name"`
		Seq        int    `gorm:"column:seq_in_index"`
	}
	var rows []row
	if err := db.Raw(`
SELECT non_unique, column_name, seq_in_index
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name = 'passkey_credentials'
  AND index_name = ?
ORDER BY seq_in_index`, passkeyCredentialIDHashIndexName).Scan(&rows).Error; err != nil {
		return false, passkeyIndexSnapshot{}, err
	}
	if len(rows) == 0 {
		return false, passkeyIndexSnapshot{}, nil
	}
	cols := make([]string, 0, len(rows))
	for _, r := range rows {
		cols = append(cols, r.ColumnName)
	}
	return true, passkeyIndexSnapshot{
		Name:    passkeyCredentialIDHashIndexName,
		Unique:  rows[0].NonUnique == 0,
		Columns: cols,
	}, nil
}

func inspectPasskeyHashIndexPostgres(db *gorm.DB) (bool, passkeyIndexSnapshot, error) {
	var count int64
	if err := db.Raw(`
SELECT COUNT(*)
FROM pg_class t
JOIN pg_index i ON i.indrelid = t.oid
JOIN pg_class ix ON ix.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE t.relkind = 'r'
  AND n.nspname = current_schema()
  AND t.relname = 'passkey_credentials'
  AND ix.relname = ?`, passkeyCredentialIDHashIndexName).Scan(&count).Error; err != nil {
		return false, passkeyIndexSnapshot{}, err
	}
	if count == 0 {
		return false, passkeyIndexSnapshot{}, nil
	}
	type row struct {
		Unique  bool
		Columns string
	}
	var r row
	if err := db.Raw(`
SELECT i.indisunique AS unique,
       array_to_string(ARRAY(
         SELECT a.attname
         FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
         ORDER BY k.ord
       ), ',') AS columns
FROM pg_class t
JOIN pg_index i ON i.indrelid = t.oid
JOIN pg_class ix ON ix.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE t.relkind = 'r'
  AND n.nspname = current_schema()
  AND t.relname = 'passkey_credentials'
  AND ix.relname = ?
LIMIT 1`, passkeyCredentialIDHashIndexName).Take(&r).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) || errors.Is(err, sql.ErrNoRows) {
			return false, passkeyIndexSnapshot{}, nil
		}
		return false, passkeyIndexSnapshot{}, err
	}
	var cols []string
	if r.Columns != "" {
		cols = strings.Split(r.Columns, ",")
	}
	return true, passkeyIndexSnapshot{
		Name:    passkeyCredentialIDHashIndexName,
		Unique:  r.Unique,
		Columns: cols,
	}, nil
}
