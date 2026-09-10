package model

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// These integration tests exercise CleanExpiredPendingTopUps against real
// MySQL and PostgreSQL instances. They reuse model-package-private
// openIsolatedMySQLDB / openIsolatedPostgresDB / DSN-rewriting helpers
// (defined in external_identity_claim_test.go) to spin up throwaway
// databases on whatever TEST_MYSQL_DSN / TEST_POSTGRES_DSN points at.
//
// They are NOT picked up by ordinary `go test ./...`: they only run when
// the corresponding TEST_*_DSN environment variable is configured.
// Each test creates an isolated database, AutoMigrates only the schema
// the cleaner touches, and DROPs the database on cleanup. No fixture
// state ever leaves the test process.
//
// Scope is identical to the SQLite test in
// topup_pending_cleaner_test.go: stale PayPal + stale Waffo Pancake
// pending orders are expired, every other provider stays pending,
// fresh rows stay pending, and terminal rows are not modified.

func TestCleanExpiredPendingTopUpsCoversPayPalAndWaffoPancakeMySQL(t *testing.T) {
	baseDSN := strings.TrimSpace(os.Getenv("TEST_MYSQL_DSN"))
	if baseDSN == "" {
		t.Skip("TEST_MYSQL_DSN is not configured; skipping integration run")
	}
	runCleanerMatrixAgainst(t, baseDSN, common.DatabaseTypeMySQL, openIsolatedMySQLDB)
}

func TestCleanExpiredPendingTopUpsCoversPayPalAndWaffoPancakePostgreSQL(t *testing.T) {
	baseDSN := strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN"))
	if baseDSN == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured; skipping integration run")
	}
	runCleanerMatrixAgainst(t, baseDSN, common.DatabaseTypePostgreSQL, openIsolatedPostgresDB)
}

// runCleanerMatrixAgainst wires the shared cleaner-fixture assertions
// against a real MySQL or PostgreSQL database. The opener must create a
// throwaway database and return a gorm.DB connected to it; this helper
// installs that db as the package-level DB (so CleanExpiredPendingTopUps
// can read it), runs the same fixture matrix as the SQLite test, and
// restores the previous DB handle on cleanup.
func runCleanerMatrixAgainst(t *testing.T, baseDSN string, dbType common.DatabaseType, opener func(t *testing.T, baseDSN string) *gorm.DB) {
	t.Helper()

	previousDB := DB
	previousLogDB := LOG_DB
	previousType := common.MainDatabaseType()
	previousRedisEnabled := common.RedisEnabled
	previousRDB := common.RDB

	db := opener(t, baseDSN)
	t.Cleanup(func() {
		DB = previousDB
		LOG_DB = previousLogDB
		common.SetMainDatabaseType(previousType)
		common.RedisEnabled = previousRedisEnabled
		common.RDB = previousRDB
	})

	require.NoError(t, db.AutoMigrate(&User{}, &TopUp{}), "AutoMigrate top_ups on %s", dbType)
	DB = db
	LOG_DB = db
	common.SetMainDatabaseType(dbType)
	common.RedisEnabled = false

	oldCreate := common.GetTimestamp() - int64(72*time.Hour/time.Second)
	maxAge := 1 * time.Hour
	now := common.GetTimestamp()

	type cleanerFixture struct {
		tradeNo       string
		provider      string
		status        string
		completeTime  int64
		expectStatus  string
		countsTowards bool
	}

	fixtures := []cleanerFixture{
		{tradeNo: fmt.Sprintf("matrix-stale-paypal-a-%s", dbType), provider: PaymentProviderPayPal,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusExpired, countsTowards: true},
		{tradeNo: fmt.Sprintf("matrix-stale-paypal-b-%s", dbType), provider: PaymentProviderPayPal,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusExpired, countsTowards: true},
		{tradeNo: fmt.Sprintf("matrix-stale-waffo-pancake-%s", dbType), provider: PaymentProviderWaffoPancake,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusExpired, countsTowards: true},

		{tradeNo: fmt.Sprintf("matrix-stale-stripe-%s", dbType), provider: PaymentProviderStripe,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusPending},
		{tradeNo: fmt.Sprintf("matrix-stale-creem-%s", dbType), provider: PaymentProviderCreem,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusPending},
		{tradeNo: fmt.Sprintf("matrix-stale-epay-%s", dbType), provider: PaymentProviderEpay,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusPending},
		{tradeNo: fmt.Sprintf("matrix-stale-waffo-%s", dbType), provider: PaymentProviderWaffo,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusPending},
		{tradeNo: fmt.Sprintf("matrix-stale-empty-provider-%s", dbType), provider: "",
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusPending},

		{tradeNo: fmt.Sprintf("matrix-fresh-paypal-%s", dbType), provider: PaymentProviderPayPal,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusPending},
		{tradeNo: fmt.Sprintf("matrix-fresh-waffo-pancake-%s", dbType), provider: PaymentProviderWaffoPancake,
			status: common.TopUpStatusPending, expectStatus: common.TopUpStatusPending},

		{tradeNo: fmt.Sprintf("matrix-paypal-success-%s", dbType), provider: PaymentProviderPayPal,
			status: common.TopUpStatusSuccess, completeTime: oldCreate, expectStatus: common.TopUpStatusSuccess},
		{tradeNo: fmt.Sprintf("matrix-paypal-refunded-%s", dbType), provider: PaymentProviderPayPal,
			status: common.TopUpStatusRefunded, completeTime: oldCreate, expectStatus: common.TopUpStatusRefunded},
		{tradeNo: fmt.Sprintf("matrix-waffo-pancake-success-%s", dbType), provider: PaymentProviderWaffoPancake,
			status: common.TopUpStatusSuccess, completeTime: oldCreate, expectStatus: common.TopUpStatusSuccess},
		{tradeNo: fmt.Sprintf("matrix-waffo-pancake-refunded-%s", dbType), provider: PaymentProviderWaffoPancake,
			status: common.TopUpStatusRefunded, completeTime: oldCreate, expectStatus: common.TopUpStatusRefunded},
	}

	for i, f := range fixtures {
		createTime := oldCreate
		if f.tradeNo == fmt.Sprintf("matrix-fresh-paypal-%s", dbType) ||
			f.tradeNo == fmt.Sprintf("matrix-fresh-waffo-pancake-%s", dbType) {
			// Seed fresh rows one hour in the future so no plausible
			// cleaner cutoff can reach them.
			createTime = now + int64(maxAge/time.Second)
		}
		topUp := &TopUp{
			UserId:          9500 + i,
			Amount:          1,
			Money:           10.00,
			TradeNo:         f.tradeNo,
			PaymentMethod:   f.provider,
			PaymentProvider: f.provider,
			Status:          f.status,
			CreateTime:      createTime,
			CompleteTime:    f.completeTime,
		}
		require.NoError(t, db.Create(topUp).Error, "seed %s on %s", f.tradeNo, dbType)
	}

	expectedExpired := int64(0)
	for _, f := range fixtures {
		if f.countsTowards {
			expectedExpired++
		}
	}

	expired := CleanExpiredPendingTopUps(maxAge)
	assert.Equal(t, expectedExpired, expired,
		"on %s: RowsAffected must equal the actual count of stale PayPal + stale Waffo Pancake orders",
		dbType)

	for _, f := range fixtures {
		var row TopUp
		require.NoError(t, db.Where("trade_no = ?", f.tradeNo).First(&row).Error,
			"row %s must still exist on %s", f.tradeNo, dbType)
		assert.Equal(t, f.expectStatus, row.Status,
			"on %s: row %s (provider=%q, seeded=%q) must end up as %q, got %q",
			dbType, f.tradeNo, f.provider, f.status, f.expectStatus, row.Status)
	}
}
