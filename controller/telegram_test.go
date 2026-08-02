package controller

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupTelegramControllerTest(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	origDB := model.DB
	origLogDB := model.LOG_DB
	origCrypto := common.CryptoSecret
	origSQLite := common.UsingSQLite
	origMySQL := common.UsingMySQL
	origPG := common.UsingPostgreSQL
	origRedis := common.RedisEnabled
	origRegister := common.RegisterEnabled
	origTelegramEnabled := common.TelegramOAuthEnabled
	origTelegramToken := common.TelegramBotToken
	origSessionSecret := common.SessionSecret
	t.Cleanup(func() {
		if model.DB != nil && model.DB != origDB {
			if sqlDB, err := model.DB.DB(); err == nil {
				_ = sqlDB.Close()
			}
		}
		model.DB = origDB
		model.LOG_DB = origLogDB
		common.CryptoSecret = origCrypto
		common.UsingSQLite = origSQLite
		common.UsingMySQL = origMySQL
		common.UsingPostgreSQL = origPG
		common.RedisEnabled = origRedis
		common.RegisterEnabled = origRegister
		common.TelegramOAuthEnabled = origTelegramEnabled
		common.TelegramBotToken = origTelegramToken
		common.SessionSecret = origSessionSecret
	})

	common.CryptoSecret = "telegram-controller-test-secret"
	common.SessionSecret = "telegram-controller-session-secret"
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false
	common.RegisterEnabled = true
	common.TelegramOAuthEnabled = true
	common.TelegramBotToken = "telegram-test-token"

	dsn := "file:tg_ctrl_" + strconv.FormatInt(int64(os.Getpid()), 10) + "_" + strings.ReplaceAll(t.Name(), "/", "_") + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	model.LOG_DB = db
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.AcquisitionTouch{}))
}

func telegramSignedQuery(t *testing.T, token string, fields map[string]string) string {
	t.Helper()
	vals := url.Values{}
	parts := make([]string, 0, len(fields))
	for k, v := range fields {
		vals.Set(k, v)
		parts = append(parts, k+"="+v)
	}
	sort.Strings(parts)
	imploded := strings.Join(parts, "\n")
	sha := sha256.New()
	_, _ = io.WriteString(sha, token)
	mac := hmac.New(sha256.New, sha.Sum(nil))
	_, _ = io.WriteString(mac, imploded)
	vals.Set("hash", hex.EncodeToString(mac.Sum(nil)))
	return vals.Encode()
}

func newTelegramLoginEngine() *gin.Engine {
	engine := gin.New()
	store := cookie.NewStore([]byte(common.SessionSecret))
	engine.Use(sessions.Sessions("session", store))
	engine.GET("/api/oauth/telegram/login", TelegramLogin)
	return engine
}

func TestCheckTelegramAuthorization(t *testing.T) {
	token := "test-bot-token"
	params := map[string][]string{
		"id":         {"42"},
		"first_name": {"Ada"},
		"auth_date":  {"1700000000"},
	}
	strs := []string{"auth_date=1700000000", "first_name=Ada", "id=42"}
	imploded := strings.Join(strs, "\n")
	sha256hash := sha256.New()
	_, _ = io.WriteString(sha256hash, token)
	hmachash := hmac.New(sha256.New, sha256hash.Sum(nil))
	_, _ = io.WriteString(hmachash, imploded)
	params["hash"] = []string{hex.EncodeToString(hmachash.Sum(nil))}

	assert.True(t, checkTelegramAuthorization(params, token))
	params["hash"] = []string{"deadbeef"}
	assert.False(t, checkTelegramAuthorization(params, token))
}

func TestTelegramDisplayName(t *testing.T) {
	assert.Equal(t, "Ada Lovelace", telegramDisplayName(map[string][]string{
		"first_name": {"Ada"},
		"last_name":  {"Lovelace"},
	}))
	assert.Equal(t, "ada_bot", telegramDisplayName(map[string][]string{
		"username": {"ada_bot"},
	}))
	assert.Equal(t, "Telegram User", telegramDisplayName(map[string][]string{}))
}

func TestTelegramLoginAutoRegistersWhenUnknown(t *testing.T) {
	setupTelegramControllerTest(t)

	query := telegramSignedQuery(t, common.TelegramBotToken, map[string]string{
		"id":         "900001",
		"first_name": "Grace",
		"last_name":  "Hopper",
		"username":   "ghopper",
		"auth_date":  "1700000001",
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/oauth/telegram/login?"+query, nil)
	newTelegramLoginEngine().ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, true, body["success"], w.Body.String())

	var created model.User
	require.NoError(t, model.DB.Where("telegram_id = ?", "900001").First(&created).Error)
	assert.Equal(t, "900001", created.TelegramId)
	assert.Equal(t, "Grace Hopper", created.DisplayName)
	assert.True(t, strings.HasPrefix(created.Username, "telegram_"))
	assert.Equal(t, common.RoleCommonUser, created.Role)
	assert.Equal(t, common.UserStatusEnabled, created.Status)
}

func TestTelegramLoginExistingUserDoesNotCreateDuplicate(t *testing.T) {
	setupTelegramControllerTest(t)

	existing := &model.User{
		Username:    "tg_existing_user",
		DisplayName: "Existing TG",
		TelegramId:  "900002",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	require.NoError(t, existing.Insert(0))

	var beforeCount int64
	require.NoError(t, model.DB.Model(&model.User{}).Count(&beforeCount).Error)

	query := telegramSignedQuery(t, common.TelegramBotToken, map[string]string{
		"id":        "900002",
		"auth_date": "1700000002",
	})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/oauth/telegram/login?"+query, nil)
	newTelegramLoginEngine().ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, true, body["success"], w.Body.String())

	var afterCount int64
	require.NoError(t, model.DB.Model(&model.User{}).Count(&afterCount).Error)
	assert.Equal(t, beforeCount, afterCount)
}

func TestTelegramLoginRegistrationDisabled(t *testing.T) {
	setupTelegramControllerTest(t)
	common.RegisterEnabled = false

	query := telegramSignedQuery(t, common.TelegramBotToken, map[string]string{
		"id":        "900003",
		"auth_date": "1700000003",
	})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/oauth/telegram/login?"+query, nil)
	newTelegramLoginEngine().ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, false, body["success"])
	assert.Equal(t, "管理员关闭了新用户注册", body["message"])

	var count int64
	require.NoError(t, model.DB.Model(&model.User{}).Where("telegram_id = ?", "900003").Count(&count).Error)
	assert.Equal(t, int64(0), count)
}

func TestTelegramLoginInvalidSignature(t *testing.T) {
	setupTelegramControllerTest(t)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/oauth/telegram/login?id=1&auth_date=1&hash=deadbeef", nil)
	newTelegramLoginEngine().ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, false, body["success"])
	assert.Equal(t, "无效的请求", body["message"])
}
