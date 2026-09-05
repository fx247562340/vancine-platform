//go:build dbmatrix

package model

import (
	"fmt"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestMatrixInitDB runs the production InitDB + InitLogDB sequence against
// MATRIX_SQL_DSN (and optional MATRIX_LOG_SQL_DSN). Invoked by the release-gate
// database matrix, not by go test ./...
func TestMatrixInitDB(t *testing.T) {
	dsn := os.Getenv("MATRIX_SQL_DSN")
	if dsn == "" && os.Getenv("MATRIX_SQLITE_PATH") == "" {
		t.Skip("MATRIX_SQL_DSN or MATRIX_SQLITE_PATH required")
	}
	if dsn != "" {
		t.Setenv("SQL_DSN", dsn)
	} else {
		t.Setenv("SQL_DSN", "")
		t.Setenv("SQLITE_PATH", os.Getenv("MATRIX_SQLITE_PATH"))
		common.SQLitePath = os.Getenv("MATRIX_SQLITE_PATH")
	}
	if logDSN := os.Getenv("MATRIX_LOG_SQL_DSN"); logDSN != "" {
		t.Setenv("LOG_SQL_DSN", logDSN)
	} else {
		t.Setenv("LOG_SQL_DSN", "")
	}

	common.IsMasterNode = true
	require.NoError(t, InitDB(), "InitDB (production startup path)")
	require.NoError(t, InitLogDB(), "InitLogDB (production startup path)")

	if os.Getenv("MATRIX_LOG_SQL_DSN") != "" {
		require.NotNil(t, DB)
		require.NotNil(t, LOG_DB)
		sqlDB, err := DB.DB()
		require.NoError(t, err)
		logSQL, err := LOG_DB.DB()
		require.NoError(t, err)
		assert.NotEqual(t, sqlDB, logSQL, "independent LOG_SQL_DSN must not share the main handle")
	}

	require.NoError(t, DB.Exec("SELECT quota, used_quota, aff_quota, aff_history FROM users WHERE 1=0").Error, "users wallet columns")
	require.True(t, DB.Migrator().HasTable(&Token{}), "tokens")
	require.True(t, DB.Migrator().HasTable(&TopUp{}), "top_ups")
	require.True(t, DB.Migrator().HasTable(&PrefillGroup{}), "prefill_groups")
	require.NoError(t, LOG_DB.Exec("SELECT id FROM logs WHERE 1=0").Error, "logs")

	assertSeededRowValues(t)
	assertSchemaIndexesAndUniqueness(t)

	if expected := os.Getenv("MATRIX_EXPECT_WALLET_TYPES"); expected != "" {
		assertWalletColumnTypes(t, expected)
	}
	if expected := os.Getenv("MATRIX_EXPECT_TOPUP_TYPES"); expected != "" {
		assertTopUpQuotaColumnTypes(t, expected)
	}
	if dump := os.Getenv("MATRIX_AUDIT_DUMP"); dump != "" {
		dumpWalletAuditEvidence(t, dump)
	}
}

func TestMatrixRefuseOutOfRangeBigint(t *testing.T) {
	if os.Getenv("MATRIX_EXPECT_REFUSE") != "1" {
		t.Skip("MATRIX_EXPECT_REFUSE=1 required")
	}
	dsn := os.Getenv("MATRIX_SQL_DSN")
	require.NotEmpty(t, dsn)
	t.Setenv("SQL_DSN", dsn)
	t.Setenv("LOG_SQL_DSN", "")
	common.IsMasterNode = true
	err := InitDB()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "32-bit is not supported")
}

func TestMatrixAllowMaxQuota(t *testing.T) {
	if os.Getenv("MATRIX_EXPECT_MAXQUOTA_OK") != "1" {
		t.Skip("MATRIX_EXPECT_MAXQUOTA_OK=1 required")
	}
	dsn := os.Getenv("MATRIX_SQL_DSN")
	require.NotEmpty(t, dsn)
	t.Setenv("SQL_DSN", dsn)
	t.Setenv("LOG_SQL_DSN", "")
	common.IsMasterNode = true
	require.NoError(t, InitDB())
	var user User
	require.NoError(t, DB.Where("username = ?", "matrix_maxquota_user").First(&user).Error)
	assert.Equal(t, common.MaxQuota, user.Quota)
}

func TestMatrixAllowAboveMaxQuota(t *testing.T) {
	if os.Getenv("MATRIX_EXPECT_ABOVE_MAXQUOTA") != "1" {
		t.Skip("MATRIX_EXPECT_ABOVE_MAXQUOTA=1 required")
	}
	dsn := os.Getenv("MATRIX_SQL_DSN")
	if dsn != "" {
		t.Setenv("SQL_DSN", dsn)
	} else {
		t.Setenv("SQL_DSN", "")
		t.Setenv("SQLITE_PATH", os.Getenv("MATRIX_SQLITE_PATH"))
		common.SQLitePath = os.Getenv("MATRIX_SQLITE_PATH")
	}
	t.Setenv("LOG_SQL_DSN", "")
	common.IsMasterNode = true
	require.NoError(t, InitDB())
	var user User
	require.NoError(t, DB.Where("username = ?", os.Getenv("MATRIX_EXPECT_USER")).First(&user).Error)
	assert.Greater(t, user.Quota, common.MaxQuota)
	assert.LessOrEqual(t, user.Quota, common.MaxWalletQuota)
}

func assertSeededRowValues(t *testing.T) {
	t.Helper()
	if marker := os.Getenv("MATRIX_EXPECT_USER"); marker != "" {
		var user User
		require.NoError(t, DB.Where("username = ?", marker).First(&user).Error, "seeded user %s must survive", marker)
		if q := os.Getenv("MATRIX_EXPECT_USER_QUOTA"); q != "" {
			assert.Equal(t, q, fmt.Sprintf("%d", user.Quota), "user.quota")
		}
		if q := os.Getenv("MATRIX_EXPECT_USED_QUOTA"); q != "" {
			assert.Equal(t, q, fmt.Sprintf("%d", user.UsedQuota), "user.used_quota")
		}
		if q := os.Getenv("MATRIX_EXPECT_AFF_QUOTA"); q != "" {
			assert.Equal(t, q, fmt.Sprintf("%d", user.AffQuota), "user.aff_quota")
		}
		if q := os.Getenv("MATRIX_EXPECT_AFF_HISTORY"); q != "" {
			assert.Equal(t, q, fmt.Sprintf("%d", user.AffHistoryQuota), "user.aff_history")
		}
		if g := os.Getenv("MATRIX_EXPECT_USER_GROUP"); g != "" {
			assert.Equal(t, g, user.Group, "user.group")
		}
	}
	if marker := os.Getenv("MATRIX_EXPECT_TOKEN"); marker != "" {
		var tok Token
		require.NoError(t, DB.Where("name = ?", marker).First(&tok).Error, "seeded token %s must survive", marker)
		if q := os.Getenv("MATRIX_EXPECT_TOKEN_REMAIN"); q != "" {
			assert.Equal(t, q, fmt.Sprintf("%d", tok.RemainQuota), "token.remain_quota")
		}
		if k := os.Getenv("MATRIX_EXPECT_TOKEN_KEY"); k != "" {
			assert.Equal(t, k, tok.Key, "token.key")
		}
		if s := os.Getenv("MATRIX_EXPECT_TOKEN_STATUS"); s != "" {
			assert.Equal(t, s, fmt.Sprintf("%d", tok.Status), "token.status")
		}
	}
	if trade := os.Getenv("MATRIX_EXPECT_TOPUP"); trade != "" {
		var topup TopUp
		require.NoError(t, DB.Where("trade_no = ?", trade).First(&topup).Error, "seeded top_up %s must survive", trade)
		if a := os.Getenv("MATRIX_EXPECT_TOPUP_AMOUNT"); a != "" {
			assert.Equal(t, a, fmt.Sprintf("%d", topup.Amount), "top_up.amount")
		}
		if m := os.Getenv("MATRIX_EXPECT_TOPUP_MONEY"); m != "" {
			assert.Equal(t, m, fmt.Sprintf("%.2f", topup.Money), "top_up.money")
		}
		if s := os.Getenv("MATRIX_EXPECT_TOPUP_STATUS"); s != "" {
			assert.Equal(t, s, topup.Status, "top_up.status")
		}
		if p := os.Getenv("MATRIX_EXPECT_TOPUP_METHOD"); p != "" {
			assert.Equal(t, p, topup.PaymentMethod, "top_up.payment_method")
		}
	}
	if content := os.Getenv("MATRIX_EXPECT_LOG"); content != "" {
		var lg Log
		require.NoError(t, LOG_DB.Where("content = ?", content).First(&lg).Error, "seeded log must survive in LOG_SQL_DSN")
		if u := os.Getenv("MATRIX_EXPECT_LOG_USERNAME"); u != "" {
			assert.Equal(t, u, lg.Username, "log.username")
		}
		if ty := os.Getenv("MATRIX_EXPECT_LOG_TYPE"); ty != "" {
			assert.Equal(t, ty, fmt.Sprintf("%d", lg.Type), "log.type")
		}
		if uid := os.Getenv("MATRIX_EXPECT_LOG_USER_ID"); uid != "" {
			assert.Equal(t, uid, fmt.Sprintf("%d", lg.UserId), "log.user_id")
		}
	}
}
