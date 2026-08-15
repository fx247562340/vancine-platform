package model

import (
	"database/sql"
	"fmt"
	"strings"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// logIndexV1026Fixture mirrors the v1.0.26 Log composite index contract from
// commit 79d9a0144: idx_created_at_id was declared with Id priority:1 and
// CreatedAt priority:2, which materializes as column order (id, created_at).
// The fixture only exists to seed that historical schema; production Log is
// the sole migration target under test.
type logIndexV1026Fixture struct {
	Id        int    `gorm:"column:id;primaryKey;index:idx_created_at_id,priority:1"`
	UserId    int    `gorm:"column:user_id"`
	CreatedAt int64  `gorm:"column:created_at;bigint;index:idx_created_at_id,priority:2"`
	Type      int    `gorm:"column:type"`
	Content   string `gorm:"column:content"`
}

func (logIndexV1026Fixture) TableName() string { return "logs" }

type sqliteIndexInfo struct {
	Columns []string
}

func openLogIndexMigrationDB(t *testing.T) *gorm.DB {
	t.Helper()
	// Each call opens a private in-memory SQLite database. A bare ":memory:"
	// DSN is connection-local, so MaxOpenConns(1)/MaxIdleConns(1) keeps every
	// statement on the same connection for the lifetime of this test's db.
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
	return db
}

func listLogIndexes(t *testing.T, db *gorm.DB) map[string]sqliteIndexInfo {
	t.Helper()
	sqlDB, err := db.DB()
	require.NoError(t, err)

	rows, err := sqlDB.Query(`PRAGMA index_list('logs')`)
	require.NoError(t, err)
	defer func() { assert.NoError(t, rows.Close()) }()

	indexes := make(map[string]sqliteIndexInfo)
	for rows.Next() {
		var seq int
		var name string
		var unique int
		var origin string
		var partial int
		require.NoError(t, rows.Scan(&seq, &name, &unique, &origin, &partial))
		indexes[name] = sqliteIndexInfo{}
	}
	require.NoError(t, rows.Err())

	for name, info := range indexes {
		info.Columns = logIndexColumns(t, sqlDB, name)
		indexes[name] = info
	}
	return indexes
}

func logIndexColumns(t *testing.T, sqlDB *sql.DB, indexName string) []string {
	t.Helper()
	rows, err := sqlDB.Query(fmt.Sprintf(`PRAGMA index_info(%q)`, indexName))
	require.NoError(t, err)
	defer func() { assert.NoError(t, rows.Close()) }()

	type col struct {
		seqno int
		name  string
	}
	var cols []col
	for rows.Next() {
		var seqno int
		var cid int
		var name string
		require.NoError(t, rows.Scan(&seqno, &cid, &name))
		cols = append(cols, col{seqno: seqno, name: name})
	}
	require.NoError(t, rows.Err())

	// PRAGMA index_info returns rows ordered by seqno, but sort defensively.
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
	return out
}

func countNamedLogIndex(t *testing.T, db *gorm.DB, indexName string) int {
	t.Helper()
	sqlDB, err := db.DB()
	require.NoError(t, err)
	var count int
	require.NoError(t, sqlDB.QueryRow(
		`SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND tbl_name = 'logs' AND name = ?`,
		indexName,
	).Scan(&count))
	return count
}

func seedLegacyCreatedAtIDIndex(t *testing.T, db *gorm.DB) {
	t.Helper()
	require.NoError(t, db.AutoMigrate(&logIndexV1026Fixture{}))
	indexes := listLogIndexes(t, db)
	legacy, ok := indexes["idx_created_at_id"]
	require.True(t, ok, "v1.0.26 fixture must create idx_created_at_id")
	require.Equal(t, []string{"id", "created_at"}, legacy.Columns,
		"v1.0.26 fixture must materialize column order (id, created_at)")
	require.Equal(t, 1, countNamedLogIndex(t, db, "idx_created_at_id"))
	require.Equal(t, 0, countNamedLogIndex(t, db, "idx_created_at_id_v2"))
}

func seedLogRowsForQueryPlan(t *testing.T, db *gorm.DB) {
	t.Helper()
	// Fixed, minimal dataset large enough for the planner to prefer the
	// composite created_at/id index on a bounded range + ordered limit.
	const n = 64
	rows := make([]Log, 0, n)
	for i := 0; i < n; i++ {
		rows = append(rows, Log{
			UserId:    1,
			CreatedAt: int64(1_700_000_000 + i),
			Type:      LogTypeConsume,
			Content:   fmt.Sprintf("row-%d", i),
			Username:  "u",
			TokenName: "t",
			ModelName: "m",
		})
	}
	require.NoError(t, db.Create(&rows).Error)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	_, err = sqlDB.Exec(`ANALYZE logs`)
	require.NoError(t, err)
}

// explainCreatedAtRangePlan runs the production-shaped log list query:
// full-row SELECT with created_at range filter and ORDER BY created_at DESC,
// id DESC LIMIT. It returns EXPLAIN QUERY PLAN detail lines only.
func explainCreatedAtRangePlan(t *testing.T, db *gorm.DB) []string {
	t.Helper()
	sqlDB, err := db.DB()
	require.NoError(t, err)
	rows, err := sqlDB.Query(`
EXPLAIN QUERY PLAN
SELECT logs.*
FROM logs
WHERE logs.created_at >= ? AND logs.created_at <= ?
ORDER BY logs.created_at DESC, logs.id DESC
LIMIT 10
`, int64(1_700_000_010), int64(1_700_000_050))
	require.NoError(t, err)
	defer func() { assert.NoError(t, rows.Close()) }()

	var plans []string
	for rows.Next() {
		var selectID, order, from int
		var detail string
		require.NoError(t, rows.Scan(&selectID, &order, &from, &detail))
		plans = append(plans, detail)
	}
	require.NoError(t, rows.Err())
	require.NotEmpty(t, plans, "EXPLAIN QUERY PLAN must return at least one detail row")
	return plans
}

func TestLogCreatedAtIDIndexV2FreshInstall(t *testing.T) {
	db := openLogIndexMigrationDB(t)

	require.NoError(t, db.AutoMigrate(&Log{}))

	indexes := listLogIndexes(t, db)
	v2, ok := indexes["idx_created_at_id_v2"]
	require.True(t, ok, "fresh AutoMigrate must create idx_created_at_id_v2")
	assert.Equal(t, []string{"created_at", "id"}, v2.Columns,
		"v2 column order must be (created_at, id)")
	assert.Equal(t, 1, countNamedLogIndex(t, db, "idx_created_at_id_v2"))
	assert.Equal(t, 0, countNamedLogIndex(t, db, "idx_created_at_id"),
		"fresh install must not create the legacy idx_created_at_id name")
}

func TestLogCreatedAtIDIndexV2UpgradeFromV1026(t *testing.T) {
	db := openLogIndexMigrationDB(t)
	seedLegacyCreatedAtIDIndex(t, db)

	require.NoError(t, db.AutoMigrate(&Log{}))

	indexes := listLogIndexes(t, db)

	legacy, ok := indexes["idx_created_at_id"]
	require.True(t, ok, "upgrade must retain legacy idx_created_at_id")
	assert.Equal(t, []string{"id", "created_at"}, legacy.Columns,
		"legacy index column order must remain (id, created_at)")
	assert.Equal(t, 1, countNamedLogIndex(t, db, "idx_created_at_id"))

	v2, ok := indexes["idx_created_at_id_v2"]
	require.True(t, ok, "upgrade must add idx_created_at_id_v2")
	assert.Equal(t, []string{"created_at", "id"}, v2.Columns,
		"v2 column order must be (created_at, id)")
	assert.Equal(t, 1, countNamedLogIndex(t, db, "idx_created_at_id_v2"))
}

func TestLogCreatedAtIDIndexV2RestartIdempotent(t *testing.T) {
	db := openLogIndexMigrationDB(t)
	seedLegacyCreatedAtIDIndex(t, db)

	require.NoError(t, db.AutoMigrate(&Log{}))
	require.NoError(t, db.AutoMigrate(&Log{}))

	assert.Equal(t, 1, countNamedLogIndex(t, db, "idx_created_at_id"),
		"restart must leave exactly one legacy index")
	assert.Equal(t, 1, countNamedLogIndex(t, db, "idx_created_at_id_v2"),
		"restart must leave exactly one v2 index")

	indexes := listLogIndexes(t, db)
	assert.Equal(t, []string{"id", "created_at"}, indexes["idx_created_at_id"].Columns)
	assert.Equal(t, []string{"created_at", "id"}, indexes["idx_created_at_id_v2"].Columns)
}

func TestLogCreatedAtIDIndexV2QueryPlan(t *testing.T) {
	db := openLogIndexMigrationDB(t)
	seedLegacyCreatedAtIDIndex(t, db)
	require.NoError(t, db.AutoMigrate(&Log{}))
	seedLogRowsForQueryPlan(t, db)

	plans := explainCreatedAtRangePlan(t, db)
	joined := strings.Join(plans, "\n")
	assert.Contains(t, joined, "idx_created_at_id_v2",
		"full-row created_at range + ORDER BY created_at DESC, id DESC must use idx_created_at_id_v2; plan=%v", plans)
}
