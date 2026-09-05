package controller

// P10 database-run fixture for Batch P (and later) tests.
//
// The fixture uses the real public chain model.InitDB() then model.InitLogDB()
// with IsMasterNode=false, so reserved-word columns (group/key) are initialized
// through the production initCol with no test-only seam and no copied values.
//
// SQLite uses a per-test t.TempDir file database (never a shared-memory DSN).
// PostgreSQL creates a throwaway database with a validated [a-z0-9_] name and
// tears it down progressively (test DB close -> terminate -> DROP -> admin
// close), all asserted, via a single cleanup chain.
//
// The same concept is reused by B04 / B08 / A08 / A09 / A11 / A12 / E slices.
// Tests using this fixture MUST NOT call t.Parallel: it switches process-level
// globals.

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// p10DatabaseFixture is a fully-initialized model.DB / model.LOG_DB that has
// gone through the real production init chain.
type p10DatabaseFixture struct {
	db     *gorm.DB
	dbType common.DatabaseType
}

// p10DatabaseTarget is one configured database (sqlite always; postgres only
// when TEST_POSTGRES_DSN is set).
type p10DatabaseTarget struct {
	Name   string
	dbType common.DatabaseType
}

// p10ConfiguredTargets returns the databases a body runs on. PostgreSQL is
// included only when TEST_POSTGRES_DSN is set, and is never skipped then.
func p10ConfiguredTargets() []p10DatabaseTarget {
	targets := []p10DatabaseTarget{{Name: "sqlite", dbType: common.DatabaseTypeSQLite}}
	if strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN")) != "" {
		targets = append(targets, p10DatabaseTarget{Name: "postgres", dbType: common.DatabaseTypePostgreSQL})
	}
	return targets
}

// p10RunAcrossDatabases runs body once per configured database, naming the
// subtests <name>/sqlite and (when TEST_POSTGRES_DSN is set) <name>/postgres.
// The explicit database target is passed to the body; no mutable package-level
// switch is used.
func p10RunAcrossDatabases(t *testing.T, name string, body func(t *testing.T, dbType common.DatabaseType)) {
	t.Helper()
	for _, target := range p10ConfiguredTargets() {
		target := target
		t.Run(name+"/"+target.Name, func(t *testing.T) {
			body(t, target.dbType)
		})
	}
}

// p10SetupDatabase initializes model.DB / model.LOG_DB through the real
// production chain for the given database type and migrates the given tables.
// All affected globals are restored, and the test database handle is closed
// with an asserted result.
func p10SetupDatabase(t *testing.T, dbType common.DatabaseType, tables ...interface{}) *p10DatabaseFixture {
	t.Helper()
	gin.SetMode(gin.TestMode)

	prevDB := model.DB
	prevLogDB := model.LOG_DB
	prevMainType := common.MainDatabaseType()
	prevLogType := common.LogDatabaseType()
	prevIsMasterNode := common.IsMasterNode
	prevSQLitePath := common.SQLitePath
	prevSQLDSN, hadSQLDSN := os.LookupEnv("SQL_DSN")
	prevLogSQLDSN, hadLogSQLDSN := os.LookupEnv("LOG_SQL_DSN")

	// Save Redis globals so they can be restored after the async telemetry
	// goroutine has finished; the fixture body runs with the safe
	// in-process state (Redis disabled).
	prevRedisEnabled := common.RedisEnabled
	prevRDB := common.RDB
	common.RedisEnabled = false
	common.RDB = nil
	common.IsMasterNode = false

	switch dbType {
	case common.DatabaseTypePostgreSQL:
		baseDSN := strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN"))
		require.NotEmpty(t, baseDSN, "TEST_POSTGRES_DSN must be set to use the postgres target")
		testDSN := p10CreateIsolatedPostgres(t, baseDSN)
		require.NoError(t, os.Setenv("SQL_DSN", testDSN))
		require.NoError(t, os.Unsetenv("LOG_SQL_DSN"))
		common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	default:
		// Per-test file database in an isolated temp dir; never shared memory.
		common.SQLitePath = filepath.Join(t.TempDir(), "p10.db")
		common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
		require.NoError(t, os.Setenv("SQL_DSN", "local"))
		require.NoError(t, os.Unsetenv("LOG_SQL_DSN"))
	}

	// Real production init chain (runs initCol internally).
	require.NoError(t, model.InitDB())
	require.NoError(t, model.InitLogDB())

	// The initialized handle must expose a live *sql.DB before we migrate.
	testDB := model.DB
	sqlDB, err := testDB.DB()
	require.NoError(t, err, "model.DB must expose a *sql.DB")
	require.NotNil(t, sqlDB)

	// Migrate the tables this slice needs on the initialized model.DB.
	if len(tables) > 0 {
		require.NoError(t, model.DB.AutoMigrate(tables...))
	}

	// Restore every global exactly as found, then close the test database with
	// an asserted result, then run the PG teardown. Restoring globals first
	// means any late goroutine referencing model.DB / model.LOG_DB reaches the
	// original handles, never the closed test database.
	// NOTE: Redis globals (prevRedisEnabled, prevRDB) are restored after the
	// test body's async readers (gopool telemetry, refund barrier) have
	// joined.
	t.Cleanup(func() {
		model.DB = prevDB
		model.LOG_DB = prevLogDB
		common.SetDatabaseTypes(prevMainType, prevLogType)
		common.IsMasterNode = prevIsMasterNode
		common.SQLitePath = prevSQLitePath
		common.RedisEnabled = prevRedisEnabled
		common.RDB = prevRDB
		if hadSQLDSN {
			require.NoError(t, os.Setenv("SQL_DSN", prevSQLDSN))
		} else {
			require.NoError(t, os.Unsetenv("SQL_DSN"))
		}
		if hadLogSQLDSN {
			require.NoError(t, os.Setenv("LOG_SQL_DSN", prevLogSQLDSN))
		} else {
			require.NoError(t, os.Unsetenv("LOG_SQL_DSN"))
		}
		if sqlDB, err := testDB.DB(); err == nil {
			assert.NoError(t, sqlDB.Close(), "test database close must succeed")
		}
		// PG teardown is handled by p10CreateIsolatedPostgres's own
		// cleanup (registered there). No manual pgCleanup() call here.
	})

	return &p10DatabaseFixture{db: testDB, dbType: dbType}
}

// p10PGNamePattern restricts throwaway database names to safe, unquoted
// PostgreSQL identifiers.
var p10PGNamePattern = regexp.MustCompile(`^[a-z0-9_]+$`)

// p10CreateIsolatedPostgres creates a throwaway PostgreSQL database on the
// configured server, validates the generated name, registers its own cleanup
// (single owner), and returns the test DSN. The cleanup chain is:
// close test validation pool → terminate backends → DROP test DB → close
// admin pool. Each step asserts its own error. The cleanup is registered
// before CREATE so a CREATE failure still cleans up admin resources.
// p10SetupDatabase does NOT return or manually call this cleanup; it relies
// on t.Cleanup LIFO ordering.
func p10CreateIsolatedPostgres(t *testing.T, baseDSN string) string {
	t.Helper()
	dbName := fmt.Sprintf("p10c%d_%d", os.Getpid(), time.Now().UnixNano())
	require.True(t, p10PGNamePattern.MatchString(dbName),
		"generated PG database name %q must match %s", dbName, p10PGNamePattern.String())

	admin, err := gorm.Open(postgres.New(postgres.Config{DSN: baseDSN}), &gorm.Config{})
	require.NoError(t, err)
	adminSQL, err := admin.DB()
	require.NoError(t, err)

	var (
		testSQL   *sql.DB
		dbCreated bool
	)

	// Single cleanup chain, registered before CREATE so a CREATE failure
	// still closes the admin connection. Each step asserts its own error;
	// cleanup continues even if one step fails.
	t.Cleanup(func() {
		if testSQL != nil {
			assert.NoError(t, testSQL.Close(), "test pool close must succeed")
			testSQL = nil
		}
		if dbCreated {
			_, termErr := adminSQL.Exec(
				`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
				dbName,
			)
			assert.NoError(t, termErr, "terminate backends must succeed")
			_, dropErr := adminSQL.Exec("DROP DATABASE IF EXISTS " + dbName)
			assert.NoError(t, dropErr, "DROP DATABASE must succeed")
			dbCreated = false
		}
		assert.NoError(t, adminSQL.Close(), "admin connection close must succeed")
	})

	_, err = adminSQL.Exec("CREATE DATABASE " + dbName)
	require.NoError(t, err)
	dbCreated = true

	testDSN, err := replacePostgresDSNDBName(baseDSN, dbName)
	require.NoError(t, err)
	testDB, err := gorm.Open(postgres.New(postgres.Config{DSN: testDSN}), &gorm.Config{})
	require.NoError(t, err)
	testSQL, err = testDB.DB()
	require.NoError(t, err)

	return testDSN
}
