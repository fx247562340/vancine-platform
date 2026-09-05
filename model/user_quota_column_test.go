package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestIs64BitIntegerTypeAcceptsOfficialWalletTypes(t *testing.T) {
	assert.True(t, is64BitIntegerType(common.DatabaseTypeMySQL, "bigint"))
	assert.True(t, is64BitIntegerType(common.DatabaseTypeMySQL, "BIGINT"))
	assert.False(t, is64BitIntegerType(common.DatabaseTypeMySQL, "int"))
	assert.False(t, is64BitIntegerType(common.DatabaseTypeMySQL, "int unsigned"))
	assert.True(t, is64BitIntegerType(common.DatabaseTypePostgreSQL, "bigint"))
	assert.True(t, is64BitIntegerType(common.DatabaseTypePostgreSQL, "int8"))
	assert.False(t, is64BitIntegerType(common.DatabaseTypePostgreSQL, "int4"))
	assert.False(t, is64BitIntegerType(common.DatabaseTypePostgreSQL, "integer"))
}

func TestEnsureUserQuotaColumnsSkipsSQLite(t *testing.T) {
	previousDB := DB
	database, err := gorm.Open(sqlite.Open("file:wallet_sqlite_skip_"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	DB = database
	t.Cleanup(func() { DB = previousDB })
	require.NoError(t, database.AutoMigrate(&User{}))
	require.NoError(t, ensureUserQuotaColumns(database, common.DatabaseTypeSQLite))
}

func TestMigrateUserAutoMigrateAddsMissingNonWalletColumn(t *testing.T) {
	previousDB := DB
	database, err := gorm.Open(sqlite.Open("file:wallet_automigrate_addcol_"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	DB = database
	t.Cleanup(func() { DB = previousDB })

	require.NoError(t, database.Exec(`CREATE TABLE users (
		id integer primary key,
		username text,
		password text not null,
		quota integer default 0,
		used_quota integer default 0,
		aff_quota integer default 0,
		aff_history integer default 0
	)`).Error)
	require.False(t, database.Migrator().HasColumn(&User{}, "remark"))
	require.False(t, database.Migrator().HasColumn(&User{}, "google_sub"))

	require.NoError(t, database.AutoMigrate(&User{}))
	assert.True(t, database.Migrator().HasColumn(&User{}, "remark"))
	assert.True(t, database.Migrator().HasColumn(&User{}, "google_sub"))
	assert.True(t, database.Migrator().HasColumn(&User{}, "auth_version"))
}
