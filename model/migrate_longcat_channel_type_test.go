package model

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

// The marker key/value are asserted as literals so the tests document the
// persisted contract independently of the implementation constants.
const (
	longcatMigrationMarkerKey   = "migration.longcat_channel_type_58_to_100.v1"
	longcatMigrationMarkerValue = "completed"
)

// legacyLongcatChannelTypeValue mirrors the production main semantics where
// channel type 58 meant LongCat; upstream rc23 reuses 58 for Advanced Custom.
const legacyLongcatChannelTypeValue = 58

// longcatConcurrencyDeadlockGuard bounds coordination waits in the
// concurrency scenario. It is a pure deadlock guard: it only turns a hang
// into an explicit test failure and is never used as a behavioral assertion.
const longcatConcurrencyDeadlockGuard = 30 * time.Second

// longcatConcurrencyRole tags a migration invocation inside the deterministic
// concurrency scenario so callbacks can gate the owner and the competitor.
type longcatConcurrencyRole string

const (
	longcatConcurrencyRoleOwner      longcatConcurrencyRole = "owner"
	longcatConcurrencyRoleCompetitor longcatConcurrencyRole = "competitor"
)

type longcatConcurrencyRoleKey struct{}

// newLongcatTestChannel normalizes a Channel fixture so it persists on
// SQLite, MySQL and PostgreSQL alike: JSON-backed columns must never receive
// an empty string, which PostgreSQL json columns reject with SQLSTATE 22P02.
// The production Channel model is intentionally left untouched.
func newLongcatTestChannel(channel Channel) Channel {
	if strings.TrimSpace(channel.OtherSettings) == "" {
		channel.OtherSettings = "{}"
	}
	return channel
}

// newLongcatMigrationSQLiteDB opens a throwaway in-memory SQLite database with
// the channels and options tables ready, so LongCat migration behavior tests
// never touch the shared development or production database.
func newLongcatMigrationSQLiteDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	// A ":memory:" SQLite database exists per connection; a single pooled
	// connection keeps every statement on the same database and serializes
	// concurrent test goroutines deterministically at the pool level.
	sqlDB.SetMaxOpenConns(1)
	// Registered before every scenario cleanup, so LIFO runs it last: the
	// connection is closed only after all concurrency goroutines exited and
	// the globals were restored.
	t.Cleanup(func() {
		assert.NoError(t, sqlDB.Close())
	})
	require.NoError(t, db.AutoMigrate(&Channel{}, &Option{}))
	return db
}

// newLongcatMigrationRemoteDB opens the MySQL/PostgreSQL server from the DSN
// environment variable with task-specific prefixed table names, so the
// integration run cannot collide with shared tables. The prefixed tables are
// dropped during cleanup. The DSN itself is never logged or printed.
func newLongcatMigrationRemoteDB(t *testing.T, dialector gorm.Dialector) *gorm.DB {
	t.Helper()
	prefix := fmt.Sprintf("longcat_mig_%d_%d_", os.Getpid(), time.Now().UnixNano())
	db, err := gorm.Open(dialector, &gorm.Config{
		NamingStrategy: schema.NamingStrategy{TablePrefix: prefix},
	})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	// Register the cleanup BEFORE AutoMigrate so that even a partially
	// failed AutoMigrate leaves no prefixed tables or open connection
	// behind.
	t.Cleanup(func() {
		assert.NoError(t, db.Migrator().DropTable(&Channel{}, &Option{}))
		assert.NoError(t, sqlDB.Close())
	})
	require.NoError(t, db.AutoMigrate(&Channel{}, &Option{}))
	return db
}

// runLongcatMigrationScenario runs one scenario against an isolated database
// and publishes dbType as the process-wide main database type for its
// duration: lockForUpdate inside the migration derives SELECT ... FOR UPDATE
// support from common.MainDatabaseType, so a real MySQL/PostgreSQL run must
// not see a stale SQLite setting (and vice versa). The isolated DB is also
// published as the global DB for the production-wrapper scenario. Both
// globals are saved and restored during cleanup. Scenarios never run in
// parallel, so the globals cannot leak across scenarios.
func runLongcatMigrationScenario(t *testing.T, scenario longcatMigrationScenario, db *gorm.DB, dbType common.DatabaseType) {
	t.Helper()
	previousDB := DB
	previousType := common.MainDatabaseType()
	DB = db
	common.SetMainDatabaseType(dbType)
	t.Cleanup(func() {
		DB = previousDB
		common.SetMainDatabaseType(previousType)
	})
	scenario.run(t, db, dbType)
}

func requireChannelTypeCount(t *testing.T, db *gorm.DB, channelType int, expected int64) {
	t.Helper()
	var count int64
	require.NoError(t, db.Model(&Channel{}).Where("type = ?", channelType).Count(&count).Error)
	assert.Equal(t, expected, count, "channel count for type %d", channelType)
}

func requireLongcatMigrationMarker(t *testing.T, db *gorm.DB) Option {
	t.Helper()
	var marker Option
	require.NoError(t, db.Where(&Option{Key: longcatMigrationMarkerKey}).First(&marker).Error)
	return marker
}

func requireNoLongcatMigrationMarker(t *testing.T, db *gorm.DB) {
	t.Helper()
	var marker Option
	assert.ErrorIs(t, db.Where(&Option{Key: longcatMigrationMarkerKey}).First(&marker).Error, gorm.ErrRecordNotFound)
}

// requireChannelsByID snapshots every channel row keyed by Id so tests can
// compare full persisted state before and after the migration.
func requireChannelsByID(t *testing.T, db *gorm.DB) map[int]Channel {
	t.Helper()
	var channels []Channel
	require.NoError(t, db.Order("id").Find(&channels).Error)
	byID := make(map[int]Channel, len(channels))
	for _, channel := range channels {
		byID[channel.Id] = channel
	}
	return byID
}

type longcatMigrationScenario struct {
	name string
	run  func(t *testing.T, db *gorm.DB, dbType common.DatabaseType)
}

func longcatMigrationScenarios() []longcatMigrationScenario {
	return []longcatMigrationScenario{
		{
			// Every legacy type=58 row is LongCat regardless of its name or
			// BaseURL: standard LongCat naming, arbitrary Chinese names with an
			// empty BaseURL, and arbitrary English names with a custom BaseURL
			// must all be migrated.
			name: "migratesLegacyChannelsWithArbitraryNamesAndEmptyBaseURL",
			run: func(t *testing.T, db *gorm.DB, _ common.DatabaseType) {
				longcatURL := "https://api.longcat.chat/openai"
				proxyURL := "https://proxy.internal.example.com/v1"
				legacy := []Channel{
					newLongcatTestChannel(Channel{Type: legacyLongcatChannelTypeValue, Name: "LongCat", Key: "sk-standard", BaseURL: &longcatURL, Models: "longcat-large", Status: common.ChannelStatusEnabled}),
					newLongcatTestChannel(Channel{Type: legacyLongcatChannelTypeValue, Name: "内部代理渠道", Key: "sk-no-base-url", Models: "longcat-large", Status: common.ChannelStatusEnabled}),
					newLongcatTestChannel(Channel{Type: legacyLongcatChannelTypeValue, Name: "My Custom Gateway", Key: "sk-proxy", BaseURL: &proxyURL, Models: "longcat-lite", Status: common.ChannelStatusEnabled}),
				}
				require.NoError(t, db.Create(&legacy).Error)

				require.NoError(t, migrateLongcatChannelType(db))

				requireChannelTypeCount(t, db, constant.ChannelTypeLongcat, 3)
				requireChannelTypeCount(t, db, legacyLongcatChannelTypeValue, 0)
			},
		},
		{
			// Channels of any other type must survive the migration with every
			// persisted field byte-for-byte identical.
			name: "leavesNonLegacyChannelTypesUntouched",
			run: func(t *testing.T, db *gorm.DB, _ common.DatabaseType) {
				others := []Channel{
					newLongcatTestChannel(Channel{Type: constant.ChannelTypeOpenAI, Name: "openai-main", Key: "sk-openai", Models: "gpt-4o", Status: common.ChannelStatusEnabled}),
					newLongcatTestChannel(Channel{Type: constant.ChannelTypeAzure, Name: "azure-east", Key: "sk-azure", Models: "gpt-4o", Status: common.ChannelStatusEnabled}),
					newLongcatTestChannel(Channel{Type: constant.ChannelTypeAnthropic, Name: "claude-direct", Key: "sk-anthropic", Models: "claude-3-5-sonnet", Status: common.ChannelStatusManuallyDisabled}),
					newLongcatTestChannel(Channel{Type: constant.ChannelTypeGemini, Name: "gemini-pro", Key: "sk-gemini", Models: "gemini-2.0-flash", Status: common.ChannelStatusEnabled}),
					newLongcatTestChannel(Channel{Type: constant.ChannelTypeLongcat, Name: "longcat-already-100", Key: "sk-existing-100", Models: "longcat-large", Status: common.ChannelStatusEnabled}),
				}
				require.NoError(t, db.Create(&others).Error)
				before := requireChannelsByID(t, db)

				require.NoError(t, migrateLongcatChannelType(db))

				assert.Equal(t, before, requireChannelsByID(t, db))
			},
		},
		{
			// The first run must persist the completion marker with the exact
			// contracted key and value.
			name: "writesCompletionMarkerOnFirstRun",
			run: func(t *testing.T, db *gorm.DB, _ common.DatabaseType) {
				legacy := newLongcatTestChannel(Channel{Type: legacyLongcatChannelTypeValue, Name: "任意名字", Key: "sk-marker"})
				require.NoError(t, db.Create(&legacy).Error)

				require.NoError(t, migrateLongcatChannelType(db))

				marker := requireLongcatMigrationMarker(t, db)
				assert.Equal(t, longcatMigrationMarkerValue, marker.Value)
			},
		},
		{
			// After the marker exists, an Advanced Custom channel (type 58 in
			// rc23 semantics) created after the upgrade must never be migrated
			// on a later restart, while previously migrated rows stay at 100.
			name: "keepsPostUpgradeAdvancedCustomChannelsOnRestart",
			run: func(t *testing.T, db *gorm.DB, _ common.DatabaseType) {
				longcatURL := "https://api.longcat.chat/openai"
				legacy := newLongcatTestChannel(Channel{Type: legacyLongcatChannelTypeValue, Name: "LongCat", Key: "sk-legacy", BaseURL: &longcatURL})
				require.NoError(t, db.Create(&legacy).Error)
				require.NoError(t, migrateLongcatChannelType(db))

				advanced := newLongcatTestChannel(Channel{Type: constant.ChannelTypeAdvancedCustom, Name: "post-upgrade custom relay", Key: "sk-advanced"})
				require.NoError(t, db.Create(&advanced).Error)

				require.NoError(t, migrateLongcatChannelType(db))

				var migrated Channel
				require.NoError(t, db.First(&migrated, legacy.Id).Error)
				assert.Equal(t, constant.ChannelTypeLongcat, migrated.Type)
				var postUpgrade Channel
				require.NoError(t, db.First(&postUpgrade, advanced.Id).Error)
				assert.Equal(t, constant.ChannelTypeAdvancedCustom, postUpgrade.Type)
			},
		},
		{
			// A fresh install has no channels at all; the marker must still be
			// written so an Advanced Custom channel created after the first
			// startup is never migrated on the second startup.
			name: "writesMarkerOnFreshInstallWithoutChannels",
			run: func(t *testing.T, db *gorm.DB, _ common.DatabaseType) {
				require.NoError(t, migrateLongcatChannelType(db))

				marker := requireLongcatMigrationMarker(t, db)
				assert.Equal(t, longcatMigrationMarkerValue, marker.Value)
				requireChannelTypeCount(t, db, legacyLongcatChannelTypeValue, 0)

				postInstall := newLongcatTestChannel(Channel{Type: constant.ChannelTypeAdvancedCustom, Name: "post-install advanced custom", Key: "sk-new"})
				require.NoError(t, db.Create(&postInstall).Error)

				require.NoError(t, migrateLongcatChannelType(db))

				var reloaded Channel
				require.NoError(t, db.First(&reloaded, postInstall.Id).Error)
				assert.Equal(t, constant.ChannelTypeAdvancedCustom, reloaded.Type)
			},
		},
		{
			// A pre-existing marker (e.g. restored database) disables the
			// migration completely, even for rows that look like LongCat.
			name: "keepsLegacyTypeWhenMarkerAlreadyExists",
			run: func(t *testing.T, db *gorm.DB, _ common.DatabaseType) {
				require.NoError(t, db.Create(&Option{Key: longcatMigrationMarkerKey, Value: longcatMigrationMarkerValue}).Error)
				longcatURL := "https://api.longcat.chat/openai"
				trap := newLongcatTestChannel(Channel{Type: legacyLongcatChannelTypeValue, Name: "LongCat", Key: "sk-trap", BaseURL: &longcatURL})
				require.NoError(t, db.Create(&trap).Error)

				require.NoError(t, migrateLongcatChannelType(db))

				var reloaded Channel
				require.NoError(t, db.First(&reloaded, trap.Id).Error)
				assert.Equal(t, legacyLongcatChannelTypeValue, reloaded.Type)
				marker := requireLongcatMigrationMarker(t, db)
				assert.Equal(t, longcatMigrationMarkerValue, marker.Value)
			},
		},
		{
			// An unexpected persisted marker value must fail loudly instead of
			// silently migrating or silently skipping.
			name: "rejectsUnexpectedPersistedMarkerValue",
			run: func(t *testing.T, db *gorm.DB, _ common.DatabaseType) {
				require.NoError(t, db.Create(&Option{Key: longcatMigrationMarkerKey, Value: "claim-deadbeef"}).Error)
				legacy := newLongcatTestChannel(Channel{Type: legacyLongcatChannelTypeValue, Name: "LongCat", Key: "sk-unexpected"})
				require.NoError(t, db.Create(&legacy).Error)

				err := migrateLongcatChannelType(db)
				require.Error(t, err)

				var reloaded Channel
				require.NoError(t, db.First(&reloaded, legacy.Id).Error)
				assert.Equal(t, legacyLongcatChannelTypeValue, reloaded.Type)
			},
		},
		{
			// For a migrated channel only the type column may change; name,
			// BaseURL, key, models, status and every other field keep their
			// original values.
			name: "changesOnlyTypeOnMigratedChannels",
			run: func(t *testing.T, db *gorm.DB, _ common.DatabaseType) {
				baseURL := "https://api.longcat.chat/openai"
				modelMapping := `{"gpt-4o":"longcat-large"}`
				tag := "production"
				setting := `{"temperature":0.2}`
				remark := "legacy longcat channel"
				priority := int64(7)
				weight := uint(3)
				autoBan := 1
				original := newLongcatTestChannel(Channel{
					Type:               legacyLongcatChannelTypeValue,
					Key:                "sk-preserve-me",
					Name:               "LongCat 生产渠道",
					Status:             common.ChannelStatusEnabled,
					BaseURL:            &baseURL,
					Models:             "longcat-large,longcat-lite",
					Group:              "vip",
					Weight:             &weight,
					Priority:           &priority,
					AutoBan:            &autoBan,
					ModelMapping:       &modelMapping,
					Tag:                &tag,
					Setting:            &setting,
					Remark:             &remark,
					Other:              "keep-this",
					OtherSettings:      `{"version":"v1"}`,
					CreatedTime:        1690000000,
					TestTime:           1695000000,
					ResponseTime:       250,
					Balance:            1.5,
					BalanceUpdatedTime: 1700000000,
					UsedQuota:          12345,
				})
				require.NoError(t, db.Create(&original).Error)
				require.NotZero(t, original.Id)

				var before Channel
				require.NoError(t, db.First(&before, original.Id).Error)

				require.NoError(t, migrateLongcatChannelType(db))

				var after Channel
				require.NoError(t, db.First(&after, original.Id).Error)

				expected := before
				expected.Type = constant.ChannelTypeLongcat
				assert.Equal(t, expected, after, "only the type column may change")
				assert.NotEqual(t, before.Type, after.Type)
			},
		},
		{
			// If the final completed-marker write fails AFTER the channel
			// UPDATE already executed, the whole transaction must roll back:
			// no migrated channels and no marker row (the ownership claim is
			// rolled back too). The failure is injected deterministically
			// through a GORM update callback on the marker finalization, with
			// no randomness, sleeps or timing races.
			name: "rollsBackChannelUpdatesWhenMarkerWriteFails",
			run: func(t *testing.T, db *gorm.DB, _ common.DatabaseType) {
				markerFailure := errors.New("simulated completed-marker persistence failure")
				callbackName := "longcat_migration_test_fail_completed_marker"
				// Register the removal cleanup BEFORE Register: GORM appends
				// the callback before compile, so even a Register that
				// returns an error may have left the callback appended and
				// needing Remove.
				t.Cleanup(func() {
					assert.NoError(t, db.Callback().Update().Remove(callbackName))
				})
				require.NoError(t, db.Callback().Update().Before("gorm:update").Register(callbackName, func(tx *gorm.DB) {
					if _, ok := tx.Statement.Model.(*Option); ok {
						tx.AddError(markerFailure)
					}
				}))

				legacy := newLongcatTestChannel(Channel{Type: legacyLongcatChannelTypeValue, Name: "LongCat", Key: "sk-rollback", Models: "longcat-large"})
				require.NoError(t, db.Create(&legacy).Error)

				err := migrateLongcatChannelType(db)
				require.Error(t, err)

				requireChannelTypeCount(t, db, legacyLongcatChannelTypeValue, 1)
				requireChannelTypeCount(t, db, constant.ChannelTypeLongcat, 0)
				requireNoLongcatMigrationMarker(t, db)
			},
		},
		{
			// If the ownership claim itself cannot be persisted, the migration
			// must fail leaving no partial state: no marker and no channel
			// update may have happened.
			name: "leavesNoPartialStateWhenOwnershipClaimFails",
			run: func(t *testing.T, db *gorm.DB, _ common.DatabaseType) {
				claimFailure := errors.New("simulated claim persistence failure")
				callbackName := "longcat_migration_test_fail_claim"
				// Register the removal cleanup BEFORE Register: GORM appends
				// the callback before compile, so even a Register that
				// returns an error may have left the callback appended and
				// needing Remove.
				t.Cleanup(func() {
					assert.NoError(t, db.Callback().Create().Remove(callbackName))
				})
				require.NoError(t, db.Callback().Create().Before("gorm:create").Register(callbackName, func(tx *gorm.DB) {
					if option, ok := tx.Statement.Dest.(*Option); ok && option.Key == longcatMigrationMarkerKey {
						tx.AddError(claimFailure)
					}
				}))

				legacy := newLongcatTestChannel(Channel{Type: legacyLongcatChannelTypeValue, Name: "LongCat", Key: "sk-claim-failure"})
				require.NoError(t, db.Create(&legacy).Error)

				err := migrateLongcatChannelType(db)
				require.Error(t, err)

				requireChannelTypeCount(t, db, legacyLongcatChannelTypeValue, 1)
				requireChannelTypeCount(t, db, constant.ChannelTypeLongcat, 0)
				requireNoLongcatMigrationMarker(t, db)
			},
		},
		{
			// If the legacy channel UPDATE itself fails, the whole transaction
			// must roll back: no migrated channels and no marker row, proving
			// the owner-token claim disappears with the transaction. The
			// failure is injected deterministically through a GORM update
			// callback, with no randomness, sleeps or timing races.
			name: "channelUpdateFailureRollsBackOwnershipClaim",
			run: func(t *testing.T, db *gorm.DB, _ common.DatabaseType) {
				updateFailure := errors.New("simulated channel update failure")
				callbackName := "longcat_migration_test_fail_channel_update"
				// Register the removal cleanup BEFORE Register: GORM appends
				// the callback before compile, so even a Register that
				// returns an error may have left the callback appended and
				// needing Remove.
				t.Cleanup(func() {
					assert.NoError(t, db.Callback().Update().Remove(callbackName))
				})
				require.NoError(t, db.Callback().Update().Before("gorm:update").Register(callbackName, func(tx *gorm.DB) {
					if _, ok := tx.Statement.Model.(*Channel); ok {
						tx.AddError(updateFailure)
					}
				}))

				legacy := newLongcatTestChannel(Channel{Type: legacyLongcatChannelTypeValue, Name: "LongCat", Key: "sk-update-failure"})
				require.NoError(t, db.Create(&legacy).Error)

				err := migrateLongcatChannelType(db)
				require.Error(t, err)

				requireChannelTypeCount(t, db, legacyLongcatChannelTypeValue, 1)
				requireChannelTypeCount(t, db, constant.ChannelTypeLongcat, 0)
				requireNoLongcatMigrationMarker(t, db)
			},
		},
		{
			// Running the migration repeatedly must be stable: legacy rows are
			// migrated exactly once and the outcome never drifts.
			name: "staysStableAcrossRepeatedRuns",
			run: func(t *testing.T, db *gorm.DB, _ common.DatabaseType) {
				legacy := newLongcatTestChannel(Channel{Type: legacyLongcatChannelTypeValue, Name: "LongCat", Key: "sk-repeat"})
				other := newLongcatTestChannel(Channel{Type: constant.ChannelTypeOpenAI, Name: "openai", Key: "sk-repeat-openai"})
				require.NoError(t, db.Create(&legacy).Error)
				require.NoError(t, db.Create(&other).Error)

				for i := 0; i < 3; i++ {
					require.NoError(t, migrateLongcatChannelType(db))
					requireChannelTypeCount(t, db, constant.ChannelTypeLongcat, 1)
					requireChannelTypeCount(t, db, constant.ChannelTypeOpenAI, 1)
					requireChannelTypeCount(t, db, legacyLongcatChannelTypeValue, 0)
					marker := requireLongcatMigrationMarker(t, db)
					assert.Equal(t, longcatMigrationMarkerValue, marker.Value)
				}
			},
		},
		{
			// Two concurrent startups must never both migrate: exactly one
			// invocation owns the migration, a post-upgrade Advanced Custom
			// type=58 channel created after the owner committed stays at 58,
			// the legacy channel ends at 100 and the marker is exactly
			// "completed".
			//
			// Coordination is fully deterministic via GORM callbacks and Go
			// channels, enforcing this order for MySQL/PostgreSQL:
			//   1. the owner executes its legacy channel UPDATE and pauses
			//      inside the open transaction (claim inserted, marker not
			//      yet completed, nothing committed);
			//   2. while the owner's transaction is still open, the
			//      competitor enters the BeforeCreate path of its marker
			//      claim;
			//   3. the owner is released;
			//   4. the test waits until the owner's transaction committed;
			//   5. the post-upgrade type=58 channel is inserted synchronously
			//      in the main test goroutine — Create returning means the
			//      insert transaction has ended;
			//   6. only then is the competitor's locked current read of the
			//      marker allowed to proceed;
			//   7. the competitor observes "completed" and exits;
			//   8. the channel UPDATE count is exactly 1, legacy=100,
			//      post-upgrade=58 and marker=completed.
			// No sleeps, random collisions, scheduling assumptions or timing
			// assertions are used: every step is gated, and the asserted
			// invariants hold for every interleaving. Phase-signal waits also
			// watch the responsible error channel for early failures, while
			// each error channel's completion result is consumed exactly once
			// by its waitDone; the timeouts in play are pure deadlock guards.
			//
			// What this scenario proves: two startup invocations overlap, the
			// competitor enters the claim creation path while the owner's
			// transaction is still open, the owner commits, then the
			// post-upgrade channel is inserted synchronously and completes
			// before the competitor's locked current read, and the final
			// state is exactly one channel UPDATE, legacy=100,
			// post-upgrade=58, marker=completed.
			// What it does NOT prove: competitorClaimAttempted only shows
			// that the competitor reached the BeforeCreate path of its marker
			// claim — not that the claim INSERT SQL was already sent, nor
			// that it waited on the owner's database row lock. The true
			// unique-key-conflict and lockForUpdate semantics are validated by
			// the production implementation, the real MySQL/PostgreSQL matrix
			// and the final-state assertions together.
			name: "concurrentStartupsMigrateExactlyOnce",
			run: func(t *testing.T, db *gorm.DB, dbType common.DatabaseType) {
				legacy := newLongcatTestChannel(Channel{Type: legacyLongcatChannelTypeValue, Name: "LongCat", Key: "sk-concurrent-legacy"})
				require.NoError(t, db.Create(&legacy).Error)

				var channelUpdateAttempts atomic.Int32
				var concurrencyWG sync.WaitGroup
				ownerUpdated := make(chan struct{})
				var ownerUpdatedOnce sync.Once
				competitorClaimAttempted := make(chan struct{})
				var competitorClaimOnce sync.Once
				releaseOwner := make(chan struct{})
				var releaseOwnerOnce sync.Once
				releaseOwnerNow := func() { releaseOwnerOnce.Do(func() { close(releaseOwner) }) }
				allowCompetitorMarkerRead := make(chan struct{})
				var allowCompetitorMarkerReadOnce sync.Once
				allowCompetitorMarkerReadNow := func() {
					allowCompetitorMarkerReadOnce.Do(func() { close(allowCompetitorMarkerRead) })
				}
				abortConcurrency := make(chan struct{})
				var abortConcurrencyOnce sync.Once
				abortConcurrencyNow := func() {
					abortConcurrencyOnce.Do(func() { close(abortConcurrency) })
				}
				ctx, cancel := context.WithCancel(context.Background())

				// Removers of every callback whose registration was attempted:
				// GORM Register appends the callback to the processor before
				// compile, so even a Register that returns an error may have
				// left the callback appended and needing Remove. The remover
				// is therefore recorded BEFORE require.NoError aborts the
				// test, so cleanup also removes any possibly-appended callback
				// when registration fails mid-way.
				var registeredCallbackRemovers []func() error
				registerCallback := func(registerErr error, remove func() error) {
					registeredCallbackRemovers = append(registeredCallbackRemovers, remove)
					require.NoError(t, registerErr)
				}

				// Unified lifecycle cleanup, registered BEFORE the first
				// callback so it also covers partial registration failures,
				// and registered inside the scenario (after the fixture's
				// DropTable/Close cleanup and the runner's global-restoration
				// cleanup) so LIFO runs it FIRST on teardown: cancel the test
				// context, idempotently release every internal gate, join all
				// launched goroutines, and only then remove the registered
				// callbacks. Globals are restored and tables/connections are
				// dropped afterwards, never while a migration goroutine is
				// still alive. Every internal gate is idempotently released
				// and the context is cancelled before the join, so the
				// goroutines must exit; an uncancellable hang in the join is
				// deliberately left to the overall `go test` timeout rather
				// than pretending cleanup finished while workers live on.
				t.Cleanup(func() {
					cancel()
					releaseOwnerNow()
					allowCompetitorMarkerReadNow()
					abortConcurrencyNow()
					concurrencyWG.Wait()
					for _, remove := range registeredCallbackRemovers {
						assert.NoError(t, remove())
					}
				})

				countUpdatesName := "longcat_test_count_channel_updates"
				gateOwnerName := "longcat_test_gate_owner"
				gateCompetitorClaimName := "longcat_test_gate_competitor_claim"
				gateCompetitorMarkerReadName := "longcat_test_gate_competitor_marker_read"
				registerCallback(
					db.Callback().Update().Before("gorm:update").Register(countUpdatesName, func(tx *gorm.DB) {
						if _, ok := tx.Statement.Model.(*Channel); ok {
							channelUpdateAttempts.Add(1)
						}
					}),
					func() error { return db.Callback().Update().Remove(countUpdatesName) },
				)
				registerCallback(
					db.Callback().Update().After("gorm:update").Register(gateOwnerName, func(tx *gorm.DB) {
						role, _ := tx.Statement.Context.Value(longcatConcurrencyRoleKey{}).(longcatConcurrencyRole)
						if role != longcatConcurrencyRoleOwner {
							return
						}
						if _, ok := tx.Statement.Model.(*Channel); !ok {
							return
						}
						ownerUpdatedOnce.Do(func() { close(ownerUpdated) })
						<-releaseOwner
					}),
					func() error { return db.Callback().Update().Remove(gateOwnerName) },
				)
				registerCallback(
					db.Callback().Create().Before("gorm:create").Register(gateCompetitorClaimName, func(tx *gorm.DB) {
						role, _ := tx.Statement.Context.Value(longcatConcurrencyRoleKey{}).(longcatConcurrencyRole)
						if role != longcatConcurrencyRoleCompetitor {
							return
						}
						if option, ok := tx.Statement.Dest.(*Option); ok && option.Key == longcatMigrationMarkerKey {
							competitorClaimOnce.Do(func() { close(competitorClaimAttempted) })
						}
					}),
					func() error { return db.Callback().Create().Remove(gateCompetitorClaimName) },
				)
				registerCallback(
					db.Callback().Query().Before("gorm:query").Register(gateCompetitorMarkerReadName, func(tx *gorm.DB) {
						role, _ := tx.Statement.Context.Value(longcatConcurrencyRoleKey{}).(longcatConcurrencyRole)
						if role != longcatConcurrencyRoleCompetitor {
							return
						}
						if _, ok := tx.Statement.Model.(*Option); !ok {
							return
						}
						// The competitor may only run its locked current
						// read of the marker after the main test goroutine
						// released the gate; during teardown the abort
						// signal unblocks it so the goroutine can exit.
						select {
						case <-allowCompetitorMarkerRead:
						case <-abortConcurrency:
							return
						}
					}),
					func() error { return db.Callback().Query().Remove(gateCompetitorMarkerReadName) },
				)

				// waitSignal blocks until signal closes. If the migration
				// finishes (with or without error) before reaching the
				// coordinated point, the test fails immediately; the deadline
				// is only a deadlock guard.
				waitSignal := func(done <-chan error, signal <-chan struct{}, what string) {
					select {
					case <-signal:
					case err := <-done:
						require.Failf(t, "migration returned before "+what, "returned: %v", err)
					case <-time.After(longcatConcurrencyDeadlockGuard):
						require.Fail(t, "deadlock guard expired while waiting for "+what)
					}
				}
				waitDone := func(done <-chan error, what string) {
					select {
					case err := <-done:
						require.NoError(t, err, what)
					case <-time.After(longcatConcurrencyDeadlockGuard):
						require.Fail(t, "deadlock guard expired while waiting for "+what)
					}
				}

				ownerDB := db.WithContext(context.WithValue(ctx, longcatConcurrencyRoleKey{}, longcatConcurrencyRoleOwner))
				competitorDB := db.WithContext(context.WithValue(ctx, longcatConcurrencyRoleKey{}, longcatConcurrencyRoleCompetitor))
				postUpgrade := newLongcatTestChannel(Channel{Type: constant.ChannelTypeAdvancedCustom, Name: "post-upgrade advanced custom", Key: "sk-concurrent-post-upgrade"})

				ownerErr := make(chan error, 1)
				competitorErr := make(chan error, 1)

				// Step 1: the owner executes its legacy channel UPDATE and
				// pauses inside the open transaction (claim inserted, marker
				// not yet completed, nothing committed).
				concurrencyWG.Add(1)
				go func() {
					defer concurrencyWG.Done()
					ownerErr <- migrateLongcatChannelType(ownerDB)
				}()
				waitSignal(ownerErr, ownerUpdated, "the owner executed its channel UPDATE")

				switch dbType {
				case common.DatabaseTypeSQLite:
					// SQLite serializes all writers on the single pooled
					// connection, so a competitor can never hold a concurrent
					// transaction against the owner's open one. This branch
					// verifies the serial idempotency of concurrent
					// in-process invocations in the explicit order: owner
					// commit -> synchronous post-upgrade insert -> start the
					// competitor and allow its marker read -> competitor
					// observes "completed" and exits. It deliberately does NOT
					// claim to verify multi-process SQLite write contention.
					releaseOwnerNow()
					waitDone(ownerErr, "owner migration")
					require.NoError(t, db.Create(&postUpgrade).Error)
					concurrencyWG.Add(1)
					go func() {
						defer concurrencyWG.Done()
						competitorErr <- migrateLongcatChannelType(competitorDB)
					}()
					allowCompetitorMarkerReadNow()
					waitDone(competitorErr, "competitor migration")
				default:
					// Step 2: start the competitor while the owner's
					// transaction is still open, and wait until the competitor
					// has entered the BeforeCreate path of its marker claim.
					// This proves the two invocations overlap; it does NOT
					// prove that the INSERT SQL was sent or that it waited on
					// the owner's row lock.
					concurrencyWG.Add(1)
					go func() {
						defer concurrencyWG.Done()
						competitorErr <- migrateLongcatChannelType(competitorDB)
					}()
					waitSignal(competitorErr, competitorClaimAttempted, "the competitor entered its marker claim BeforeCreate path")
					// Steps 3-4: release the owner and wait until its
					// transaction has committed.
					releaseOwnerNow()
					waitDone(ownerErr, "owner migration")
					// Step 5: insert the post-upgrade channel synchronously
					// in the main test goroutine. Create returning means the
					// insert transaction has ended; no inserter goroutine and
					// no create-callbacks are needed to prove it.
					require.NoError(t, db.Create(&postUpgrade).Error)
					// Step 6: only now is the competitor's locked current
					// read of the marker allowed to proceed.
					allowCompetitorMarkerReadNow()
					// Steps 7-8: the competitor observes "completed" and
					// exits without touching any channel.
					waitDone(competitorErr, "competitor migration")
				}

				assert.EqualValues(t, 1, channelUpdateAttempts.Load(), "exactly one instance may execute the channel UPDATE")
				var migrated Channel
				require.NoError(t, db.First(&migrated, legacy.Id).Error)
				assert.Equal(t, constant.ChannelTypeLongcat, migrated.Type)
				var advanced Channel
				require.NoError(t, db.First(&advanced, postUpgrade.Id).Error)
				assert.Equal(t, constant.ChannelTypeAdvancedCustom, advanced.Type)
				marker := requireLongcatMigrationMarker(t, db)
				assert.Equal(t, longcatMigrationMarkerValue, marker.Value)
			},
		},
		{
			// The exported startup entry point reads the package-level DB: it
			// must tolerate a nil DB and operate on the swapped-in test DB.
			// The scenario runner publishes this isolated DB as the global DB
			// and restores the original globals during cleanup.
			name: "productionWrapperUsesGlobalDBAndToleratesNilDB",
			run: func(t *testing.T, db *gorm.DB, _ common.DatabaseType) {
				legacy := newLongcatTestChannel(Channel{Type: legacyLongcatChannelTypeValue, Name: "wrapped", Key: "sk-wrapper"})
				require.NoError(t, db.Create(&legacy).Error)

				DB = nil
				require.NoError(t, MigrateLongcatChannelType())

				DB = db
				require.NoError(t, MigrateLongcatChannelType())

				requireChannelTypeCount(t, db, constant.ChannelTypeLongcat, 1)
				requireLongcatMigrationMarker(t, db)
			},
		},
	}
}

func TestMigrateLongcatChannelTypeSQLite(t *testing.T) {
	for _, scenario := range longcatMigrationScenarios() {
		t.Run(scenario.name, func(t *testing.T) {
			runLongcatMigrationScenario(t, scenario, newLongcatMigrationSQLiteDB(t), common.DatabaseTypeSQLite)
		})
	}
}

func TestMigrateLongcatChannelTypeConfiguredDatabases(t *testing.T) {
	databases := []struct {
		name      string
		env       string
		dbType    common.DatabaseType
		dialector func(dsn string) gorm.Dialector
	}{
		{
			name:      "mysql",
			env:       "TEST_MYSQL_DSN",
			dbType:    common.DatabaseTypeMySQL,
			dialector: func(dsn string) gorm.Dialector { return mysql.Open(dsn) },
		},
		{
			name:   "postgres",
			env:    "TEST_POSTGRES_DSN",
			dbType: common.DatabaseTypePostgreSQL,
			dialector: func(dsn string) gorm.Dialector {
				// PreferSimpleProtocol must stay disabled here: under the
				// simple protocol pgx cannot see the target json column type
				// and encodes the []byte returned by ChannelInfo.Value() as
				// bytea hex ("\x..."), which PostgreSQL rejects with
				// "invalid input syntax for type json" (SQLSTATE 22P02). The
				// extended protocol describes the statement and sends the raw
				// JSON bytes instead.
				return postgres.New(postgres.Config{DSN: dsn})
			},
		},
	}
	for _, database := range databases {
		t.Run(database.name, func(t *testing.T) {
			dsn := strings.TrimSpace(os.Getenv(database.env))
			if dsn == "" {
				t.Skip(database.env + " is not configured; skipping integration run")
			}
			for _, scenario := range longcatMigrationScenarios() {
				t.Run(scenario.name, func(t *testing.T) {
					runLongcatMigrationScenario(t, scenario, newLongcatMigrationRemoteDB(t, database.dialector(dsn)), database.dbType)
				})
			}
		})
	}
}
