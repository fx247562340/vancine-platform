package controller

import (
	"bytes"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// googleOAuthTestEnv is the isolated fixture for Google OAuth controller
// tests. The Google token/userinfo endpoints point at a local httptest server,
// so no real Google request is ever made; the client ID/secret are throwaway
// test fixtures, never production values.
//
// The mock is safe for concurrent callbacks: counters and recorded server
// errors are guarded by a mutex, subjectByToken lets a test hand each racing
// request its own upstream identity (the token endpoint echoes the code into
// the access token, and the userinfo endpoint serves the subject mapped to
// that token), and the handler never touches testing.T/require/assert — it
// runs on the server goroutine, so failures are recorded as plain errors for
// the test goroutine to assert on after every worker joined.
type googleOAuthTestEnv struct {
	db             *gorm.DB
	userInfoSub    string
	userInfoEmail  string
	userInfoName   string
	subjectByToken map[string]string
	emailByToken   map[string]string

	mu            sync.Mutex
	tokenCalls    int
	userInfoCalls int
	serverErrors  []error
}

func (env *googleOAuthTestEnv) countTokenCall() {
	env.mu.Lock()
	defer env.mu.Unlock()
	env.tokenCalls++
}

func (env *googleOAuthTestEnv) countUserInfoCall() {
	env.mu.Lock()
	defer env.mu.Unlock()
	env.userInfoCalls++
}

func (env *googleOAuthTestEnv) resolveSubject(accessToken string) string {
	env.mu.Lock()
	defer env.mu.Unlock()
	if subject, ok := env.subjectByToken[accessToken]; ok {
		return subject
	}
	return env.userInfoSub
}

func (env *googleOAuthTestEnv) resolveEmail(accessToken string) string {
	env.mu.Lock()
	defer env.mu.Unlock()
	if email, ok := env.emailByToken[accessToken]; ok {
		return email
	}
	return env.userInfoEmail
}

func (env *googleOAuthTestEnv) tokenCallCount() int {
	env.mu.Lock()
	defer env.mu.Unlock()
	return env.tokenCalls
}

// recordServerError keeps a mock-server failure for the test goroutine; the
// handler runs on the server goroutine and must never call testing.T.
func (env *googleOAuthTestEnv) recordServerError(err error) {
	env.mu.Lock()
	defer env.mu.Unlock()
	env.serverErrors = append(env.serverErrors, err)
}

// serverErrorSnapshot returns a copy of the recorded mock-server errors so
// the test goroutine can assert on them after every concurrent worker joined.
func (env *googleOAuthTestEnv) serverErrorSnapshot() []error {
	env.mu.Lock()
	defer env.mu.Unlock()
	snapshot := make([]error, len(env.serverErrors))
	copy(snapshot, env.serverErrors)
	return snapshot
}

// googleLaunchProfileModels is the AutoMigrate set for Google durable-claim /
// anti-lockout launch-profile fixtures. It is intentionally broader than the
// minimal OAuth callback set so one remote database can host bind, unbind,
// passkey and custom-OAuth scenarios without a second migrate pass.
func googleLaunchProfileModels() []any {
	return []any{
		&model.AuthFlow{},
		&model.User{},
		&model.ExternalIdentityClaim{},
		&model.UserSession{},
		&model.Log{},
		&model.PasskeyCredential{},
		&model.CustomOAuthProvider{},
		&model.UserOAuthBinding{},
		&model.TwoFA{},
		&model.TwoFABackupCode{},
	}
}

// setupGoogleOAuthTest opens the fixture on an in-memory database by default;
// pass a file-backed DSN for concurrency tests, where each pooled connection
// must see one shared database.
func setupGoogleOAuthTest(t *testing.T, dsnOverride ...string) *googleOAuthTestEnv {
	t.Helper()
	dsn := ":memory:"
	if len(dsnOverride) > 0 {
		dsn = dsnOverride[0]
	}
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	// SQLite fixtures keep the historical minimal migrate set so existing tests
	// stay byte-for-byte on their original schema surface; remote launch-profile
	// entry points migrate the broader set via setupGoogleOAuthTestOn.
	require.NoError(t, db.AutoMigrate(&model.AuthFlow{}, &model.User{},
		&model.ExternalIdentityClaim{}, &model.UserSession{}, &model.Log{}))
	return finishGoogleOAuthTestSetup(t, db, common.DatabaseTypeSQLite, false)
}

// setupGoogleOAuthTestOn opens the Google OAuth fixture on MySQL/PostgreSQL
// using baseDSN. PreferSimpleProtocol stays disabled for PostgreSQL so typed
// columns describe correctly. The DSN itself is never logged. Each call gets
// an isolated database (CREATE DATABASE) so parallel package tests sharing
// TEST_*_DSN cannot collide on public tables. Cleanup is registered
// progressively inside the opener so a failure after CREATE still drops the
// throwaway database.
func setupGoogleOAuthTestOn(t *testing.T, baseDSN string, dbType common.DatabaseType) *googleOAuthTestEnv {
	t.Helper()
	db := openIsolatedConfiguredDB(t, baseDSN, dbType)
	require.NoError(t, db.AutoMigrate(googleLaunchProfileModels()...))
	return finishGoogleOAuthTestSetup(t, db, dbType, true)
}

// openIsolatedConfiguredDB creates a throwaway MySQL/PostgreSQL database on
// the configured server. Progressive t.Cleanup registrations guarantee that a
// failure after CREATE DATABASE still drops the database and closes every
// pool. Credentials are never logged.
func openIsolatedConfiguredDB(t *testing.T, baseDSN string, dbType common.DatabaseType) *gorm.DB {
	t.Helper()
	baseDSN = strings.TrimSpace(baseDSN)
	require.NotEmpty(t, baseDSN)
	switch dbType {
	case common.DatabaseTypePostgreSQL:
		return openIsolatedPostgresDB(t, baseDSN)
	case common.DatabaseTypeMySQL:
		return openIsolatedMySQLDB(t, baseDSN)
	default:
		require.FailNowf(t, "unsupported configured database type", "%v", dbType)
		return nil
	}
}

// isolatedPostgresAfterCreateHook is a test-only seam used by the fatal
// cleanup subprocess fixture. Production tests leave it nil. The hook runs
// after CREATE DATABASE and before the test pool is opened; a non-nil error
// is surfaced via require.NoError (FailNow) while already-registered DROP
// cleanup still runs.
var isolatedPostgresAfterCreateHook func(dbName string) error

func openIsolatedPostgresDB(t *testing.T, baseDSN string) *gorm.DB {
	t.Helper()
	// Alphanumeric-only name: safe as an unquoted PostgreSQL identifier.
	dbName := fmt.Sprintf("p9b_%d_%d", os.Getpid(), time.Now().UnixNano())

	admin, err := gorm.Open(postgres.New(postgres.Config{DSN: baseDSN}), &gorm.Config{})
	require.NoError(t, err)
	adminSQL, err := admin.DB()
	require.NoError(t, err)

	var (
		adminCloseOnce sync.Once
		testCloseOnce  sync.Once
		dropOnce       sync.Once
		sqlDB          *sql.DB
		dbCreated      bool
	)
	closeAdmin := func() {
		adminCloseOnce.Do(func() {
			assert.NoError(t, adminSQL.Close())
		})
	}
	closeTest := func() {
		testCloseOnce.Do(func() {
			if sqlDB != nil {
				assert.NoError(t, sqlDB.Close())
			}
		})
	}
	dropDB := func() {
		dropOnce.Do(func() {
			if !dbCreated {
				return
			}
			_, termErr := adminSQL.Exec(
				`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
				dbName,
			)
			assert.NoError(t, termErr)
			_, dropErr := adminSQL.Exec("DROP DATABASE IF EXISTS " + dbName)
			assert.NoError(t, dropErr)
			dbCreated = false
		})
	}
	// LIFO teardown order desired: close test pool → DROP database → close admin.
	// Register admin-close first so it runs last.
	t.Cleanup(closeAdmin)

	// CREATE/DROP DATABASE must run outside a transaction on a plain connection.
	_, err = adminSQL.Exec("CREATE DATABASE " + dbName)
	require.NoError(t, err)
	dbCreated = true
	t.Cleanup(func() {
		closeTest()
		dropDB()
	})

	if isolatedPostgresAfterCreateHook != nil {
		// require.NoError FailNows on error after CREATE DATABASE. Cleanups
		// already registered on t still run, so the throwaway database is dropped.
		require.NoError(t, isolatedPostgresAfterCreateHook(dbName))
	}

	testDSN, err := replacePostgresDSNDBName(baseDSN, dbName)
	require.NoError(t, err)
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: testDSN}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err = db.DB()
	require.NoError(t, err)
	t.Cleanup(closeTest)
	return db
}

func openIsolatedMySQLDB(t *testing.T, baseDSN string) *gorm.DB {
	t.Helper()
	dbName := fmt.Sprintf("p9b_%d_%d", os.Getpid(), time.Now().UnixNano())

	admin, err := gorm.Open(mysql.Open(baseDSN), &gorm.Config{})
	require.NoError(t, err)
	adminSQL, err := admin.DB()
	require.NoError(t, err)

	var (
		adminCloseOnce sync.Once
		testCloseOnce  sync.Once
		dropOnce       sync.Once
		sqlDB          *sql.DB
		dbCreated      bool
	)
	closeAdmin := func() {
		adminCloseOnce.Do(func() {
			assert.NoError(t, adminSQL.Close())
		})
	}
	closeTest := func() {
		testCloseOnce.Do(func() {
			if sqlDB != nil {
				assert.NoError(t, sqlDB.Close())
			}
		})
	}
	dropDB := func() {
		dropOnce.Do(func() {
			if !dbCreated {
				return
			}
			_, dropErr := adminSQL.Exec("DROP DATABASE IF EXISTS `" + dbName + "`")
			assert.NoError(t, dropErr)
			dbCreated = false
		})
	}
	t.Cleanup(closeAdmin)

	_, err = adminSQL.Exec("CREATE DATABASE `" + dbName + "`")
	require.NoError(t, err)
	dbCreated = true
	t.Cleanup(func() {
		closeTest()
		dropDB()
	})

	testDSN := replaceMySQLDSNDatabase(baseDSN, dbName)
	db, err := gorm.Open(mysql.Open(testDSN), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err = db.DB()
	require.NoError(t, err)
	t.Cleanup(closeTest)
	return db
}

// replacePostgresDSNDBName rewrites only the database name of a PostgreSQL DSN.
// It supports keyword/value DSNs and postgres:// / postgresql:// URIs, and
// preserves query parameters and percent-encoded credentials. The returned
// string is safe to pass to the driver; this helper never logs the DSN.
func replacePostgresDSNDBName(dsn, dbName string) (string, error) {
	dsn = strings.TrimSpace(dsn)
	if dbName == "" {
		return "", fmt.Errorf("postgres db name is empty")
	}
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		u, err := url.Parse(dsn)
		if err != nil {
			return "", err
		}
		// URI path is "/dbname"; keep RawPath empty so String() re-encodes cleanly.
		u.Path = "/" + dbName
		u.RawPath = ""
		return u.String(), nil
	}
	parts := strings.Fields(dsn)
	replaced := false
	for i, part := range parts {
		if strings.HasPrefix(part, "dbname=") {
			parts[i] = "dbname=" + dbName
			replaced = true
		}
	}
	if !replaced {
		parts = append(parts, "dbname="+dbName)
	}
	return strings.Join(parts, " "), nil
}

// replaceMySQLDSNDatabase rewrites the /database segment of a MySQL DSN
// (user:pass@tcp(host:port)/dbname?params).
func replaceMySQLDSNDatabase(dsn, dbName string) string {
	slash := strings.LastIndex(dsn, "/")
	if slash < 0 {
		return dsn + "/" + dbName
	}
	rest := dsn[slash+1:]
	q := strings.Index(rest, "?")
	if q >= 0 {
		return dsn[:slash+1] + dbName + rest[q:]
	}
	return dsn[:slash+1] + dbName
}

// configuredDatabaseTargets lists optional external databases for launch-
// profile entry points. Each env is skipped cleanly when unset so ordinary
// `go test ./...` never depends on an external server.
func configuredDatabaseTargets() []struct {
	name   string
	env    string
	dbType common.DatabaseType
} {
	return []struct {
		name   string
		env    string
		dbType common.DatabaseType
	}{
		{name: "mysql", env: "TEST_MYSQL_DSN", dbType: common.DatabaseTypeMySQL},
		{name: "postgres", env: "TEST_POSTGRES_DSN", dbType: common.DatabaseTypePostgreSQL},
	}
}

// finishGoogleOAuthTestSetup publishes globals, starts the mock Google server
// and registers the ordered cleanup. remoteOwned marks that the remote opener
// already registered pool/database cleanup (so this helper must not close the
// pool a second time).

func finishGoogleOAuthTestSetup(t *testing.T, db *gorm.DB, dbType common.DatabaseType, remoteOwned bool) *googleOAuthTestEnv {
	t.Helper()
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())
	previousDB := model.DB
	previousDBType := common.MainDatabaseType()
	previousEnabled := common.GoogleOAuthEnabled
	previousClientID := common.GoogleClientId
	previousClientSecret := common.GoogleClientSecret
	previousRedirect := common.GoogleRedirectUri
	previousServerAddress := system_setting.ServerAddress
	previousTokenEndpoint := oauth.GoogleTokenEndpoint
	previousUserInfoEndpoint := oauth.GoogleUserInfoEndpoint
	previousRegisterEnabled := common.RegisterEnabled
	previousOptionMap := common.OptionMap
	previousRedisEnabled := common.RedisEnabled
	previousLogDB := model.LOG_DB
	previousCryptoSecret := common.CryptoSecret
	previousPasswordLogin := common.PasswordLoginEnabled
	previousGitHubEnabled := common.GitHubOAuthEnabled
	previousPasskeyEnabled := system_setting.GetPasskeySettings().Enabled

	env := &googleOAuthTestEnv{
		db:            db,
		userInfoSub:   "google-sub-1",
		userInfoEmail: "bind-user@example.com",
		userInfoName:  "Bind User",
	}
	mockGoogle := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/token":
			env.countTokenCall()
			code := r.FormValue("code")
			body, err := common.Marshal(map[string]any{
				"access_token": "mock-access-" + code,
				"token_type":   "Bearer",
				"expires_in":   3600,
				"scope":        "openid email profile",
			})
			if err != nil {
				env.recordServerError(fmt.Errorf("mock google token response: %w", err))
				http.Error(w, "mock token marshal failure", http.StatusInternalServerError)
				return
			}
			_, _ = w.Write(body)
		case "/userinfo":
			env.countUserInfoCall()
			body, err := common.Marshal(map[string]any{
				"sub":            env.resolveSubject(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")),
				"email":          env.resolveEmail(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")),
				"email_verified": true,
				"name":           env.userInfoName,
			})
			if err != nil {
				env.recordServerError(fmt.Errorf("mock google userinfo response: %w", err))
				http.Error(w, "mock userinfo marshal failure", http.StatusInternalServerError)
				return
			}
			_, _ = w.Write(body)
		default:
			http.NotFound(w, r)
		}
	}))

	model.DB = db
	common.SetMainDatabaseType(dbType)
	common.GoogleOAuthEnabled = true
	common.GoogleClientId = "google-test-client-id"
	common.GoogleClientSecret = "google-test-client-secret"
	common.GoogleRedirectUri = ""
	system_setting.ServerAddress = "https://vancine.example.com"
	common.RegisterEnabled = false
	common.OptionMap = map[string]string{}
	common.RedisEnabled = false
	model.LOG_DB = db
	common.CryptoSecret = "google-oauth-controller-test-secret"
	common.PasswordLoginEnabled = true
	common.GitHubOAuthEnabled = false
	system_setting.GetPasskeySettings().Enabled = false
	oauth.GoogleTokenEndpoint = mockGoogle.URL + "/token"
	oauth.GoogleUserInfoEndpoint = mockGoogle.URL + "/userinfo"

	// Single cleanup with an explicit dependency order: stop the mock server,
	// restore every global so no later test or late goroutine reaches this
	// fixture through model.DB/model.LOG_DB, and only then close the pool
	// (unless a remote owner already registered DropTable+Close).
	t.Cleanup(func() {
		mockGoogle.Close()
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.CryptoSecret = previousCryptoSecret
		common.SetMainDatabaseType(previousDBType)
		common.GoogleOAuthEnabled = previousEnabled
		common.GoogleClientId = previousClientID
		common.GoogleClientSecret = previousClientSecret
		common.GoogleRedirectUri = previousRedirect
		system_setting.ServerAddress = previousServerAddress
		common.RegisterEnabled = previousRegisterEnabled
		common.OptionMap = previousOptionMap
		oauth.GoogleTokenEndpoint = previousTokenEndpoint
		oauth.GoogleUserInfoEndpoint = previousUserInfoEndpoint
		common.RedisEnabled = previousRedisEnabled
		common.PasswordLoginEnabled = previousPasswordLogin
		common.GitHubOAuthEnabled = previousGitHubEnabled
		system_setting.GetPasskeySettings().Enabled = previousPasskeyEnabled
		if !remoteOwned {
			sqlDB, err := db.DB()
			require.NoError(t, err)
			assert.NoError(t, sqlDB.Close())
		}
	})
	return env
}

func createGoogleOAuthTestUser(t *testing.T, db *gorm.DB, username string) *model.User {
	t.Helper()
	user := &model.User{
		Username:    username,
		Password:    "unused",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		Group:       "default",
		AffCode:     username,
		AuthVersion: 1,
	}
	require.NoError(t, db.Create(user).Error)
	return user
}

func newGoogleOAuthContext(method, target string, body io.Reader, userID int, sessionID string) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(method, target, body)
	if body != nil {
		context.Request.Header.Set("Content-Type", "application/json")
	}
	if userID > 0 {
		context.Set("id", userID)
		context.Set("session_id", sessionID)
		context.Set("auth_version", int64(1))
		context.Set("session_version", int64(1))
	}
	return context, recorder
}

// startGoogleBindFlow drives the real POST /api/oauth/state controller with a
// session identity, exactly like the account-binding page does.
func startGoogleBindFlow(t *testing.T, user *model.User, sessionID string) string {
	t.Helper()
	context, recorder := newGoogleOAuthContext(http.MethodPost, "/api/oauth/state",
		strings.NewReader(`{"provider":"google","intent":"bind"}`), user.Id, sessionID)
	GenerateOAuthCode(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.NotEmpty(t, response.Data.FlowToken)
	return response.Data.FlowToken
}

// startGoogleLoginFlow drives the real POST /api/oauth/state controller for
// an anonymous login-intent flow, exactly like the SPA login page does.
func startGoogleLoginFlow(t *testing.T) string {
	t.Helper()
	context, recorder := newGoogleOAuthContext(http.MethodPost, "/api/oauth/state",
		strings.NewReader(`{"provider":"google","intent":"login"}`), 0, "")
	GenerateOAuthCode(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.NotEmpty(t, response.Data.FlowToken)
	return response.Data.FlowToken
}

// decodeLoginUserId extracts the logged-in user id from a successful unified
// OAuth login response.
func decodeLoginUserId(t *testing.T, recorder *httptest.ResponseRecorder) int {
	t.Helper()
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			User struct {
				Id int `json:"id"`
			} `json:"user"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success, "login response failed: %s", recorder.Body.String())
	require.NotZero(t, response.Data.User.Id)
	return response.Data.User.Id
}

// serveOAuthCallback runs HandleOAuth through a real gin router so the
// :provider route parameter is resolved exactly as in production. The gin
// mode is set once by the fixture setup; this helper must stay safe for
// concurrent callers.
func serveOAuthCallback(provider, query string, userID int, sessionID string) *httptest.ResponseRecorder {
	router := gin.New()
	router.Use(func(c *gin.Context) {
		if userID > 0 {
			c.Set("id", userID)
			c.Set("session_id", sessionID)
			c.Set("auth_version", int64(1))
			c.Set("session_version", int64(1))
		}
		c.Next()
	})
	router.GET("/api/oauth/:provider", HandleOAuth)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/oauth/"+provider+"?"+query, nil))
	return recorder
}

func decodeOAuthResponse(t *testing.T, recorder *httptest.ResponseRecorder) struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
} {
	t.Helper()
	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response
}

func reloadGoogleOAuthUser(t *testing.T, env *googleOAuthTestEnv, id int) model.User {
	t.Helper()
	var stored model.User
	require.NoError(t, env.db.First(&stored, id).Error)
	return stored
}

func TestBuildSelfUserDataReturnsGoogleSub(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	user := createGoogleOAuthTestUser(t, env.db, "self-dto-user")
	user.GoogleSub = "google-sub-self"

	data := buildSelfUserData(user)

	assert.Equal(t, "google-sub-self", data["google_sub"])
	// The DTO must never carry the Google client secret (or any value equal
	// to it), no matter which fields are added later.
	for key, value := range data {
		if text, ok := value.(string); ok {
			assert.NotEqual(t, common.GoogleClientSecret, text,
				"buildSelfUserData field %q leaks the Google client secret", key)
		}
	}
}

func TestGetStatusExposesGoogleBindConfiguration(t *testing.T) {
	setupGoogleOAuthTest(t)
	gin.SetMode(gin.TestMode)

	// resetBaseline restores the complete, valid Google configuration before
	// every subtest. Each subtest then mutates exactly the one variable it
	// verifies, so subtests never observe leftovers from earlier ones and
	// each also passes when run in isolation (go test -run '.../name').
	resetBaseline := func() {
		common.GoogleOAuthEnabled = true
		common.GoogleClientId = "google-test-client-id"
		common.GoogleClientSecret = "google-test-client-secret"
		common.GoogleRedirectUri = ""
		system_setting.ServerAddress = "https://vancine.example.com"
	}

	fetchStatus := func(t *testing.T) (*httptest.ResponseRecorder, map[string]any) {
		t.Helper()
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)
		GetStatus(context)
		var payload struct {
			Success bool           `json:"success"`
			Data    map[string]any `json:"data"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
		require.True(t, payload.Success)
		return recorder, payload.Data
	}

	t.Run("enabled google serves public bind configuration", func(t *testing.T) {
		resetBaseline()
		recorder, data := fetchStatus(t)
		assert.Equal(t, "google-test-client-id", data["google_client_id"])
		assert.Equal(t, oauth.GoogleRedirectUri(), data["google_redirect_uri"])
		assert.Equal(t, "https://vancine.example.com/oauth/google", data["google_redirect_uri"])
		// The client secret must never appear in the public status payload.
		body := recorder.Body.String()
		assert.NotContains(t, body, "google-test-client-secret")
		assert.NotContains(t, body, "google_client_secret")
	})

	t.Run("admin redirect override wins and is served verbatim", func(t *testing.T) {
		resetBaseline()
		common.GoogleRedirectUri = "https://cdn.example.com/oauth/google"
		_, data := fetchStatus(t)
		assert.Equal(t, "https://cdn.example.com/oauth/google", data["google_redirect_uri"])
	})

	t.Run("plain http redirect URI is served", func(t *testing.T) {
		resetBaseline()
		common.GoogleRedirectUri = "http://localhost:3000/oauth/google"
		_, data := fetchStatus(t)
		assert.Equal(t, "google-test-client-id", data["google_client_id"])
		assert.Equal(t, "http://localhost:3000/oauth/google", data["google_redirect_uri"])
	})

	t.Run("disabled google exposes no bind configuration", func(t *testing.T) {
		resetBaseline()
		common.GoogleOAuthEnabled = false
		_, data := fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
		assert.Equal(t, false, data["google_oauth"])
	})

	t.Run("whitespace client id exposes no bind configuration", func(t *testing.T) {
		resetBaseline()
		common.GoogleClientId = "   "
		_, data := fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
	})

	t.Run("empty server address degrades to a relative path and is not served", func(t *testing.T) {
		resetBaseline()
		// oauth.GoogleRedirectUri() falls back to ServerAddress +
		// "/oauth/google"; with an empty server address that is the relative
		// path "/oauth/google", which cannot anchor the same-origin callback.
		system_setting.ServerAddress = ""
		_, data := fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
		// The plain enable switch is still advertised even when the bind
		// configuration is unusable.
		assert.Equal(t, true, data["google_oauth"])
	})

	t.Run("relative redirect override is not served", func(t *testing.T) {
		resetBaseline()
		common.GoogleRedirectUri = "/oauth/google"
		_, data := fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
	})

	t.Run("javascript scheme redirect is not served", func(t *testing.T) {
		resetBaseline()
		common.GoogleRedirectUri = "javascript:alert(document.cookie)"
		_, data := fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
	})

	t.Run("data scheme redirect is not served", func(t *testing.T) {
		resetBaseline()
		common.GoogleRedirectUri = "data:text/html,<script>alert(1)</script>"
		_, data := fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
	})

	t.Run("redirect with userinfo or fragment is not served", func(t *testing.T) {
		resetBaseline()
		common.GoogleRedirectUri = "https://user:pass@vancine.example.com/oauth/google"
		_, data := fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
		// Restore the baseline before the second mutation so the fragment
		// case does not depend on the userinfo case running first.
		resetBaseline()
		common.GoogleRedirectUri = "https://vancine.example.com/oauth/google#fragment"
		_, data = fetchStatus(t)
		assertBindConfigurationAbsent(t, data)
	})

	t.Run("client secret is never served even when bind configuration is", func(t *testing.T) {
		resetBaseline()
		recorder, data := fetchStatus(t)
		assert.NotEmpty(t, data["google_client_id"])
		assert.NotContains(t, recorder.Body.String(), common.GoogleClientSecret)
	})
}

func assertBindConfigurationAbsent(t *testing.T, data map[string]any) {
	t.Helper()
	_, hasClientID := data["google_client_id"]
	_, hasRedirect := data["google_redirect_uri"]
	assert.False(t, hasClientID, "google_client_id must not be served")
	assert.False(t, hasRedirect, "google_redirect_uri must not be served")
}

func TestGoogleBindFlowWritesGoogleSubForOwningSession(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "google-bind-owner")

	state := startGoogleBindFlow(t, owner, "session-owner")

	// The bind flow is stored bound to the owning user and session.
	flow, err := model.GetAuthFlow(state, model.AuthFlowMatch{
		Purpose:   model.AuthFlowPurposeOAuth,
		Provider:  "google",
		Intent:    model.AuthFlowIntentBind,
		UserId:    owner.Id,
		SessionId: "session-owner",
	})
	require.NoError(t, err)
	assert.Equal(t, owner.Id, flow.UserId)
	assert.Equal(t, "session-owner", flow.SessionId)

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(state)+"&code=mock-code", owner.Id, "session-owner")
	require.Equal(t, http.StatusOK, recorder.Code)
	response := decodeOAuthResponse(t, recorder)
	require.True(t, response.Success, "bind callback failed: %s", response.Message)

	stored := reloadGoogleOAuthUser(t, env, owner.Id)
	assert.Equal(t, "google-sub-1", stored.GoogleSub)

	// The flow is single-use.
	_, err = model.GetAuthFlow(state, model.AuthFlowMatch{Purpose: model.AuthFlowPurposeOAuth})
	assert.ErrorIs(t, err, model.ErrAuthFlowConsumed)
}

func TestGoogleBindStateRequiresAuthenticatedSession(t *testing.T) {
	setupGoogleOAuthTest(t)

	context, recorder := newGoogleOAuthContext(http.MethodPost, "/api/oauth/state",
		strings.NewReader(`{"provider":"google","intent":"bind"}`), 0, "")
	GenerateOAuthCode(context)

	assert.Equal(t, http.StatusUnauthorized, recorder.Code)
	response := decodeOAuthResponse(t, recorder)
	assert.False(t, response.Success)
}

func TestGoogleLoginIntentFlowCannotBind(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "login-intent-user")

	// A login-intent flow carries no user/session, like every login entry.
	context, recorder := newGoogleOAuthContext(http.MethodPost, "/api/oauth/state",
		strings.NewReader(`{"provider":"google","intent":"login"}`), 0, "")
	GenerateOAuthCode(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	var stateResponse struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &stateResponse))
	require.True(t, stateResponse.Success)

	callback := serveOAuthCallback("google",
		"state="+url.QueryEscape(stateResponse.Data.FlowToken)+"&code=mock-code",
		owner.Id, "session-owner")
	response := decodeOAuthResponse(t, callback)
	assert.False(t, response.Success, "a login flow must never complete as a bind")

	stored := reloadGoogleOAuthUser(t, env, owner.Id)
	assert.Empty(t, stored.GoogleSub)
}

func TestGoogleBindRejectsCrossedSessionState(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "bind-owner-crossed")
	intruder := createGoogleOAuthTestUser(t, env.db, "bind-intruder")

	state := startGoogleBindFlow(t, owner, "session-owner")

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(state)+"&code=mock-code", intruder.Id, "session-intruder")
	assert.Equal(t, http.StatusForbidden, recorder.Code)
	assert.False(t, decodeOAuthResponse(t, recorder).Success)

	assert.Empty(t, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
	assert.Empty(t, reloadGoogleOAuthUser(t, env, intruder.Id).GoogleSub)
	// The rejected flow stays unconsumed but unusable by the intruder.
	_, err := model.GetAuthFlow(state, model.AuthFlowMatch{
		Purpose: model.AuthFlowPurposeOAuth, Provider: "google",
	})
	assert.NoError(t, err)
}

func TestGoogleBindRejectsStateOfAnotherProvider(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "bind-owner-provider")

	state := startGoogleBindFlow(t, owner, "session-owner")

	recorder := serveOAuthCallback("github",
		"state="+url.QueryEscape(state)+"&code=mock-code", owner.Id, "session-owner")
	assert.Equal(t, http.StatusForbidden, recorder.Code)
	assert.Empty(t, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
}

func TestGoogleBindRejectsForgedState(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "bind-owner-forged")

	recorder := serveOAuthCallback("google",
		"state=forged-state-token&code=mock-code", owner.Id, "session-owner")
	assert.Equal(t, http.StatusForbidden, recorder.Code)
	assert.Empty(t, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
	assert.Zero(t, env.tokenCallCount(), "a forged state must never reach the provider")
}

func TestGoogleBindStateReplayRejected(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "bind-owner-replay")

	state := startGoogleBindFlow(t, owner, "session-owner")
	first := serveOAuthCallback("google",
		"state="+url.QueryEscape(state)+"&code=mock-code", owner.Id, "session-owner")
	require.True(t, decodeOAuthResponse(t, first).Success)

	// Replay with a different upstream identity: the consumed state must be
	// rejected and must not overwrite the established binding.
	env.userInfoSub = "google-sub-2"
	replay := serveOAuthCallback("google",
		"state="+url.QueryEscape(state)+"&code=mock-code", owner.Id, "session-owner")
	assert.Equal(t, http.StatusForbidden, replay.Code)
	assert.False(t, decodeOAuthResponse(t, replay).Success)

	assert.Equal(t, "google-sub-1", reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
}

func TestGoogleBindRejectsSubAlreadyBoundToAnotherUser(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "bind-owner-taken")
	other := createGoogleOAuthTestUser(t, env.db, "bind-other-taken")
	// The competing user owns the subject through the durable bind path
	// (claim + mirror), exactly as a production binding would.
	require.NoError(t, env.db.Transaction(func(tx *gorm.DB) error {
		return model.BindGoogleIdentityWithTx(tx, "google-sub-taken", other.Id)
	}))

	env.userInfoSub = "google-sub-taken"
	state := startGoogleBindFlow(t, owner, "session-owner")

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(state)+"&code=mock-code", owner.Id, "session-owner")
	response := decodeOAuthResponse(t, recorder)
	assert.False(t, response.Success, "a Google account bound to another user must be rejected")
	assert.Equal(t,
		i18n.Translate(i18n.LangEn, i18n.MsgOAuthAlreadyBound, map[string]any{"Provider": "Google"}),
		response.Message)

	assert.Empty(t, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
	var ownerClaims []model.ExternalIdentityClaim
	require.NoError(t, env.db.Where("user_id = ?", owner.Id).Find(&ownerClaims).Error)
	assert.Empty(t, ownerClaims, "the rejected user must stay completely unbound")
	assert.Equal(t, "google-sub-taken", reloadGoogleOAuthUser(t, env, other.Id).GoogleSub)
}

func TestGoogleBindCallbackRejectsDisabledProvider(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "bind-owner-disabled")

	state := startGoogleBindFlow(t, owner, "session-owner")
	common.GoogleOAuthEnabled = false

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(state)+"&code=mock-code", owner.Id, "session-owner")
	response := decodeOAuthResponse(t, recorder)
	assert.False(t, response.Success)

	assert.Empty(t, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
	assert.Zero(t, env.tokenCallCount(), "a disabled provider must never reach Google")
}

// TestGoogleFirstLoginCreatesUserClaimAndMirror protects the registration
// path of the unified Google callback: one user, one durable Google claim and
// a consistent google_sub mirror, committed together.
func TestGoogleFirstLoginCreatesUserClaimAndMirror(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	common.RegisterEnabled = true

	state := startGoogleLoginFlow(t)
	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(state)+"&code=mock-code", 0, "")
	require.Equal(t, http.StatusOK, recorder.Code)
	require.True(t, decodeOAuthResponse(t, recorder).Success, recorder.Body.String())

	var users []model.User
	require.NoError(t, env.db.Find(&users).Error)
	require.Len(t, users, 1, "first login must create exactly one user")
	assert.Equal(t, env.userInfoSub, users[0].GoogleSub)

	var claims []model.ExternalIdentityClaim
	require.NoError(t, env.db.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, model.ExternalIdentityProviderGoogle, claims[0].Provider)
	assert.Equal(t, env.userInfoSub, claims[0].Subject)
	assert.Equal(t, users[0].Id, claims[0].UserId)
}

// TestGoogleSecondLoginReturnsSameUser protects the durable login path: the
// second callback of the same Google subject logs into the existing account
// and creates no additional user or claim.
func TestGoogleSecondLoginReturnsSameUser(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	common.RegisterEnabled = true

	first := serveOAuthCallback("google",
		"state="+url.QueryEscape(startGoogleLoginFlow(t))+"&code=mock-code", 0, "")
	firstUserID := decodeLoginUserId(t, first)

	second := serveOAuthCallback("google",
		"state="+url.QueryEscape(startGoogleLoginFlow(t))+"&code=mock-code", 0, "")
	secondUserID := decodeLoginUserId(t, second)
	assert.Equal(t, firstUserID, secondUserID)

	var userCount int64
	require.NoError(t, env.db.Model(&model.User{}).Count(&userCount).Error)
	assert.EqualValues(t, 1, userCount, "a repeat login must not create another account")

	var claims []model.ExternalIdentityClaim
	require.NoError(t, env.db.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, firstUserID, claims[0].UserId)
}

// TestGoogleLoginPrefersClaimOwnerOverForgedMirrorRow proves the claim table
// is the single ownership source: a forged or duplicate users.google_sub row
// never wins over the durable claim owner.
func TestGoogleLoginPrefersClaimOwnerOverForgedMirrorRow(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	claimOwner := createGoogleOAuthTestUser(t, env.db, "claim-owner")
	forgedRow := createGoogleOAuthTestUser(t, env.db, "forged-mirror")
	forgedRow.GoogleSub = env.userInfoSub
	require.NoError(t, env.db.Save(forgedRow).Error)
	require.NoError(t, env.db.Transaction(func(tx *gorm.DB) error {
		return model.ClaimExternalIdentityWithTx(tx, model.ExternalIdentityProviderGoogle, env.userInfoSub, claimOwner.Id)
	}))

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(startGoogleLoginFlow(t))+"&code=mock-code", 0, "")
	loggedInUserID := decodeLoginUserId(t, recorder)
	assert.Equal(t, claimOwner.Id, loggedInUserID, "login must resolve the durable claim owner, not the forged mirror row")

	// The forged row keeps its mirror value but never gains a claim.
	var claims []model.ExternalIdentityClaim
	require.NoError(t, env.db.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, claimOwner.Id, claims[0].UserId)
	assert.Empty(t, reloadGoogleOAuthUser(t, env, claimOwner.Id).GoogleSub, "the owner's mirror was never the login source")
}

// TestGoogleLoginRejectsSoftDeletedClaimOwner protects the deleted-owner
// rule: the occupied subject must not be usable to create a replacement
// account.
func TestGoogleLoginRejectsSoftDeletedClaimOwner(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	common.RegisterEnabled = true
	deleted := createGoogleOAuthTestUser(t, env.db, "deleted-owner")
	require.NoError(t, env.db.Transaction(func(tx *gorm.DB) error {
		return model.ClaimExternalIdentityWithTx(tx, model.ExternalIdentityProviderGoogle, env.userInfoSub, deleted.Id)
	}))
	require.NoError(t, env.db.Delete(&model.User{Id: deleted.Id}).Error)

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(startGoogleLoginFlow(t))+"&code=mock-code", 0, "")
	response := decodeOAuthResponse(t, recorder)
	assert.False(t, response.Success)
	assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgOAuthUserDeleted), response.Message)

	var users []model.User
	require.NoError(t, env.db.Unscoped().Find(&users).Error)
	require.Len(t, users, 1, "no replacement account may be created for an occupied subject")
	assert.True(t, users[0].DeletedAt.Valid)

	var claims []model.ExternalIdentityClaim
	require.NoError(t, env.db.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, deleted.Id, claims[0].UserId)
}

// TestGoogleLoginRejectsRegistrationDisabled protects the unclaimed-subject
// branch when registration is disabled: no account is created.
func TestGoogleLoginRejectsRegistrationDisabled(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	common.RegisterEnabled = false

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(startGoogleLoginFlow(t))+"&code=mock-code", 0, "")
	response := decodeOAuthResponse(t, recorder)
	assert.False(t, response.Success)
	assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserRegisterDisabled), response.Message)

	var userCount int64
	require.NoError(t, env.db.Model(&model.User{}).Count(&userCount).Error)
	assert.Zero(t, userCount)
	var claimCount int64
	require.NoError(t, env.db.Model(&model.ExternalIdentityClaim{}).Count(&claimCount).Error)
	assert.Zero(t, claimCount)
}

// TestGoogleBindWritesClaimAndMirror protects the durable bind path: a
// successful bind writes the claim and the google_sub mirror together.
func TestGoogleBindWritesClaimAndMirror(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	owner := createGoogleOAuthTestUser(t, env.db, "bind-durable-owner")

	state := startGoogleBindFlow(t, owner, "session-owner")
	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(state)+"&code=mock-code", owner.Id, "session-owner")
	response := decodeOAuthResponse(t, recorder)
	require.True(t, response.Success, recorder.Body.String())

	var claims []model.ExternalIdentityClaim
	require.NoError(t, env.db.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, model.ExternalIdentityProviderGoogle, claims[0].Provider)
	assert.Equal(t, env.userInfoSub, claims[0].Subject)
	assert.Equal(t, owner.Id, claims[0].UserId)
	assert.Equal(t, env.userInfoSub, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
}

// TestGoogleBindRejectsRebind protects the one-shot slot rule: once a user
// holds a Google claim, rebinding the same or a different subject is refused
// and the original binding stays intact.
func TestGoogleBindRejectsRebind(t *testing.T) {
	for _, rebindSubject := range []string{"google-sub-1", "google-sub-2"} {
		t.Run(rebindSubject, func(t *testing.T) {
			env := setupGoogleOAuthTest(t)
			owner := createGoogleOAuthTestUser(t, env.db, "bind-rebind-owner")

			first := serveOAuthCallback("google",
				"state="+url.QueryEscape(startGoogleBindFlow(t, owner, "session-owner"))+"&code=mock-code",
				owner.Id, "session-owner")
			require.True(t, decodeOAuthResponse(t, first).Success, first.Body.String())

			env.userInfoSub = rebindSubject
			rebind := serveOAuthCallback("google",
				"state="+url.QueryEscape(startGoogleBindFlow(t, owner, "session-owner"))+"&code=mock-code",
				owner.Id, "session-owner")
			response := decodeOAuthResponse(t, rebind)
			assert.False(t, response.Success, "rebind must be rejected for an already-bound user")
			assert.Equal(t,
				i18n.Translate(i18n.LangEn, i18n.MsgOAuthAlreadyBound, map[string]any{"Provider": "Google"}),
				response.Message)

			var claims []model.ExternalIdentityClaim
			require.NoError(t, env.db.Find(&claims).Error)
			require.Len(t, claims, 1, "a rejected rebind must not add a claim")
			assert.Equal(t, "google-sub-1", claims[0].Subject)
			assert.Equal(t, "google-sub-1", reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
		})
	}
}

// TestGoogleRegistrationFailureLeavesNoOrphans protects the atomicity
// contract at the API boundary: a failed registration must not leave a user,
// a claim, or a one-sided google_sub mirror behind.
func TestGoogleRegistrationFailureLeavesNoOrphans(t *testing.T) {
	env := setupGoogleOAuthTest(t)
	common.RegisterEnabled = true
	existing := createGoogleOAuthTestUser(t, env.db, "email-owner")
	existing.Email = "taken@example.com"
	require.NoError(t, env.db.Save(existing).Error)
	env.userInfoEmail = "taken@example.com"

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(startGoogleLoginFlow(t))+"&code=mock-code", 0, "")
	response := decodeOAuthResponse(t, recorder)
	assert.False(t, response.Success)
	assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgUserEmailAlreadyTaken), response.Message)

	var users []model.User
	require.NoError(t, env.db.Find(&users).Error)
	require.Len(t, users, 1, "no orphan user may survive a failed registration")
	assert.Equal(t, existing.Id, users[0].Id)
	var claimCount int64
	require.NoError(t, env.db.Model(&model.ExternalIdentityClaim{}).Count(&claimCount).Error)
	assert.Zero(t, claimCount)
}

// concurrentGoogleDSN opens a file-backed SQLite database shared by every
// pooled connection, with WAL and immediate write locks plus a generous busy
// timeout, so racing transactions serialize at the writer instead of failing
// with "database is locked".
func concurrentGoogleDSN(t *testing.T) string {
	t.Helper()
	dsn := "file:" + filepath.Join(t.TempDir(), "google-concurrent.sqlite") +
		"?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)&_txlock=immediate"
	return dsn
}

// runWithBarrier starts every worker, waits until every worker has reached the
// start line (ready acknowledgement), then releases them together and joins.
// Workers never call testing.T. No sleeps or timing assumptions.
func runWithBarrier(actions ...func()) {
	start := make(chan struct{})
	var ready sync.WaitGroup
	var done sync.WaitGroup
	ready.Add(len(actions))
	for _, action := range actions {
		done.Add(1)
		go func(run func()) {
			defer done.Done()
			ready.Done()
			<-start
			run()
		}(action)
	}
	ready.Wait()
	close(start)
	done.Wait()
}

// overlapGate holds N production-path callbacks at a critical boundary until
// all have arrived, then releases them together. Callbacks only signal and
// wait on channels — they never touch testing.T, require, or assert. Timeouts
// in wait helpers are pure deadlock guards, never behavioral assertions.
type overlapGate struct {
	need        int
	arrived     atomic.Int32
	allReady    chan struct{}
	release     chan struct{}
	abort       chan struct{}
	onceReady   sync.Once
	onceRelease sync.Once
	onceAbort   sync.Once
}

func newOverlapGate(n int) *overlapGate {
	return &overlapGate{
		need:     n,
		allReady: make(chan struct{}),
		release:  make(chan struct{}),
		abort:    make(chan struct{}),
	}
}

func (g *overlapGate) arriveAndWait() {
	if int(g.arrived.Add(1)) == g.need {
		g.onceReady.Do(func() { close(g.allReady) })
	}
	select {
	case <-g.release:
	case <-g.abort:
	}
}

func (g *overlapGate) releaseNow() {
	g.onceRelease.Do(func() { close(g.release) })
}

func (g *overlapGate) abortNow() {
	g.onceAbort.Do(func() { close(g.abort) })
	g.releaseNow()
}

// installClaimCreateOverlapBarrier pauses every ExternalIdentityClaim INSERT
// until `participants` claim creates have entered BeforeCreate, proving the
// competing claim-write paths overlap. Cleanup always aborts/releases the gate
// and removes the callback so a failed test cannot deadlock later work.
func installClaimCreateOverlapBarrier(t *testing.T, db *gorm.DB, participants int) *overlapGate {
	t.Helper()
	gate := newOverlapGate(participants)
	const callbackName = "test:p9b_claim_create_overlap"
	require.NoError(t, db.Callback().Create().Before("gorm:create").Register(callbackName, func(tx *gorm.DB) {
		if !statementTargetsExternalIdentityClaim(tx) {
			return
		}
		gate.arriveAndWait()
	}))
	t.Cleanup(func() {
		gate.abortNow()
		assert.NoError(t, db.Callback().Create().Remove(callbackName))
	})
	return gate
}

// installUserCreateOverlapBarrier pauses every users INSERT until
// `participants` creates have entered BeforeCreate. Concurrent first-login
// workers that already hold distinct emails both enter InsertWithTx and reach
// User CREATE inside open transactions; releasing only then proves the
// registration transactions overlapped.
func installUserCreateOverlapBarrier(t *testing.T, db *gorm.DB, participants int) *overlapGate {
	t.Helper()
	gate := newOverlapGate(participants)
	const callbackName = "test:p9b_user_create_overlap"
	require.NoError(t, db.Callback().Create().Before("gorm:create").Register(callbackName, func(tx *gorm.DB) {
		if !statementTargetsUser(tx) {
			return
		}
		gate.arriveAndWait()
	}))
	t.Cleanup(func() {
		gate.abortNow()
		assert.NoError(t, db.Callback().Create().Remove(callbackName))
	})
	return gate
}

// installUserLockOverlapBarrier pauses every SELECT ... FOR UPDATE against the
// users table until `participants` locked reads have entered BeforeQuery,
// proving competing user-row transactions overlap. Used for bind-vs-clear and
// unbind-vs-passkey races that serialize on lockForUpdate(user).
func installUserLockOverlapBarrier(t *testing.T, db *gorm.DB, participants int) *overlapGate {
	t.Helper()
	gate := newOverlapGate(participants)
	const callbackName = "test:p9b_user_lock_overlap"
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register(callbackName, func(tx *gorm.DB) {
		if !statementIsUserForUpdate(tx) {
			return
		}
		gate.arriveAndWait()
	}))
	t.Cleanup(func() {
		gate.abortNow()
		assert.NoError(t, db.Callback().Query().Remove(callbackName))
	})
	return gate
}

func statementTargetsExternalIdentityClaim(tx *gorm.DB) bool {
	if tx == nil || tx.Statement == nil {
		return false
	}
	switch tx.Statement.Dest.(type) {
	case *model.ExternalIdentityClaim, []*model.ExternalIdentityClaim, *[]model.ExternalIdentityClaim, []model.ExternalIdentityClaim:
		return true
	}
	switch tx.Statement.Model.(type) {
	case *model.ExternalIdentityClaim, model.ExternalIdentityClaim:
		return true
	}
	if tx.Statement.Schema != nil && tx.Statement.Schema.Table == "external_identity_claims" {
		return true
	}
	return tx.Statement.Table == "external_identity_claims"
}

func statementIsUserForUpdate(tx *gorm.DB) bool {
	if tx == nil || tx.Statement == nil {
		return false
	}
	if !statementTargetsUser(tx) {
		return false
	}
	cl, ok := tx.Statement.Clauses["FOR"]
	if !ok {
		return false
	}
	locking, ok := cl.Expression.(clause.Locking)
	return ok && strings.EqualFold(locking.Strength, "UPDATE")
}

func statementTargetsUser(tx *gorm.DB) bool {
	switch tx.Statement.Model.(type) {
	case *model.User, model.User:
		return true
	}
	switch tx.Statement.Dest.(type) {
	case *model.User, []*model.User, *[]model.User, []model.User:
		return true
	}
	if tx.Statement.Schema != nil && tx.Statement.Schema.Table == "users" {
		return true
	}
	return tx.Statement.Table == "users"
}

// assertGoogleClaimFinalState requires claim count ∈ {0,1}. Count > 1 fails
// immediately and never falls through to a "fully empty" branch. Count 0
// requires an empty mirror; count 1 requires exact provider/subject/user/mirror
// agreement. Returns whether the user is fully bound.
func assertGoogleClaimFinalState(t *testing.T, userID int, expectedSubject string, claims []model.ExternalIdentityClaim, mirror string) bool {
	t.Helper()
	require.LessOrEqual(t, len(claims), 1, "durable Google claims must be 0 or 1, got %d", len(claims))
	if len(claims) == 0 {
		assert.Empty(t, mirror, "zero claims requires an empty google_sub mirror")
		return false
	}
	assert.Equal(t, model.ExternalIdentityProviderGoogle, claims[0].Provider)
	assert.Equal(t, expectedSubject, claims[0].Subject)
	assert.Equal(t, userID, claims[0].UserId)
	assert.Equal(t, expectedSubject, mirror, "mirror must match the single claim subject")
	return true
}

// runOverlappingWorkers starts workers with ready-ack, waits until the production
// overlap gate has all participants, releases the gate, then joins.
//
// Lifecycle:
//  1. Every worker signals ready, then blocks on start.
//  2. start is closed so workers enter production code together.
//  3. On allReady: snapshot arrived, release the gate unconditionally, then
//     done.Wait(). Only after every worker has exited is arrived asserted.
//  4. On watchdog timeout: abort the gate, then done.Wait() unconditionally.
//     require.Fail runs only after every worker has exited. If a worker cannot
//     exit after abort, this call blocks and the outer `go test` timeout kills
//     the process — fixture cleanup must not run while workers still hold model.DB.
//
// No path may call a fatal require while workers are still blocked on the gate.
// Workers never call testing.T. Arrived count is asserted on the test goroutine
// only after join.
func runOverlappingWorkers(t *testing.T, gate *overlapGate, actions ...func()) {
	t.Helper()
	start := make(chan struct{})
	var ready sync.WaitGroup
	var done sync.WaitGroup
	ready.Add(len(actions))
	for _, action := range actions {
		done.Add(1)
		go func(run func()) {
			defer done.Done()
			ready.Done()
			<-start
			run()
		}(action)
	}
	ready.Wait()
	close(start)

	select {
	case <-gate.allReady:
		// Snapshot before release; do not FailNow before workers are unblocked.
		arrived := gate.arrived.Load()
		gate.releaseNow()
		done.Wait()
		require.EqualValues(t, gate.need, arrived,
			"all participants must reach the production overlap gate before release")
	case <-time.After(30 * time.Second):
		gate.abortNow()
		// Unconditional join before Fail: never return to fixture cleanup while workers live.
		done.Wait()
		require.Fail(t, "deadlock guard: workers did not all reach the overlap gate")
	}
}

// TestGoogleConcurrentFirstLoginSingleOwner protects the first-login race:
// two callbacks for the same unclaimed Google subject may never create two
// accounts. Both requests must end on the single durable owner with one user,
// one claim and one consistent mirror.
func TestGoogleConcurrentFirstLoginSingleOwner(t *testing.T) {
	env := setupGoogleOAuthTest(t, concurrentGoogleDSN(t))
	common.RegisterEnabled = true

	states := []string{startGoogleLoginFlow(t), startGoogleLoginFlow(t)}
	recorders := make([]*httptest.ResponseRecorder, 2)

	// Workers only drive the real callback and keep the raw recorder; every
	// decode and assertion runs on the test goroutine after the join, because
	// require/assert must never run inside a non-test goroutine.
	runWithBarrier(
		func() {
			recorders[0] = serveOAuthCallback("google",
				"state="+url.QueryEscape(states[0])+"&code=mock-code", 0, "")
		},
		func() {
			recorders[1] = serveOAuthCallback("google",
				"state="+url.QueryEscape(states[1])+"&code=mock-code", 0, "")
		},
	)

	// Post-join checks on the test goroutine only: the mock server recorded
	// no error from its own goroutines, both raw responses were captured,
	// and only then are the responses decoded and asserted.
	require.Empty(t, env.serverErrorSnapshot(), "the mock Google server must not fail during the race")
	require.NotNil(t, recorders[0])
	require.NotNil(t, recorders[1])

	loggedInUserIDs := make([]int, 2)
	for index, recorder := range recorders {
		response := decodeOAuthResponse(t, recorder)
		require.True(t, response.Success,
			"racing first login %d must land on the durable owner: %s", index, recorder.Body.String())
		loggedInUserIDs[index] = decodeLoginUserId(t, recorder)
	}
	assert.Equal(t, loggedInUserIDs[0], loggedInUserIDs[1],
		"both callbacks must log into the same single owner")

	var users []model.User
	require.NoError(t, env.db.Unscoped().Find(&users).Error)
	require.Len(t, users, 1, "the race must produce exactly one user")
	assert.Equal(t, env.userInfoSub, users[0].GoogleSub)

	var claims []model.ExternalIdentityClaim
	require.NoError(t, env.db.Find(&claims).Error)
	require.Len(t, claims, 1, "the race must produce exactly one claim")
	assert.Equal(t, env.userInfoSub, claims[0].Subject)
	assert.Equal(t, users[0].Id, claims[0].UserId)
}

// TestGoogleConcurrentBindSameSubjectSingleOwner protects the bind race for a
// contested subject: exactly one of two users wins the claim, the loser is
// rejected with the user-visible bound error, and claim/mirror stay
// consistent.
func TestGoogleConcurrentBindSameSubjectSingleOwner(t *testing.T) {
	env := setupGoogleOAuthTest(t, concurrentGoogleDSN(t))
	first := createGoogleOAuthTestUser(t, env.db, "race-binder-one")
	second := createGoogleOAuthTestUser(t, env.db, "race-binder-two")

	states := []string{
		startGoogleBindFlow(t, first, "session-one"),
		startGoogleBindFlow(t, second, "session-two"),
	}
	users := []*model.User{first, second}
	recorders := make([]*httptest.ResponseRecorder, 2)

	// Workers only capture the raw response; decoding and assertions stay on
	// the test goroutine after the join.
	runWithBarrier(
		func() {
			recorders[0] = serveOAuthCallback("google",
				"state="+url.QueryEscape(states[0])+"&code=mock-code", first.Id, "session-one")
		},
		func() {
			recorders[1] = serveOAuthCallback("google",
				"state="+url.QueryEscape(states[1])+"&code=mock-code", second.Id, "session-two")
		},
	)

	// Post-join checks on the test goroutine only: no mock-server error, both
	// raw responses captured, then decode and assert.
	require.Empty(t, env.serverErrorSnapshot(), "the mock Google server must not fail during the race")
	require.NotNil(t, recorders[0])
	require.NotNil(t, recorders[1])

	responses := make([]struct {
		Success bool
		Message string
	}, 2)
	for index, recorder := range recorders {
		decoded := decodeOAuthResponse(t, recorder)
		responses[index].Success = decoded.Success
		responses[index].Message = decoded.Message
	}

	winnerIndex := -1
	for index, response := range responses {
		if response.Success {
			require.Equal(t, -1, winnerIndex, "at most one racer may bind the subject")
			winnerIndex = index
		}
	}
	require.NotEqual(t, -1, winnerIndex, "at least one racer must succeed: %v", responses)
	loserIndex := 1 - winnerIndex
	assert.Equal(t,
		i18n.Translate(i18n.LangEn, i18n.MsgOAuthAlreadyBound, map[string]any{"Provider": "Google"}),
		responses[loserIndex].Message)

	var claims []model.ExternalIdentityClaim
	require.NoError(t, env.db.Find(&claims).Error)
	require.Len(t, claims, 1)
	assert.Equal(t, env.userInfoSub, claims[0].Subject)
	assert.Equal(t, users[winnerIndex].Id, claims[0].UserId)
	assert.Equal(t, env.userInfoSub, reloadGoogleOAuthUser(t, env, users[winnerIndex].Id).GoogleSub)
	assert.Empty(t, reloadGoogleOAuthUser(t, env, users[loserIndex].Id).GoogleSub)
}

// TestGoogleConcurrentBindDifferentSubjectsSingleClaim protects the user slot
// race: one user racing two different subjects keeps at most one Google
// claim, and the mirror never drifts from it.
func TestGoogleConcurrentBindDifferentSubjectsSingleClaim(t *testing.T) {
	env := setupGoogleOAuthTest(t, concurrentGoogleDSN(t))
	env.subjectByToken = map[string]string{
		"mock-access-code-a": "subject-a",
		"mock-access-code-b": "subject-b",
	}
	owner := createGoogleOAuthTestUser(t, env.db, "slot-race-owner")

	states := []string{
		startGoogleBindFlow(t, owner, "session-owner"),
		startGoogleBindFlow(t, owner, "session-owner"),
	}
	codes := []string{"code-a", "code-b"}
	recorders := make([]*httptest.ResponseRecorder, 2)

	// Workers only capture the raw response; decoding and assertions stay on
	// the test goroutine after the join.
	runWithBarrier(
		func() {
			recorders[0] = serveOAuthCallback("google",
				"state="+url.QueryEscape(states[0])+"&code="+codes[0], owner.Id, "session-owner")
		},
		func() {
			recorders[1] = serveOAuthCallback("google",
				"state="+url.QueryEscape(states[1])+"&code="+codes[1], owner.Id, "session-owner")
		},
	)

	// Post-join checks on the test goroutine only: no mock-server error, both
	// raw responses captured, then decode and assert.
	require.Empty(t, env.serverErrorSnapshot(), "the mock Google server must not fail during the race")
	require.NotNil(t, recorders[0])
	require.NotNil(t, recorders[1])

	successes := make([]bool, 2)
	for index, recorder := range recorders {
		successes[index] = decodeOAuthResponse(t, recorder).Success
	}

	assert.Equal(t, 1, func() int {
		count := 0
		for _, success := range successes {
			if success {
				count++
			}
		}
		return count
	}(), "exactly one of the racing subjects must win the user slot: %v", successes)

	var claims []model.ExternalIdentityClaim
	require.NoError(t, env.db.Find(&claims).Error)
	require.Len(t, claims, 1, "the user slot must hold exactly one claim")
	assert.Equal(t, owner.Id, claims[0].UserId)
	assert.Contains(t, []string{"subject-a", "subject-b"}, claims[0].Subject)
	assert.Equal(t, claims[0].Subject, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub,
		"the google_sub mirror must match the surviving claim")
}

// TestGoogleRegistrationClaimFailureRollsBackEverything drives the real
// registration callback and forces a deterministic database failure at the
// claim-write stage (after the user row was already inserted in the same
// transaction). A SQLite trigger raises on every claim INSERT for the
// duration of the test and is dropped on cleanup; no production test hook is
// involved. The failure must roll back user, claim and mirror together.
func TestGoogleRegistrationClaimFailureRollsBackEverything(t *testing.T) {
	env := setupGoogleOAuthTest(t, concurrentGoogleDSN(t))
	common.RegisterEnabled = true

	const triggerName = "fail_google_claim_insert"
	require.NoError(t, env.db.Exec("CREATE TRIGGER "+triggerName+
		" BEFORE INSERT ON external_identity_claims"+
		" BEGIN SELECT RAISE(ABORT, 'forced claim failure'); END;").Error)
	t.Cleanup(func() {
		require.NoError(t, env.db.Exec("DROP TRIGGER "+triggerName).Error)
	})

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(startGoogleLoginFlow(t))+"&code=mock-code", 0, "")
	response := decodeOAuthResponse(t, recorder)
	assert.False(t, response.Success, "the forced claim failure must surface as a failed callback")

	var users []model.User
	require.NoError(t, env.db.Unscoped().Find(&users).Error)
	assert.Empty(t, users, "the inserted user must roll back with the failed claim")
	var claims []model.ExternalIdentityClaim
	require.NoError(t, env.db.Find(&claims).Error)
	assert.Empty(t, claims)
}

// TestGoogleBindMirrorFailureRollsBackClaim drives the real bind callback and
// forces a deterministic database failure at the google_sub UPDATE stage,
// after the claim INSERT already succeeded inside the same transaction. The
// trigger is dropped on cleanup. The failed mirror write must roll back the
// claim and leave the original mirror untouched.
func TestGoogleBindMirrorFailureRollsBackClaim(t *testing.T) {
	env := setupGoogleOAuthTest(t, concurrentGoogleDSN(t))
	owner := createGoogleOAuthTestUser(t, env.db, "bind-trigger-owner")

	const triggerName = "fail_google_sub_update"
	require.NoError(t, env.db.Exec("CREATE TRIGGER "+triggerName+
		" BEFORE UPDATE OF google_sub ON users"+
		" BEGIN SELECT RAISE(ABORT, 'forced mirror failure'); END;").Error)
	t.Cleanup(func() {
		require.NoError(t, env.db.Exec("DROP TRIGGER "+triggerName).Error)
	})

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(startGoogleBindFlow(t, owner, "session-owner"))+"&code=mock-code",
		owner.Id, "session-owner")
	response := decodeOAuthResponse(t, recorder)
	assert.False(t, response.Success, "the forced mirror failure must surface as a failed bind")

	var claims []model.ExternalIdentityClaim
	require.NoError(t, env.db.Find(&claims).Error)
	assert.Empty(t, claims, "the claim must roll back with the failed mirror write")
	assert.Empty(t, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub,
		"the original mirror must stay untouched")
}

// TestGoogleBindMirrorZeroHitRollsBackClaim drives the real bind callback and
// makes the google_sub UPDATE silently skip the row: a RAISE(IGNORE) trigger
// produces zero affected rows with no statement error, a different failure
// semantics than the RAISE(ABORT) sibling test. The bind must fail, no claim
// may be committed, the original mirror must stay untouched, and the mock
// server must have recorded no error. The trigger is dropped on cleanup with
// an explicit success assertion.
func TestGoogleBindMirrorZeroHitRollsBackClaim(t *testing.T) {
	env := setupGoogleOAuthTest(t, concurrentGoogleDSN(t))
	owner := createGoogleOAuthTestUser(t, env.db, "bind-zerohit-owner")

	const triggerName = "skip_google_sub_bind_mirror"
	require.NoError(t, env.db.Exec("CREATE TRIGGER "+triggerName+
		" BEFORE UPDATE OF google_sub ON users"+
		" BEGIN SELECT RAISE(IGNORE); END;").Error)
	t.Cleanup(func() {
		require.NoError(t, env.db.Exec("DROP TRIGGER "+triggerName).Error)
	})

	recorder := serveOAuthCallback("google",
		"state="+url.QueryEscape(startGoogleBindFlow(t, owner, "session-owner"))+"&code=mock-code",
		owner.Id, "session-owner")
	response := decodeOAuthResponse(t, recorder)
	assert.False(t, response.Success, "a silent zero-hit mirror write must fail the bind callback")

	var claims []model.ExternalIdentityClaim
	require.NoError(t, env.db.Find(&claims).Error)
	assert.Empty(t, claims, "no claim may be committed when the mirror write silently missed")
	assert.Empty(t, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub,
		"the original mirror must stay untouched")
	assert.Empty(t, env.serverErrorSnapshot(), "the mock Google server must not fail")
}

// TestGoogleOAuthLaunchProfileConfiguredDatabases is the thin PostgreSQL/MySQL
// entry point for Google durable-claim launch-profile scenarios (first login,
// bind, rebind refusal, soft-deleted owner occupation, concurrent first login
// / bind, claim/mirror final-state consistency). When TEST_*_DSN is unset the
// corresponding dialect is skipped so ordinary `go test ./...` stays offline.
// SQLite-only trigger failure seams are intentionally not re-hosted here.
func TestGoogleOAuthLaunchProfileConfiguredDatabases(t *testing.T) {
	for _, database := range configuredDatabaseTargets() {
		t.Run(database.name, func(t *testing.T) {
			dsn := strings.TrimSpace(os.Getenv(database.env))
			if dsn == "" {
				t.Skip(database.env + " is not configured; skipping integration run")
			}
			dbType := database.dbType

			t.Run("firstLoginCreatesUserClaimAndMirror", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				common.RegisterEnabled = true
				state := startGoogleLoginFlow(t)
				recorder := serveOAuthCallback("google",
					"state="+url.QueryEscape(state)+"&code=mock-code", 0, "")
				require.Equal(t, http.StatusOK, recorder.Code)
				require.True(t, decodeOAuthResponse(t, recorder).Success, recorder.Body.String())

				var users []model.User
				require.NoError(t, env.db.Find(&users).Error)
				require.Len(t, users, 1)
				assert.Equal(t, env.userInfoSub, users[0].GoogleSub)
				var claims []model.ExternalIdentityClaim
				require.NoError(t, env.db.Find(&claims).Error)
				require.Len(t, claims, 1)
				assert.Equal(t, model.ExternalIdentityProviderGoogle, claims[0].Provider)
				assert.Equal(t, env.userInfoSub, claims[0].Subject)
				assert.Equal(t, users[0].Id, claims[0].UserId)
			})

			t.Run("secondLoginReturnsSameUser", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				common.RegisterEnabled = true
				first := serveOAuthCallback("google",
					"state="+url.QueryEscape(startGoogleLoginFlow(t))+"&code=mock-code", 0, "")
				firstUserID := decodeLoginUserId(t, first)
				second := serveOAuthCallback("google",
					"state="+url.QueryEscape(startGoogleLoginFlow(t))+"&code=mock-code", 0, "")
				secondUserID := decodeLoginUserId(t, second)
				assert.Equal(t, firstUserID, secondUserID)
				var userCount int64
				require.NoError(t, env.db.Model(&model.User{}).Count(&userCount).Error)
				assert.EqualValues(t, 1, userCount)
				var claims []model.ExternalIdentityClaim
				require.NoError(t, env.db.Find(&claims).Error)
				require.Len(t, claims, 1)
				assert.Equal(t, firstUserID, claims[0].UserId)
			})

			t.Run("bindWritesClaimAndMirror", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				owner := createGoogleOAuthTestUser(t, env.db, "bind-durable-owner")
				state := startGoogleBindFlow(t, owner, "session-owner")
				recorder := serveOAuthCallback("google",
					"state="+url.QueryEscape(state)+"&code=mock-code", owner.Id, "session-owner")
				require.True(t, decodeOAuthResponse(t, recorder).Success, recorder.Body.String())
				var claims []model.ExternalIdentityClaim
				require.NoError(t, env.db.Find(&claims).Error)
				require.Len(t, claims, 1)
				assert.Equal(t, env.userInfoSub, claims[0].Subject)
				assert.Equal(t, owner.Id, claims[0].UserId)
				assert.Equal(t, env.userInfoSub, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
			})

			t.Run("bindRejectsRebind", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				owner := createGoogleOAuthTestUser(t, env.db, "bind-rebind-owner")
				first := serveOAuthCallback("google",
					"state="+url.QueryEscape(startGoogleBindFlow(t, owner, "session-owner"))+"&code=mock-code",
					owner.Id, "session-owner")
				require.True(t, decodeOAuthResponse(t, first).Success, first.Body.String())
				env.userInfoSub = "google-sub-2"
				rebind := serveOAuthCallback("google",
					"state="+url.QueryEscape(startGoogleBindFlow(t, owner, "session-owner"))+"&code=mock-code",
					owner.Id, "session-owner")
				response := decodeOAuthResponse(t, rebind)
				assert.False(t, response.Success)
				assert.Equal(t,
					i18n.Translate(i18n.LangEn, i18n.MsgOAuthAlreadyBound, map[string]any{"Provider": "Google"}),
					response.Message)
				var claims []model.ExternalIdentityClaim
				require.NoError(t, env.db.Find(&claims).Error)
				require.Len(t, claims, 1)
				assert.Equal(t, "google-sub-1", claims[0].Subject)
				assert.Equal(t, "google-sub-1", reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
			})

			t.Run("loginRejectsSoftDeletedClaimOwner", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				common.RegisterEnabled = true
				deleted := createGoogleOAuthTestUser(t, env.db, "deleted-owner")
				require.NoError(t, env.db.Transaction(func(tx *gorm.DB) error {
					return model.ClaimExternalIdentityWithTx(tx, model.ExternalIdentityProviderGoogle, env.userInfoSub, deleted.Id)
				}))
				require.NoError(t, env.db.Delete(&model.User{Id: deleted.Id}).Error)
				recorder := serveOAuthCallback("google",
					"state="+url.QueryEscape(startGoogleLoginFlow(t))+"&code=mock-code", 0, "")
				response := decodeOAuthResponse(t, recorder)
				assert.False(t, response.Success)
				assert.Equal(t, i18n.Translate(i18n.LangEn, i18n.MsgOAuthUserDeleted), response.Message)
				var users []model.User
				require.NoError(t, env.db.Unscoped().Find(&users).Error)
				require.Len(t, users, 1)
				assert.True(t, users[0].DeletedAt.Valid)
				var claims []model.ExternalIdentityClaim
				require.NoError(t, env.db.Find(&claims).Error)
				require.Len(t, claims, 1)
				assert.Equal(t, deleted.Id, claims[0].UserId)
			})

			t.Run("loginPrefersClaimOwnerOverForgedMirror", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				claimOwner := createGoogleOAuthTestUser(t, env.db, "claim-owner")
				forgedRow := createGoogleOAuthTestUser(t, env.db, "forged-mirror")
				forgedRow.GoogleSub = env.userInfoSub
				require.NoError(t, env.db.Save(forgedRow).Error)
				require.NoError(t, env.db.Transaction(func(tx *gorm.DB) error {
					return model.ClaimExternalIdentityWithTx(tx, model.ExternalIdentityProviderGoogle, env.userInfoSub, claimOwner.Id)
				}))
				recorder := serveOAuthCallback("google",
					"state="+url.QueryEscape(startGoogleLoginFlow(t))+"&code=mock-code", 0, "")
				loggedInUserID := decodeLoginUserId(t, recorder)
				assert.Equal(t, claimOwner.Id, loggedInUserID)
				var claims []model.ExternalIdentityClaim
				require.NoError(t, env.db.Find(&claims).Error)
				require.Len(t, claims, 1)
				assert.Equal(t, claimOwner.Id, claims[0].UserId)
			})

			t.Run("concurrentFirstLoginSingleOwner", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				common.RegisterEnabled = true
				// Same Google subject for both callbacks; distinct emails so the
				// PostgreSQL email advisory lock does not serialize the two
				// registration transactions before User CREATE. Overlap is proven
				// inside InsertWithTx at the users INSERT boundary.
				env.emailByToken = map[string]string{
					"mock-access-code-a": "race-login-a@example.com",
					"mock-access-code-b": "race-login-b@example.com",
				}
				gate := installUserCreateOverlapBarrier(t, env.db, 2)
				states := []string{startGoogleLoginFlow(t), startGoogleLoginFlow(t)}
				codes := []string{"code-a", "code-b"}
				recorders := make([]*httptest.ResponseRecorder, 2)
				runOverlappingWorkers(t, gate,
					func() {
						recorders[0] = serveOAuthCallback("google",
							"state="+url.QueryEscape(states[0])+"&code="+codes[0], 0, "")
					},
					func() {
						recorders[1] = serveOAuthCallback("google",
							"state="+url.QueryEscape(states[1])+"&code="+codes[1], 0, "")
					},
				)
				require.Empty(t, env.serverErrorSnapshot())
				require.NotNil(t, recorders[0])
				require.NotNil(t, recorders[1])
				loggedInUserIDs := make([]int, 2)
				for index, recorder := range recorders {
					response := decodeOAuthResponse(t, recorder)
					require.True(t, response.Success,
						"racing first login %d must land on the durable owner: %s", index, recorder.Body.String())
					loggedInUserIDs[index] = decodeLoginUserId(t, recorder)
				}
				assert.Equal(t, loggedInUserIDs[0], loggedInUserIDs[1],
					"both callbacks must log into the same durable owner")
				var users []model.User
				require.NoError(t, env.db.Unscoped().Find(&users).Error)
				require.Len(t, users, 1, "exactly one user; no orphan registration residue")
				var claims []model.ExternalIdentityClaim
				require.NoError(t, env.db.Find(&claims).Error)
				bound := assertGoogleClaimFinalState(t, users[0].Id, env.userInfoSub, claims, users[0].GoogleSub)
				require.True(t, bound, "single claim and mirror must agree on the owner")
			})

			t.Run("concurrentBindSameSubjectSingleOwner", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				// Competing binders race the same subject at claim CREATE.
				gate := installClaimCreateOverlapBarrier(t, env.db, 2)
				first := createGoogleOAuthTestUser(t, env.db, "race-binder-one")
				second := createGoogleOAuthTestUser(t, env.db, "race-binder-two")
				states := []string{
					startGoogleBindFlow(t, first, "session-one"),
					startGoogleBindFlow(t, second, "session-two"),
				}
				users := []*model.User{first, second}
				recorders := make([]*httptest.ResponseRecorder, 2)
				runOverlappingWorkers(t, gate,
					func() {
						recorders[0] = serveOAuthCallback("google",
							"state="+url.QueryEscape(states[0])+"&code=mock-code", first.Id, "session-one")
					},
					func() {
						recorders[1] = serveOAuthCallback("google",
							"state="+url.QueryEscape(states[1])+"&code=mock-code", second.Id, "session-two")
					},
				)
				require.Empty(t, env.serverErrorSnapshot())
				require.NotNil(t, recorders[0])
				require.NotNil(t, recorders[1])
				responses := make([]struct {
					Success bool
					Message string
				}, 2)
				for index, recorder := range recorders {
					decoded := decodeOAuthResponse(t, recorder)
					responses[index].Success = decoded.Success
					responses[index].Message = decoded.Message
				}
				winnerIndex := -1
				for index, response := range responses {
					if response.Success {
						require.Equal(t, -1, winnerIndex, "at most one racer may bind the subject")
						winnerIndex = index
					}
				}
				require.NotEqual(t, -1, winnerIndex, "at least one racer must succeed: %v", responses)
				loserIndex := 1 - winnerIndex
				assert.Equal(t,
					i18n.Translate(i18n.LangEn, i18n.MsgOAuthAlreadyBound, map[string]any{"Provider": "Google"}),
					responses[loserIndex].Message)
				var claims []model.ExternalIdentityClaim
				require.NoError(t, env.db.Find(&claims).Error)
				bound := assertGoogleClaimFinalState(t, users[winnerIndex].Id, env.userInfoSub, claims,
					reloadGoogleOAuthUser(t, env, users[winnerIndex].Id).GoogleSub)
				require.True(t, bound)
				assert.Empty(t, reloadGoogleOAuthUser(t, env, users[loserIndex].Id).GoogleSub)
			})

			t.Run("concurrentBindDifferentSubjectsSingleClaim", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				// Same user slot: both binders lock the user row before claim CREATE.
				gate := installUserLockOverlapBarrier(t, env.db, 2)
				env.subjectByToken = map[string]string{
					"mock-access-code-a": "subject-a",
					"mock-access-code-b": "subject-b",
				}
				owner := createGoogleOAuthTestUser(t, env.db, "slot-race-owner")
				states := []string{
					startGoogleBindFlow(t, owner, "session-owner"),
					startGoogleBindFlow(t, owner, "session-owner"),
				}
				codes := []string{"code-a", "code-b"}
				recorders := make([]*httptest.ResponseRecorder, 2)
				runOverlappingWorkers(t, gate,
					func() {
						recorders[0] = serveOAuthCallback("google",
							"state="+url.QueryEscape(states[0])+"&code="+codes[0], owner.Id, "session-owner")
					},
					func() {
						recorders[1] = serveOAuthCallback("google",
							"state="+url.QueryEscape(states[1])+"&code="+codes[1], owner.Id, "session-owner")
					},
				)
				require.Empty(t, env.serverErrorSnapshot())
				require.NotNil(t, recorders[0])
				require.NotNil(t, recorders[1])
				successes := make([]bool, 2)
				for index, recorder := range recorders {
					successes[index] = decodeOAuthResponse(t, recorder).Success
				}
				assert.Equal(t, 1, func() int {
					count := 0
					for _, success := range successes {
						if success {
							count++
						}
					}
					return count
				}(), "exactly one of the racing subjects must win the user slot: %v", successes)
				var claims []model.ExternalIdentityClaim
				require.NoError(t, env.db.Find(&claims).Error)
				require.LessOrEqual(t, len(claims), 1)
				require.Len(t, claims, 1)
				assert.Equal(t, owner.Id, claims[0].UserId)
				assert.Contains(t, []string{"subject-a", "subject-b"}, claims[0].Subject)
				assert.Equal(t, claims[0].Subject, reloadGoogleOAuthUser(t, env, owner.Id).GoogleSub)
			})

			t.Run("rebindAfterSelfUnbind", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				passwordHash, err := common.Password2Hash("rebind-strong-password")
				require.NoError(t, err)
				user := createGoogleOAuthTestUser(t, db, "rebind-user")
				require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("password", passwordHash).Error)
				accessToken := common.GetRandomString(32)
				require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("access_token", accessToken).Error)
				require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
					return model.BindGoogleIdentityWithTx(tx, env.userInfoSub, user.Id)
				}))
				unbindRecorder := doGoogleSelfUnbind(googleSelfUnbindRouter(), accessToken)
				require.Equal(t, true, decodeEnvelope(t, unbindRecorder)["success"], unbindRecorder.Body.String())
				var claimCount int64
				require.NoError(t, db.Model(&model.ExternalIdentityClaim{}).Count(&claimCount).Error)
				assert.Zero(t, claimCount)
				assert.Empty(t, reloadGoogleOAuthUser(t, env, user.Id).GoogleSub)
				state := startGoogleBindFlow(t, user, "session-rebind")
				rebindRecorder := serveOAuthCallback("google",
					"state="+url.QueryEscape(state)+"&code=mock-code", user.Id, "session-rebind")
				require.True(t, decodeOAuthResponse(t, rebindRecorder).Success, rebindRecorder.Body.String())
				var claims []model.ExternalIdentityClaim
				require.NoError(t, db.Find(&claims).Error)
				require.Len(t, claims, 1)
				assert.Equal(t, env.userInfoSub, claims[0].Subject)
				assert.Equal(t, user.Id, claims[0].UserId)
				assert.Equal(t, env.userInfoSub, reloadGoogleOAuthUser(t, env, user.Id).GoogleSub)
			})

			t.Run("bindVsAdminClearConcurrentFinalState", func(t *testing.T) {
				env := setupGoogleOAuthTestOn(t, dsn, dbType)
				db := env.db
				// Bind and admin-clear both lock the user row first; overlap there.
				gate := installUserLockOverlapBarrier(t, db, 2)
				user := createGoogleOAuthTestUser(t, db, "race-bind-clear-user")
				adminToken := common.GetRandomString(32)
				admin := &model.User{
					Username:    "race-bind-clear-admin",
					Password:    "not-a-password-hash",
					Role:        common.RoleAdminUser,
					Status:      common.UserStatusEnabled,
					Group:       "default",
					AffCode:     "race-bind-clear-admin",
					AuthVersion: 1,
					AccessToken: &adminToken,
				}
				require.NoError(t, db.Create(admin).Error)
				env.userInfoSub = "race-bind-clear-sub"
				bindState := startGoogleBindFlow(t, user, "session-race")
				bindRecorders := make([]*httptest.ResponseRecorder, 1)
				clearRecorders := make([]*httptest.ResponseRecorder, 1)
				runOverlappingWorkers(t, gate,
					func() {
						bindRecorders[0] = serveOAuthCallback("google",
							"state="+url.QueryEscape(bindState)+"&code=mock-code", user.Id, "session-race")
					},
					func() {
						clearRecorders[0] = doAdminClearBinding(adminBindingRouter(), user.Id, "google", adminToken)
					},
				)
				require.NotNil(t, bindRecorders[0])
				require.NotNil(t, clearRecorders[0])
				assert.True(t, decodeOAuthResponse(t, bindRecorders[0]).Success, bindRecorders[0].Body.String())
				assert.Equal(t, true, decodeEnvelope(t, clearRecorders[0])["success"], clearRecorders[0].Body.String())
				var claims []model.ExternalIdentityClaim
				require.NoError(t, db.Where("provider = ?", model.ExternalIdentityProviderGoogle).Find(&claims).Error)
				mirror := reloadGoogleOAuthUser(t, env, user.Id).GoogleSub
				// claim count must be 0 or 1; >1 fails inside assertGoogleClaimFinalState.
				_ = assertGoogleClaimFinalState(t, user.Id, "race-bind-clear-sub", claims, mirror)
			})
		})
	}
}

// TestReplacePostgresDSNDBName covers keyword and URI DSN rewriting used by the
// isolated-database helper. Credentials must stay intact and only the database
// name may change. This is test-infrastructure coverage, not a production defect.
func TestReplacePostgresDSNDBName(t *testing.T) {
	cases := []struct {
		name string
		in   string
		db   string
		want string
	}{
		{
			name: "keyword value",
			in:   "host=127.0.0.1 port=5432 user=u password=p dbname=p9b_launch sslmode=disable",
			db:   "p9b_isolated",
			want: "host=127.0.0.1 port=5432 user=u password=p dbname=p9b_isolated sslmode=disable",
		},
		{
			name: "postgres uri",
			in:   "postgres://u:p@127.0.0.1:5432/p9b_launch?sslmode=disable",
			db:   "p9b_isolated",
			want: "postgres://u:p@127.0.0.1:5432/p9b_isolated?sslmode=disable",
		},
		{
			name: "postgresql uri",
			in:   "postgresql://u:p@127.0.0.1:5432/p9b_launch?sslmode=disable",
			db:   "p9b_isolated",
			want: "postgresql://u:p@127.0.0.1:5432/p9b_isolated?sslmode=disable",
		},
		{
			name: "uri query and percent-encoded credential preserved",
			in:   "postgresql://u:p%40ss%2Fword@127.0.0.1:5432/p9b_launch?sslmode=disable&application_name=vancine",
			db:   "p9b_isolated",
			want: "postgresql://u:p%40ss%2Fword@127.0.0.1:5432/p9b_isolated?sslmode=disable&application_name=vancine",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := replacePostgresDSNDBName(tc.in, tc.db)
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
			assert.NotContains(t, got, "p9b_launch")
			// Credential material from the input must still be present (no redaction/leak swap).
			if strings.Contains(tc.in, "password=p") {
				assert.Contains(t, got, "password=p")
			}
			if strings.Contains(tc.in, "p%40ss%2Fword") {
				assert.Contains(t, got, "p%40ss%2Fword")
			}
		})
	}
}

// TestOpenIsolatedPostgresDBCleansUpAfterPostCreateFatal proves that a real
// require.FailNow after CREATE DATABASE still runs t.Cleanup DROP/close. The
// child process exits non-zero; the parent only checks the named database is
// gone. Credentials and full DSNs must not appear in child output.
// Test-infrastructure contract, not a production defect.
func TestOpenIsolatedPostgresDBCleansUpAfterPostCreateFatal(t *testing.T) {
	if os.Getenv("P9B_ISOLATED_PG_FATAL_CHILD") == "1" {
		runIsolatedPostgresPostCreateFatalChild(t)
		return
	}
	baseDSN := strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN"))
	if baseDSN == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured; skipping integration run")
	}

	nameFile := filepath.Join(t.TempDir(), "created-db-name.txt")
	cmd := exec.Command(os.Args[0], "-test.run=^TestOpenIsolatedPostgresDBCleansUpAfterPostCreateFatal$", "-test.count=1", "-test.v=false")
	cmd.Env = append(os.Environ(),
		"P9B_ISOLATED_PG_FATAL_CHILD=1",
		"P9B_ISOLATED_PG_NAME_FILE="+nameFile,
	)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	require.Error(t, err, "child must exit non-zero after require fatal")

	combined := stdout.String() + stderr.String()
	// Evaluate Contains in plain booleans so a failed assertion never prints
	// combined output, baseDSN, or other secret material in the failure message.
	hasPasswordEq := strings.Contains(combined, "password=")
	hasPasswordWord := strings.Contains(combined, "PASSWORD")
	hasFullDSN := baseDSN != "" && strings.Contains(combined, baseDSN)
	assert.False(t, hasPasswordEq, "child output must not contain password= secret material")
	assert.False(t, hasPasswordWord, "child output must not contain PASSWORD secret material")
	assert.False(t, hasFullDSN, "child output must not contain the full database DSN")

	nameBytes, readErr := os.ReadFile(nameFile)
	require.NoError(t, readErr, "child must record the created database name before fatal")
	createdName := strings.TrimSpace(string(nameBytes))
	require.NotEmpty(t, createdName)
	require.True(t, strings.HasPrefix(createdName, "p9b_"), "unexpected database name prefix")

	admin, err := gorm.Open(postgres.New(postgres.Config{DSN: baseDSN}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := admin.DB()
	require.NoError(t, err)
	t.Cleanup(func() { assert.NoError(t, sqlDB.Close()) })
	var exists bool
	require.NoError(t, admin.Raw(
		"SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ?)", createdName,
	).Scan(&exists).Error)
	assert.False(t, exists, "throwaway database must be dropped after require fatal cleanup")
}

// runIsolatedPostgresPostCreateFatalChild is the subprocess body: CREATE
// succeeds, the name is written to a private file, then require.NoError on the
// hook error FailNows. Registered cleanups must still DROP the database.
func runIsolatedPostgresPostCreateFatalChild(t *testing.T) {
	baseDSN := strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN"))
	if baseDSN == "" {
		os.Exit(2)
	}
	nameFile := strings.TrimSpace(os.Getenv("P9B_ISOLATED_PG_NAME_FILE"))
	if nameFile == "" {
		os.Exit(2)
	}
	isolatedPostgresAfterCreateHook = func(dbName string) error {
		if err := os.WriteFile(nameFile, []byte(dbName), 0o600); err != nil {
			return err
		}
		return errors.New("forced post-create fatal")
	}
	t.Cleanup(func() { isolatedPostgresAfterCreateHook = nil })
	_ = openIsolatedPostgresDB(t, baseDSN)
}
