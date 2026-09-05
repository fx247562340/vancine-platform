package model

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type indexMeta struct {
	Name    string
	Columns []string
	Unique  bool
}

type walletTypeInfo struct {
	Raw        string
	Normalized string
}


func topUpTransactionIDForTest(value string) *string { return &value }

func schemaTableName(db *gorm.DB, model any) string {
	stmt := &gorm.Statement{DB: db}
	if err := stmt.Parse(model); err != nil || stmt.Schema == nil {
		return ""
	}
	return stmt.Schema.Table
}

func dialectName(db *gorm.DB) string {
	if db == nil || db.Dialector == nil {
		return "unknown"
	}
	return db.Dialector.Name()
}

func loadIndexMeta(t *testing.T, db *gorm.DB, model any) []indexMeta {
	t.Helper()
	out, err := loadIndexMetaByDialect(db, model)
	if err == nil && len(out) > 0 {
		return out
	}
	indexes, gerr := db.Migrator().GetIndexes(model)
	if gerr == nil && len(indexes) > 0 {
		fallback := make([]indexMeta, 0, len(indexes))
		uniqueReported := 0
		for _, idx := range indexes {
			unique, ok := idx.Unique()
			if ok {
				uniqueReported++
			}
			fallback = append(fallback, indexMeta{Name: idx.Name(), Columns: idx.Columns(), Unique: ok && unique})
		}
		if uniqueReported > 0 {
			return fallback
		}
	}
	require.NoError(t, err, "db=%s table=%s: failed to read index metadata (gorm=%v)", dialectName(db), schemaTableName(db, model), gerr)
	require.NotEmpty(t, out, "db=%s table=%s: no indexes returned", dialectName(db), schemaTableName(db, model))
	return out
}

func loadIndexMetaByDialect(db *gorm.DB, model any) ([]indexMeta, error) {
	table := schemaTableName(db, model)
	switch db.Dialector.Name() {
	case "sqlite":
		return sqliteIndexMeta(db, table)
	case "mysql":
		return mysqlIndexMeta(db, table)
	case "postgres":
		return postgresIndexMeta(db, table)
	default:
		return nil, fmt.Errorf("unsupported dialect %s", db.Dialector.Name())
	}
}

func sqliteIndexMeta(db *gorm.DB, table string) ([]indexMeta, error) {
	type listRow struct {
		Seq     int
		Name    string
		Unique  int
		Origin  string
		Partial int
	}
	var lists []listRow
	if err := db.Raw("PRAGMA index_list('" + table + "')").Scan(&lists).Error; err != nil {
		return nil, err
	}
	out := make([]indexMeta, 0, len(lists))
	for _, row := range lists {
		type infoRow struct {
			Seqno int
			Cid   int
			Name  string
		}
		var cols []infoRow
		if err := db.Raw("PRAGMA index_info('" + row.Name + "')").Scan(&cols).Error; err != nil {
			return nil, err
		}
		names := make([]string, 0, len(cols))
		for _, c := range cols {
			names = append(names, c.Name)
		}
		out = append(out, indexMeta{Name: row.Name, Columns: names, Unique: row.Unique == 1})
	}
	return out, nil
}

func mysqlIndexMeta(db *gorm.DB, table string) ([]indexMeta, error) {
	type row struct {
		Name      string `gorm:"column:INDEX_NAME"`
		Col       string `gorm:"column:COLUMN_NAME"`
		NonUnique int    `gorm:"column:NON_UNIQUE"`
		Seq       int    `gorm:"column:SEQ_IN_INDEX"`
	}
	var rows []row
	if err := db.Raw(`SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX
		FROM information_schema.STATISTICS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
		ORDER BY INDEX_NAME, SEQ_IN_INDEX`, table).Scan(&rows).Error; err != nil {
		return nil, err
	}
	return groupIndexRows(rows, func(r row) (string, string, bool) {
		return r.Name, r.Col, r.NonUnique == 0
	}), nil
}

func postgresIndexMeta(db *gorm.DB, table string) ([]indexMeta, error) {
	type row struct {
		Name     string `gorm:"column:name"`
		Col      string `gorm:"column:col"`
		IsUnique bool   `gorm:"column:is_unique"`
		Seq      int    `gorm:"column:seq"`
	}
	var rows []row
	if err := db.Raw(`SELECT i.relname AS name, a.attname AS col, ix.indisunique AS is_unique,
		array_position(ix.indkey, a.attnum) AS seq
		FROM pg_class t
		JOIN pg_namespace n ON n.oid = t.relnamespace
		JOIN pg_index ix ON t.oid = ix.indrelid
		JOIN pg_class i ON i.oid = ix.indexrelid
		JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
		WHERE t.relname = ? AND n.nspname = current_schema()
		ORDER BY i.relname, seq`, table).Scan(&rows).Error; err != nil {
		return nil, err
	}
	return groupIndexRows(rows, func(r row) (string, string, bool) {
		return r.Name, r.Col, r.IsUnique
	}), nil
}

func groupIndexRows[T any](rows []T, pick func(T) (name, col string, unique bool)) []indexMeta {
	order := []string{}
	byName := map[string]*indexMeta{}
	for _, r := range rows {
		name, col, unique := pick(r)
		idx, ok := byName[name]
		if !ok {
			idx = &indexMeta{Name: name, Unique: unique}
			byName[name] = idx
			order = append(order, name)
		}
		idx.Columns = append(idx.Columns, col)
		if unique {
			idx.Unique = true
		}
	}
	out := make([]indexMeta, 0, len(order))
	for _, name := range order {
		out = append(out, *byName[name])
	}
	return out
}

func requireSingleColumnUniqueIndex(t *testing.T, db *gorm.DB, model any, column string) {
	t.Helper()
	table := schemaTableName(db, model)
	indexes := loadIndexMeta(t, db, model)
	var found []string
	for _, idx := range indexes {
		found = append(found, fmt.Sprintf("%s(cols=%v unique=%v)", idx.Name, idx.Columns, idx.Unique))
		if !idx.Unique || len(idx.Columns) != 1 || !strings.EqualFold(idx.Columns[0], column) {
			continue
		}
		return
	}
	require.Failf(t, "missing unique index",
		"db=%s table=%s column=%s expected=single-column unique index covering %s; found=%s",
		dialectName(db), table, column, column, strings.Join(found, "; "))
}

func requireColumnIndex(t *testing.T, db *gorm.DB, model any, column string) {
	t.Helper()
	table := schemaTableName(db, model)
	indexes := loadIndexMeta(t, db, model)
	var found []string
	for _, idx := range indexes {
		found = append(found, fmt.Sprintf("%s(cols=%v unique=%v)", idx.Name, idx.Columns, idx.Unique))
		for _, col := range idx.Columns {
			if strings.EqualFold(col, column) {
				return
			}
		}
	}
	require.Failf(t, "missing index",
		"db=%s table=%s column=%s expected=index covering %s (uniqueness not required); found=%s",
		dialectName(db), table, column, column, strings.Join(found, "; "))
}

func normalizeWalletType(dataType string) string {
	n := strings.ToLower(strings.TrimSpace(dataType))
	n = strings.TrimSuffix(n, " unsigned")
	n = strings.TrimPrefix(n, "unsigned ")
	switch n {
	case "bigint", "int8":
		return "bigint"
	case "int", "integer", "int4":
		return "int"
	default:
		if strings.Contains(n, "bigint") || n == "int8" {
			return "bigint"
		}
		return n
	}
}

func sqliteWalletTypeOK(normalized string) bool {
	return normalized == "int" || normalized == "bigint" || normalized == "integer"
}

func walletColumnTypeInfo(t *testing.T, db *gorm.DB) map[string]walletTypeInfo {
	t.Helper()
	out := map[string]walletTypeInfo{}
	columnTypes, err := db.Migrator().ColumnTypes(&User{})
	require.NoError(t, err)
	for _, ct := range columnTypes {
		for _, want := range userQuotaColumns {
			if strings.EqualFold(ct.Name(), want) {
				raw := ct.DatabaseTypeName()
				out[want] = walletTypeInfo{Raw: raw, Normalized: normalizeWalletType(raw)}
			}
		}
	}
	return out
}

func requireOfficialWalletColumns(t *testing.T, db *gorm.DB) {
	t.Helper()
	got := walletColumnTypeInfo(t, db)
	for _, col := range userQuotaColumns {
		info, ok := got[col]
		require.True(t, ok, "db=%s table=users column=%s missing", dialectName(db), col)
		if dialectName(db) == "sqlite" {
			if !sqliteWalletTypeOK(info.Normalized) && !sqliteWalletTypeOK(strings.ToLower(info.Raw)) {
				require.Failf(t, "official wallet width",
					"db=%s table=users column=%s raw_type=%s normalized=%s expected=INTEGER",
					dialectName(db), col, info.Raw, info.Normalized)
			}
			continue
		}
		if info.Normalized != "bigint" {
			require.Failf(t, "official wallet width",
				"db=%s table=users column=%s raw_type=%s normalized=%s expected=bigint",
				dialectName(db), col, info.Raw, info.Normalized)
		}
	}
}

func assertWalletColumnTypes(t *testing.T, spec string) {
	t.Helper()
	got := walletColumnTypeInfo(t, DB)
	if dump := os.Getenv("MATRIX_WALLET_DUMP"); dump != "" {
		var b strings.Builder
		fmt.Fprintf(&b, "db=%s\n", dialectName(DB))
		for _, col := range userQuotaColumns {
			info := got[col]
			fmt.Fprintf(&b, "%s raw=%s normalized=%s\n", col, info.Raw, info.Normalized)
		}
		_ = os.WriteFile(dump, []byte(b.String()), 0o644)
	}
	if spec == "official" {
		requireOfficialWalletColumns(t, DB)
		return
	}
	for _, part := range strings.Split(spec, ",") {
		name, typ, ok := strings.Cut(part, ":")
		require.True(t, ok, part)
		info := got[name]
		assert.Equal(t, typ, info.Normalized,
			"db=%s table=users column=%s raw_type=%s normalized=%s expected=%s",
			dialectName(DB), name, info.Raw, info.Normalized, typ)
	}
}

func assertTopUpQuotaColumnTypes(t *testing.T, spec string) {
	t.Helper()
	columnTypes, err := DB.Migrator().ColumnTypes(&TopUp{})
	require.NoError(t, err)
	got := map[string]walletTypeInfo{}
	for _, ct := range columnTypes {
		name := strings.ToLower(ct.Name())
		if name == "base_quota" || name == "bonus_quota" {
			got[name] = walletTypeInfo{Raw: ct.DatabaseTypeName(), Normalized: normalizeWalletType(ct.DatabaseTypeName())}
		}
	}
	if dump := os.Getenv("MATRIX_TOPUP_DUMP"); dump != "" {
		var b strings.Builder
		fmt.Fprintf(&b, "db=%s\n", dialectName(DB))
		for _, col := range []string{"base_quota", "bonus_quota"} {
			info := got[col]
			fmt.Fprintf(&b, "%s raw=%s normalized=%s\n", col, info.Raw, info.Normalized)
		}
		_ = os.WriteFile(dump, []byte(b.String()), 0o644)
	}
	if spec == "official" {
		for _, col := range []string{"base_quota", "bonus_quota"} {
			info, ok := got[col]
			require.True(t, ok, "db=%s table=top_ups column=%s missing", dialectName(DB), col)
			if dialectName(DB) == "sqlite" {
				// SQLite accepts either width; assert we can store MaxQuota+1.
				assert.Truef(t, info.Normalized == "int" || info.Normalized == "bigint" || info.Normalized == "integer",
					"db=sqlite table=top_ups column=%s raw=%s normalized=%s expected=integer-backed type",
					col, info.Raw, info.Normalized)
				continue
			}
			require.Equalf(t, "bigint", info.Normalized,
				"db=%s table=top_ups column=%s raw=%s normalized=%s expected=bigint",
				dialectName(DB), col, info.Raw, info.Normalized)
		}
		return
	}
	for _, part := range strings.Split(spec, ",") {
		name, typ, ok := strings.Cut(part, ":")
		require.True(t, ok, part)
		info := got[name]
		assert.Equal(t, typ, info.Normalized,
			"db=%s table=top_ups column=%s raw=%s normalized=%s expected=%s",
			dialectName(DB), name, info.Raw, info.Normalized, typ)
	}
}

func dumpWalletAuditEvidence(t *testing.T, path string) {
	t.Helper()
	var b strings.Builder
	fmt.Fprintf(&b, "db=%s\n", dialectName(DB))
	entries := []struct {
		model any
		cols  []string
	}{
		{&Token{}, []string{"remain_quota", "used_quota"}},
		{&Redemption{}, []string{"quota"}},
		{&SubscriptionPlan{}, []string{"total_amount"}},
		{&UserSubscription{}, []string{"amount_total", "amount_used"}},
		{&SubscriptionPreConsumeRecord{}, []string{"pre_consumed"}},
		{&TopUp{}, []string{"amount", "base_quota", "bonus_quota"}},
	}
	for _, e := range entries {
		colTypes, err := DB.Migrator().ColumnTypes(e.model)
		if err != nil {
			fmt.Fprintf(&b, "[%T] err=%v\n", e.model, err)
			continue
		}
		byName := map[string]string{}
		for _, ct := range colTypes {
			byName[strings.ToLower(ct.Name())] = ct.DatabaseTypeName()
		}
		for _, col := range e.cols {
			fmt.Fprintf(&b, "%T.%s = %s (normalized=%s)\n", e.model, col, byName[col], normalizeWalletType(byName[col]))
		}
	}
	_ = os.WriteFile(path, []byte(b.String()), 0o644)
}

func assertSchemaIndexesAndUniqueness(t *testing.T) {
	t.Helper()
	if os.Getenv("MATRIX_CHECK_UNIQUENESS") != "1" {
		return
	}
	requireSingleColumnUniqueIndex(t, DB, &User{}, "username")
	requireSingleColumnUniqueIndex(t, DB, &Token{}, "key")
	requireSingleColumnUniqueIndex(t, DB, &TopUp{}, "trade_no")
	requireSingleColumnUniqueIndex(t, DB, &PrefillGroup{}, "name")
	requireColumnIndex(t, LOG_DB, &Log{}, "user_id")
	requireColumnIndex(t, LOG_DB, &Log{}, "created_at")
	if dump := os.Getenv("MATRIX_INDEX_DUMP"); dump != "" {
		dumpIndexEvidence(t, dump)
	}
	assertIsolatedUniqueInserts(t, DB)
}

func dumpIndexEvidence(t *testing.T, path string) {
	t.Helper()
	var b strings.Builder
	fmt.Fprintf(&b, "db=%s\n", dialectName(DB))
	for _, item := range []struct {
		model any
		table string
		db    *gorm.DB
	}{
		{&User{}, "users", DB},
		{&Token{}, "tokens", DB},
		{&TopUp{}, "top_ups", DB},
		{&PrefillGroup{}, "prefill_groups", DB},
		{&Log{}, "logs", LOG_DB},
	} {
		fmt.Fprintf(&b, "[%s]\n", item.table)
		for _, idx := range loadIndexMeta(t, item.db, item.model) {
			fmt.Fprintf(&b, "  name=%s cols=%v unique=%v\n", idx.Name, idx.Columns, idx.Unique)
		}
	}
	_ = os.WriteFile(path, []byte(b.String()), 0o644)
}

func assertIsolatedUniqueInserts(t *testing.T, db *gorm.DB) {
	t.Helper()
	suffix := strings.ReplaceAll(t.Name(), "/", "_") + "-" + dialectName(db)

	userName := os.Getenv("MATRIX_EXPECT_USER")
	if userName == "" {
		userName = "matrix-uniq-user-" + suffix
		var existing User
		if err := db.Where("username = ?", userName).First(&existing).Error; err != nil {
			require.ErrorIs(t, err, gorm.ErrRecordNotFound)
			require.NoError(t, db.Create(&User{Username: userName, Password: "x", Status: 1, AffCode: "aff-a-" + suffix}).Error)
		}
	}
	err := db.Create(&User{Username: userName, Password: "x", Status: 1, AffCode: "aff-probe-" + suffix}).Error
	require.Error(t, err, "db=%s table=users column=username expected=duplicate username rejected with distinct AffCode", dialectName(db))

	tokenKey := "matrix-upgrade-token-key"
	if os.Getenv("MATRIX_EXPECT_TOKEN") == "" {
		tokenKey = "matrix-fresh-token-" + suffix
		var existing Token
		if err := db.Where(map[string]any{"key": tokenKey}).First(&existing).Error; err != nil {
			require.ErrorIs(t, err, gorm.ErrRecordNotFound)
			require.NoError(t, db.Create(&Token{UserId: 1, Key: tokenKey, Name: "fresh-a", Status: 1}).Error)
		}
	}
	err = db.Create(&Token{UserId: 1, Key: tokenKey, Name: "fresh-b", Status: 1}).Error
	require.Error(t, err, "db=%s table=tokens column=key expected=duplicate key rejected", dialectName(db))

	trade := os.Getenv("MATRIX_EXPECT_TOPUP")
	if trade == "" {
		trade = "matrix-fresh-trade-" + suffix
		var existing TopUp
		if err := db.Where("trade_no = ?", trade).First(&existing).Error; err != nil {
			require.ErrorIs(t, err, gorm.ErrRecordNotFound)
			require.NoError(t, db.Create(&TopUp{UserId: 1, TradeNo: trade, TransactionId: topUpTransactionIDForTest("tx-a-" + suffix), Amount: 1, Status: "pending"}).Error)
		}
	}
	err = db.Create(&TopUp{UserId: 1, TradeNo: trade, TransactionId: topUpTransactionIDForTest("tx-probe-" + suffix), Amount: 1, Status: "pending"}).Error
	require.Error(t, err, "db=%s table=top_ups column=trade_no expected=duplicate trade_no rejected with distinct TransactionId", dialectName(db))

	prefillName := "matrix-prefill-" + suffix
	var existing PrefillGroup
	if err := db.Where(map[string]any{"name": prefillName}).First(&existing).Error; err != nil {
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
		require.NoError(t, db.Create(&PrefillGroup{Name: prefillName, Type: "model"}).Error)
	}
	err = db.Create(&PrefillGroup{Name: prefillName, Type: "model"}).Error
	require.Error(t, err, "db=%s table=prefill_groups column=name expected=duplicate name rejected", dialectName(db))
}

func setupSchemaContractDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB, previousLog := DB, LOG_DB
	previousMain, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	dsn := fmt.Sprintf("file:schema_contract_%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	database, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.AutoMigrate(&User{}, &Token{}, &TopUp{}, &PrefillGroup{}, &Log{}))
	DB, LOG_DB = database, database
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		DB, LOG_DB = previousDB, previousLog
		common.SetDatabaseTypes(previousMain, previousLogType)
	})
	return database
}

func TestUsernameUniquenessIsNotAffCodeCollision(t *testing.T) {
	db := setupSchemaContractDB(t)
	requireSingleColumnUniqueIndex(t, db, &User{}, "username")
	require.NoError(t, db.Create(&User{Username: "same-name", Password: "x", Status: 1, AffCode: "aff-one"}).Error)
	require.NoError(t, db.Create(&User{Username: "other-name", Password: "x", Status: 1, AffCode: "aff-two"}).Error)
	err := db.Create(&User{Username: "same-name", Password: "x", Status: 1, AffCode: "aff-three"}).Error
	require.Error(t, err, "duplicate username with a distinct AffCode must still fail")
	var count int64
	require.NoError(t, db.Model(&User{}).Count(&count).Error)
	assert.Equal(t, int64(2), count)
}

func TestTopUpTradeNoUniquenessIsNotTransactionIdCollision(t *testing.T) {
	db := setupSchemaContractDB(t)
	requireSingleColumnUniqueIndex(t, db, &TopUp{}, "trade_no")
	require.NoError(t, db.Create(&TopUp{UserId: 1, TradeNo: "trade-same", TransactionId: topUpTransactionIDForTest("tx-one"), Amount: 1, Status: "pending"}).Error)
	require.NoError(t, db.Create(&TopUp{UserId: 1, TradeNo: "trade-other", TransactionId: topUpTransactionIDForTest("tx-two"), Amount: 1, Status: "pending"}).Error)
	err := db.Create(&TopUp{UserId: 1, TradeNo: "trade-same", TransactionId: topUpTransactionIDForTest("tx-three"), Amount: 1, Status: "pending"}).Error
	require.Error(t, err, "duplicate trade_no with a distinct TransactionId must still fail")
	var count int64
	require.NoError(t, db.Model(&TopUp{}).Count(&count).Error)
	assert.Equal(t, int64(2), count)
}

func TestTokenKeyAndPrefillNameAreUniqueConstraints(t *testing.T) {
	db := setupSchemaContractDB(t)
	requireSingleColumnUniqueIndex(t, db, &Token{}, "key")
	requireSingleColumnUniqueIndex(t, db, &PrefillGroup{}, "name")
	require.NoError(t, db.Create(&Token{UserId: 1, Key: "tok-a", Name: "n1", Status: 1}).Error)
	err := db.Create(&Token{UserId: 1, Key: "tok-a", Name: "n2", Status: 1}).Error
	require.Error(t, err)
	require.NoError(t, db.Create(&PrefillGroup{Name: "grp", Type: "model"}).Error)
	err = db.Create(&PrefillGroup{Name: "grp", Type: "prompt"}).Error
	require.Error(t, err)
}

func TestLogUserIdAndCreatedAtHaveIndexes(t *testing.T) {
	db := setupSchemaContractDB(t)
	requireColumnIndex(t, db, &Log{}, "user_id")
	requireColumnIndex(t, db, &Log{}, "created_at")
}

func TestSqliteCreateTableWalletColumnsAreInteger(t *testing.T) {
	previousDB := DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	database, err := gorm.Open(sqlite.Open("file:official_int_"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	DB = database
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		DB = previousDB
		common.SetDatabaseTypes(previousMain, previousLog)
	})
	require.NoError(t, DB.AutoMigrate(&User{}))
	requireOfficialWalletColumns(t, DB)
}
