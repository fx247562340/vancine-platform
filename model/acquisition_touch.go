package model

import (
	"crypto/subtle"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	// AcquisitionCoverageStartedAtKey is the options key recording when
	// first-party acquisition attribution coverage started. It is written once
	// (insert-if-absent) and never overwritten.
	AcquisitionCoverageStartedAtKey = "acquisition.coverage_started_at"
	// AcquisitionCookieName is the signed first-touch cookie name.
	AcquisitionCookieName = "vancine_ft"
	// AcquisitionCookieMaxAge is the cookie lifetime in seconds (180 days).
	AcquisitionCookieMaxAge = 15552000
)

// UTM field length limits (design §7.2).
const (
	acquisitionUTMShortLimit = 64  // utm_source, utm_medium
	acquisitionUTMLongLimit  = 128 // utm_campaign, utm_content, utm_term
	acquisitionPathMaxLen    = 255
)

var (
	touchIDPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)
	utmAllowChars  = regexp.MustCompile(`[^A-Za-z0-9._%-]+`)
)

// acquisitionFunnelBatchSize bounds the user_id parameter lists sent to the
// token and consume-log milestone queries. 250 users per batch keeps every
// batch far below the placeholder limits of SQLite (999 minimum), PostgreSQL
// (65535) and MySQL (65535) even for the two-placeholder-per-user log
// condition, and bounds per-batch result memory to at most 250 ids.
const acquisitionFunnelBatchSize = 250

// data_completeness field values. Kept as named constants internally; the
// JSON output values must stay exactly these strings.
const (
	acquisitionCompletenessComplete    = "complete"
	acquisitionCompletenessError       = "error"
	acquisitionCompletenessUnavailable = "unavailable"
)

// AcquisitionTouch stores an immutable first-landing snapshot and funnel
// milestones. It intentionally holds no PII: no IP, user agent, email,
// username, cookie value, referrer, or query string.
type AcquisitionTouch struct {
	Id                int    `json:"id" gorm:"primaryKey"`
	TouchId           string `json:"touch_id" gorm:"type:varchar(64);uniqueIndex;not null"`
	UserId            *int   `json:"user_id" gorm:"uniqueIndex"`
	UtmSource         string `json:"utm_source" gorm:"type:varchar(64);index;default:''"`
	UtmMedium         string `json:"utm_medium" gorm:"type:varchar(64);default:''"`
	UtmCampaign       string `json:"utm_campaign" gorm:"type:varchar(128);index;default:''"`
	UtmContent        string `json:"utm_content" gorm:"type:varchar(128);default:''"`
	UtmTerm           string `json:"utm_term" gorm:"type:varchar(128);default:''"`
	LandingPath       string `json:"landing_path" gorm:"type:varchar(255);default:''"`
	FirstSeenAt       int64  `json:"first_seen_at" gorm:"bigint;index;not null"`
	SignupStartedAt   *int64 `json:"signup_started_at" gorm:"bigint"`
	SignupCompletedAt *int64 `json:"signup_completed_at" gorm:"bigint;index"`
	CreatedAt         int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt         int64  `json:"updated_at" gorm:"bigint"`
}

func (AcquisitionTouch) TableName() string {
	return "acquisition_touches"
}

// AcquisitionUTMFields holds allowlisted UTM dimensions plus landing path.
type AcquisitionUTMFields struct {
	UtmSource   string
	UtmMedium   string
	UtmCampaign string
	UtmContent  string
	UtmTerm     string
	LandingPath string
}

// SanitizeUTMValue normalizes one UTM dimension (design §7.2), in order:
// 1) trim whitespace; 2) fix invalid UTF-8 and strip control characters
// (U+0000–U+001F, U+007F); 3) UTF-8-safe hard truncation to maxLen;
// 4) collapse whitespace runs to a single "_"; 5) drop every character
// outside [A-Za-z0-9._%-]. Empty input or result yields "".
func SanitizeUTMValue(raw string, maxLen int) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	if !utf8.ValidString(s) {
		s = strings.ToValidUTF8(s, "")
	}
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r <= 0x1F || r == 0x7F {
			continue
		}
		b.WriteRune(r)
	}
	s = b.String()
	if s == "" {
		return ""
	}
	s = truncateUTF8Safe(s, maxLen)
	if s == "" {
		return ""
	}
	s = strings.Join(strings.Fields(s), "_")
	return utmAllowChars.ReplaceAllString(s, "")
}

// truncateUTF8Safe returns the longest prefix of s fitting in maxBytes bytes
// without splitting a multi-byte rune. maxBytes <= 0 yields "".
func truncateUTF8Safe(s string, maxBytes int) string {
	if maxBytes <= 0 {
		return ""
	}
	if len(s) <= maxBytes {
		return s
	}
	out := make([]byte, 0, maxBytes)
	for _, r := range s {
		enc := string(r)
		if len(out)+len(enc) > maxBytes {
			break
		}
		out = append(out, enc...)
	}
	return string(out)
}

// SanitizeLandingPath validates a site-relative landing path (design §7.3).
// Any invalid input becomes "" instead of being stored.
func SanitizeLandingPath(raw string) string {
	if !utf8.ValidString(raw) {
		raw = strings.ToValidUTF8(raw, "")
	}
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	// Strip query and fragment; full URLs and query strings are never stored.
	if i := strings.IndexAny(s, "?#"); i >= 0 {
		s = s[:i]
	}
	lower := strings.ToLower(s)
	if strings.HasPrefix(lower, "http:") || strings.HasPrefix(lower, "https:") {
		return ""
	}
	if strings.HasPrefix(s, "//") {
		return ""
	}
	if strings.ContainsAny(s, " \t\r\n\\") {
		return ""
	}
	if !strings.HasPrefix(s, "/") {
		return ""
	}
	for strings.Contains(s, "//") {
		s = strings.ReplaceAll(s, "//", "/")
	}
	s = truncateUTF8Safe(s, acquisitionPathMaxLen)
	return s
}

// SanitizeUTMFields sanitizes a full UTM + landing-path payload.
func SanitizeUTMFields(in AcquisitionUTMFields) AcquisitionUTMFields {
	return AcquisitionUTMFields{
		UtmSource:   SanitizeUTMValue(in.UtmSource, acquisitionUTMShortLimit),
		UtmMedium:   SanitizeUTMValue(in.UtmMedium, acquisitionUTMShortLimit),
		UtmCampaign: SanitizeUTMValue(in.UtmCampaign, acquisitionUTMLongLimit),
		UtmContent:  SanitizeUTMValue(in.UtmContent, acquisitionUTMLongLimit),
		UtmTerm:     SanitizeUTMValue(in.UtmTerm, acquisitionUTMLongLimit),
		LandingPath: SanitizeLandingPath(in.LandingPath),
	}
}

// FormatTouchCookieValue builds the cookie value "<touch_id>.<hmac_hex>",
// signed with HMAC-SHA256 over the touch id using common.CryptoSecret.
func FormatTouchCookieValue(touchID string) string {
	return touchID + "." + common.GenerateHMAC(touchID)
}

// ParseAndVerifyTouchCookie strictly parses and verifies a cookie value.
// It requires exactly one '.' separator, a 32-char lowercase-hex touch id,
// and a constant-time HMAC match. Invalid input yields ok=false.
func ParseAndVerifyTouchCookie(raw string) (string, bool) {
	if raw == "" {
		return "", false
	}
	dot := strings.IndexByte(raw, '.')
	if dot <= 0 || dot != strings.LastIndexByte(raw, '.') {
		return "", false
	}
	touchID := raw[:dot]
	sig := raw[dot+1:]
	if !touchIDPattern.MatchString(touchID) {
		return "", false
	}
	expected := common.GenerateHMAC(touchID)
	if subtle.ConstantTimeCompare([]byte(sig), []byte(expected)) != 1 {
		return "", false
	}
	return touchID, true
}

// CreateAcquisitionTouch inserts a new first-landing snapshot row. This is
// the only writer of UTM/landing_path values; the snapshot is frozen from
// this point on.
func CreateAcquisitionTouch(fields AcquisitionUTMFields) (*AcquisitionTouch, error) {
	now := common.GetTimestamp()
	clean := SanitizeUTMFields(fields)
	touch := &AcquisitionTouch{
		TouchId:     common.GetUUID(),
		UtmSource:   clean.UtmSource,
		UtmMedium:   clean.UtmMedium,
		UtmCampaign: clean.UtmCampaign,
		UtmContent:  clean.UtmContent,
		UtmTerm:     clean.UtmTerm,
		LandingPath: clean.LandingPath,
		FirstSeenAt: now,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := DB.Create(touch).Error; err != nil {
		return nil, err
	}
	return touch, nil
}

// GetAcquisitionTouchByTouchID loads a touch by its public touch id.
func GetAcquisitionTouchByTouchID(touchID string) (*AcquisitionTouch, error) {
	if !touchIDPattern.MatchString(touchID) {
		return nil, gorm.ErrRecordNotFound
	}
	var touch AcquisitionTouch
	if err := DB.Where("touch_id = ?", touchID).First(&touch).Error; err != nil {
		return nil, err
	}
	return &touch, nil
}

// acquisitionMilestoneFillUpdates returns the set-if-null SET expressions
// that fill signup_started_at / signup_completed_at from one captured
// timestamp while keeping the invariant signup_started_at <=
// signup_completed_at. It is shared by the first-bind and the same-user
// re-bind fill paths; callers add their own remaining columns and guard.
//
// The expressions are written to hold the invariant under BOTH single-table
// UPDATE evaluation behaviors, without relying on dialect-specific SQL:
// SQLite/PostgreSQL evaluate every SET right-hand side on the pre-update
// row, while MySQL assigns left-to-right, so a right-hand side may observe
// either the pre-update value or the just-assigned value of the sibling
// column. Each fill is built so both observations resolve correctly:
//   - started's CASE yields min(now, completed): an existing completed
//     clamps the fill whether it is read pre-update or not, and a NULL
//     completed falls through to now;
//   - completed's CASE yields max(now, started): an existing started lifts
//     the fill even when the system clock moved backwards, and a NULL
//     started falls through to now — with the just-assigned started (the
//     same captured timestamp) it still resolves to now.
//
// COALESCE guarantees an already-written milestone is never overwritten,
// concurrent writers serialize on the row and each evaluates against the
// latest committed state, and the map emission order of the two columns is
// irrelevant because both orderings satisfy the invariant.
func acquisitionMilestoneFillUpdates(now int64) map[string]interface{} {
	return map[string]interface{}{
		"signup_started_at": gorm.Expr(
			"COALESCE(signup_started_at, CASE WHEN signup_completed_at IS NOT NULL AND signup_completed_at < ? THEN signup_completed_at ELSE ? END)",
			now, now),
		"signup_completed_at": gorm.Expr(
			"COALESCE(signup_completed_at, CASE WHEN signup_started_at > ? THEN signup_started_at ELSE ? END)",
			now, now),
	}
}

// MarkAcquisitionSignupStarted sets signup_started_at once (set-if-null) on
// an existing touch. It never creates rows. The bool reports whether the
// touch row exists; a missing row is a soft no-op, not an error.
//
// The fill is one atomic statement: it reuses the shared started-fill
// expression, so when signup_completed_at already exists and predates now,
// the written started is clamped to that completed value and the ordering
// invariant holds. An existing started is never overwritten, and when the
// WHERE guard matches no row nothing else is updated either.
func MarkAcquisitionSignupStarted(touchID string) (bool, error) {
	touch, err := GetAcquisitionTouchByTouchID(touchID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	now := common.GetTimestamp()
	err = DB.Model(&AcquisitionTouch{}).
		Where("id = ? AND signup_started_at IS NULL", touch.Id).
		Updates(map[string]interface{}{
			"signup_started_at": acquisitionMilestoneFillUpdates(now)["signup_started_at"],
			"updated_at":        now,
		}).Error
	if err != nil {
		return true, err
	}
	return true, nil
}

// BindAcquisitionTouchToUser binds a valid touch to a newly created user,
// exactly once. It always soft-fails: attribution problems are logged and
// swallowed so they can never break registration or login.
func BindAcquisitionTouchToUser(touchID string, userID int) {
	if userID <= 0 || !touchIDPattern.MatchString(touchID) {
		return
	}
	touch, err := GetAcquisitionTouchByTouchID(touchID)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			common.SysLog(fmt.Sprintf("acquisition bind load error: %v", err))
		}
		return
	}

	// Already bound to this user: fill any missing milestone with ONE atomic
	// statement built from the shared set-if-null expressions, guarded so a
	// fully complete row is a true no-op (updated_at is not bumped). Row
	// locking serializes concurrent writers and the expressions keep
	// signup_started_at <= signup_completed_at regardless of which milestone
	// a concurrent writer committed first; the Go-level snapshot above only
	// decides whether to attempt the statement, never what it writes.
	if touch.UserId != nil && *touch.UserId == userID {
		if touch.SignupStartedAt == nil || touch.SignupCompletedAt == nil {
			now := common.GetTimestamp()
			updates := acquisitionMilestoneFillUpdates(now)
			updates["updated_at"] = now
			err := DB.Model(&AcquisitionTouch{}).
				Where("id = ? AND (signup_started_at IS NULL OR signup_completed_at IS NULL)", touch.Id).
				Updates(updates).Error
			if err != nil {
				common.SysLog(fmt.Sprintf("acquisition milestone fill error: %v", err))
			}
		}
		return
	}
	// Bound to a different user: never rebind or steal.
	if touch.UserId != nil {
		common.SysLog("acquisition bind skipped: touch already bound to another user")
		return
	}

	// Another touch already owns this user: prefer the earlier bind.
	var existing int64
	if err := DB.Model(&AcquisitionTouch{}).Where("user_id = ?", userID).Count(&existing).Error; err != nil {
		common.SysLog(fmt.Sprintf("acquisition bind user-check error: %v", err))
		return
	}
	if existing > 0 {
		return
	}

	// First bind: user_id may only move from NULL here. Milestones are
	// written by the same shared set-if-null expressions, so a started value
	// already committed by a concurrent MarkAcquisitionSignupStarted survives
	// (COALESCE), a pre-existing completed is never overwritten, a lone
	// started still yields completed >= started under clock regression, and
	// two empty milestones receive the same captured now. The stale Go
	// snapshot above never decides the written values; the conditional SQL
	// does, evaluated against the latest committed row.
	now := common.GetTimestamp()
	updates := acquisitionMilestoneFillUpdates(now)
	updates["user_id"] = userID
	updates["updated_at"] = now
	res := DB.Model(&AcquisitionTouch{}).
		Where("id = ? AND user_id IS NULL", touch.Id).
		Updates(updates)
	if res.Error != nil && !isAcquisitionUniqueViolation(res.Error) {
		common.SysLog(fmt.Sprintf("acquisition bind update error: %v", res.Error))
	}
}

func isAcquisitionUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	msg := err.Error()
	return strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "Duplicate entry") ||
		strings.Contains(msg, "UNIQUE constraint")
}

// EnsureAcquisitionCoverageStartedAt performs the insert-if-absent coverage
// marker write (design §5.5). It never overwrites an existing value; if the
// key already exists (prior boot or concurrent winner) the original value is
// read back and returned. Any other database error is returned so the
// migration caller fails startup.
func EnsureAcquisitionCoverageStartedAt() (int64, error) {
	if v, err := GetAcquisitionCoverageStartedAt(); err == nil {
		return v, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, err
	}

	opt := Option{
		Key:   AcquisitionCoverageStartedAtKey,
		Value: strconv.FormatInt(common.GetTimestamp(), 10),
	}
	// Cross-database insert-if-absent: SQLite/PostgreSQL emit ON CONFLICT DO
	// NOTHING; GORM's MySQL driver rewrites it to a no-op ON DUPLICATE KEY
	// UPDATE. A concurrent winner therefore never surfaces as an error and the
	// stored value is never overwritten.
	createErr := DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoNothing: true,
	}).Create(&opt).Error
	if createErr != nil && !isAcquisitionUniqueViolation(createErr) {
		return 0, createErr
	}

	// Re-read the authoritative value (ours or a concurrent winner's).
	return GetAcquisitionCoverageStartedAt()
}

// GetAcquisitionCoverageStartedAt reads the fixed coverage marker.
func GetAcquisitionCoverageStartedAt() (int64, error) {
	var opt Option
	if err := DB.Where(&Option{Key: AcquisitionCoverageStartedAtKey}).First(&opt).Error; err != nil {
		return 0, err
	}
	v, err := strconv.ParseInt(opt.Value, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("acquisition coverage_started_at unparseable: %w", err)
	}
	return v, nil
}

// AcquisitionFunnelFilter is the validated admin funnel query input.
type AcquisitionFunnelFilter struct {
	From        int64
	To          int64
	UtmSource   string
	UtmCampaign string
	Model       string
}

// AcquisitionFunnelResult is the admin funnel aggregate payload. Pointer
// metrics serialize as JSON null when unavailable, errored, or when a rate
// denominator is zero — never as a fake 0.
type AcquisitionFunnelResult struct {
	LandingView                 int                         `json:"landing_view"`
	SignupStarted               int                         `json:"signup_started"`
	SignupCompleted             int                         `json:"signup_completed"`
	ApiKeyCreated               *int                        `json:"api_key_created"`
	FirstApiCallSucceeded       *int                        `json:"first_api_call_succeeded"`
	LandingToSignup             *float64                    `json:"landing_to_signup"`
	SignupToFirstCall           *float64                    `json:"signup_to_first_call"`
	Filters                     AcquisitionFunnelFilterEcho `json:"filters"`
	CoverageStartedAt           int64                       `json:"coverage_started_at"`
	ConsumeLogsEnabled          bool                        `json:"consume_logs_enabled"`
	HistoricalBackfillAvailable bool                        `json:"historical_backfill_available"`
	FromBeforeCoverage          bool                        `json:"from_before_coverage"`
	DataCompleteness            AcquisitionDataCompleteness `json:"data_completeness"`
}

// AcquisitionFunnelFilterEcho echoes the sanitized query filters.
type AcquisitionFunnelFilterEcho struct {
	From        int64  `json:"from"`
	To          int64  `json:"to"`
	UtmSource   string `json:"utm_source"`
	UtmCampaign string `json:"utm_campaign"`
	Model       string `json:"model"`
}

// AcquisitionDataCompleteness reports per-source honesty flags.
type AcquisitionDataCompleteness struct {
	Touches     string `json:"touches"`
	Tokens      string `json:"tokens"`
	ConsumeLogs string `json:"consume_logs"`
}

type completedTouchRow struct {
	Id                int
	UserId            int
	SignupCompletedAt int64
}

// QueryAcquisitionFunnel computes funnel metrics for the half-open window
// [from, to) without any cross-database SQL join: touches and tokens are
// queried on the main DB, consume logs on LOG_DB, and the results are merged
// in application code.
//
// Window stability: every post-landing milestone additionally requires its
// own timestamp < to, so re-querying a fixed historical window never changes
// after later conversions.
//
// Error semantics (design §8.5): a touches query failure aborts the whole
// API; token/log failures only null out their own metrics and set the
// matching data_completeness flag.
func QueryAcquisitionFunnel(filter AcquisitionFunnelFilter) (*AcquisitionFunnelResult, error) {
	coverage, err := GetAcquisitionCoverageStartedAt()
	if err != nil {
		return nil, fmt.Errorf("coverage_started_at unavailable: %w", err)
	}

	result := &AcquisitionFunnelResult{
		Filters: AcquisitionFunnelFilterEcho{
			From:        filter.From,
			To:          filter.To,
			UtmSource:   filter.UtmSource,
			UtmCampaign: filter.UtmCampaign,
			Model:       filter.Model,
		},
		CoverageStartedAt:           coverage,
		ConsumeLogsEnabled:          common.LogConsumeEnabled,
		HistoricalBackfillAvailable: false,
		FromBeforeCoverage:          filter.From < coverage,
		DataCompleteness: AcquisitionDataCompleteness{
			Touches:     acquisitionCompletenessComplete,
			Tokens:      acquisitionCompletenessComplete,
			ConsumeLogs: acquisitionCompletenessComplete,
		},
	}

	baseTouch := func() *gorm.DB {
		q := DB.Model(&AcquisitionTouch{}).
			Where("first_seen_at >= ? AND first_seen_at < ?", filter.From, filter.To)
		if filter.UtmSource != "" {
			q = q.Where("utm_source = ?", filter.UtmSource)
		}
		if filter.UtmCampaign != "" {
			q = q.Where("utm_campaign = ?", filter.UtmCampaign)
		}
		return q
	}

	completedScope := func() *gorm.DB {
		return baseTouch().
			Where("user_id IS NOT NULL").
			Where("signup_completed_at IS NOT NULL AND signup_completed_at < ?", filter.To)
	}

	var landingView int64
	if err := baseTouch().Count(&landingView).Error; err != nil {
		return nil, err
	}
	result.LandingView = int(landingView)

	var signupStarted int64
	err = baseTouch().
		Where("signup_started_at IS NOT NULL AND signup_started_at < ?", filter.To).
		Count(&signupStarted).Error
	if err != nil {
		return nil, err
	}
	result.SignupStarted = int(signupStarted)

	// signup_completed total comes from an independent Count; the rows are
	// never loaded all at once.
	var signupCompleted int64
	if err := completedScope().Count(&signupCompleted).Error; err != nil {
		return nil, err
	}
	result.SignupCompleted = int(signupCompleted)

	if result.LandingView > 0 {
		rate := float64(result.SignupCompleted) / float64(result.LandingView)
		result.LandingToSignup = &rate
	}

	// Data-source availability is decided up front, before any cohort
	// processing: an unavailable source must report error/unavailable even
	// when the cohort is empty.
	logsEnabled := common.LogConsumeEnabled
	logsAvailable := logsEnabled && LOG_DB != nil

	apiKeyCount := 0
	tokensOK := true
	firstCallCount := 0
	logsOK := true

	// Keyset pagination over the completed cohort by acquisition_touches.id:
	// each page allocates at most acquisitionFunnelBatchSize rows, user ids,
	// and lower bounds, so total memory stays O(batch size) no matter how
	// large the 366-day cohort grows. Tokens (main DB) and consume logs
	// (LOG_DB) are queried per page and accumulated separately — never joined
	// across databases. A touch page failure aborts the whole funnel; a
	// token/log page failure only nulls its own dimension while the other
	// keeps accumulating.
	lastID := 0
	for {
		var page []completedTouchRow
		err = completedScope().
			Where("id > ?", lastID).
			Order("id").
			Limit(acquisitionFunnelBatchSize).
			Select("id, user_id, signup_completed_at").
			Find(&page).Error
		if err != nil {
			return nil, err
		}
		if len(page) == 0 {
			break
		}
		lastID = page[len(page)-1].Id

		userIDs := make([]int, 0, len(page))
		completedAt := make(map[int]int64, len(page))
		for _, row := range page {
			userIDs = append(userIDs, row.UserId)
			// Defensive: keep the earliest completion as the log lower bound.
			if prev, ok := completedAt[row.UserId]; !ok || row.SignupCompletedAt < prev {
				completedAt[row.UserId] = row.SignupCompletedAt
			}
		}

		if tokensOK {
			pageKeys, tokensErr := countUsersWithApiKeyBefore(userIDs, filter.To)
			if tokensErr != nil {
				tokensOK = false
				common.SysLog(fmt.Sprintf("acquisition funnel tokens error: %v", tokensErr))
			} else {
				apiKeyCount += pageKeys
			}
		}
		if logsAvailable && logsOK {
			pageCalls, logsErr := countUsersWithFirstConsume(userIDs, completedAt, filter.To, filter.Model)
			if logsErr != nil {
				logsOK = false
				common.SysLog(fmt.Sprintf("acquisition funnel logs error: %v", logsErr))
			} else {
				firstCallCount += pageCalls
			}
		}
	}

	if tokensOK {
		result.ApiKeyCreated = &apiKeyCount
	} else {
		// A failed page means the accumulated prefix is not a complete count;
		// report null instead of a misleading partial number.
		result.ApiKeyCreated = nil
		result.DataCompleteness.Tokens = acquisitionCompletenessError
	}

	switch {
	case !logsEnabled:
		result.FirstApiCallSucceeded = nil
		result.SignupToFirstCall = nil
		result.DataCompleteness.ConsumeLogs = acquisitionCompletenessUnavailable
	case !logsAvailable || !logsOK:
		result.FirstApiCallSucceeded = nil
		result.SignupToFirstCall = nil
		result.DataCompleteness.ConsumeLogs = acquisitionCompletenessError
	default:
		result.FirstApiCallSucceeded = &firstCallCount
		if result.SignupCompleted > 0 {
			rate := float64(firstCallCount) / float64(result.SignupCompleted)
			result.SignupToFirstCall = &rate
		}
	}
	return result, nil
}

// countUsersWithApiKeyBefore counts eligible users whose earliest token
// creation time is < to. Unscoped is mandatory: api_key_created is an
// irreversible historical milestone, so soft-deleted tokens still count.
// Users are processed in acquisitionFunnelBatchSize batches so the IN list
// never approaches a database placeholder limit; any batch failure aborts
// the whole count (no partial result may masquerade as complete).
func countUsersWithApiKeyBefore(userIDs []int, to int64) (int, error) {
	if len(userIDs) == 0 {
		return 0, nil
	}
	type row struct {
		UserId int
		MinTs  int64
	}
	count := 0
	for start := 0; start < len(userIDs); start += acquisitionFunnelBatchSize {
		end := min(start+acquisitionFunnelBatchSize, len(userIDs))
		var rows []row
		err := DB.Unscoped().Model(&Token{}).
			Select("user_id, MIN(created_time) as min_ts").
			Where("user_id IN ?", userIDs[start:end]).
			Group("user_id").
			Find(&rows).Error
		if err != nil {
			return 0, err
		}
		for _, r := range rows {
			if r.MinTs < to {
				count++
			}
		}
	}
	return count, nil
}

// countUsersWithFirstConsume counts eligible users with at least one consume
// log in [signup_completed_at, to) on LOG_DB (exact model_name match when a
// model filter is set). Main DB and LOG_DB are queried separately; merging
// happens in application code.
//
// Users are processed in acquisitionFunnelBatchSize batches. Each batch asks
// the database for the DISTINCT user_id of matching rows, using one fixed
// `(user_id = ? AND created_at >= ?)` pair per user, so the per-user
// signup_completed_at lower bound is enforced in SQL and the database only
// ever returns up to batch-size ids — the matched rows themselves are never
// loaded into memory. Parameter count is bounded at
// 2*acquisitionFunnelBatchSize plus a constant handful. Any batch failure
// aborts the whole count.
func countUsersWithFirstConsume(userIDs []int, completedAt map[int]int64, to int64, modelName string) (int, error) {
	if len(userIDs) == 0 {
		return 0, nil
	}
	if LOG_DB == nil {
		return 0, errors.New("log database unavailable")
	}
	count := 0
	for start := 0; start < len(userIDs); start += acquisitionFunnelBatchSize {
		end := min(start+acquisitionFunnelBatchSize, len(userIDs))
		batch := userIDs[start:end]

		var cond strings.Builder
		args := make([]interface{}, 0, 2*len(batch))
		for i, uid := range batch {
			if i > 0 {
				cond.WriteString(" OR ")
			}
			cond.WriteString("(user_id = ? AND created_at >= ?)")
			args = append(args, uid, completedAt[uid])
		}

		q := LOG_DB.Model(&Log{}).
			Select("DISTINCT user_id").
			Where("type = ?", LogTypeConsume).
			Where("created_at < ?", to).
			Where(cond.String(), args...)
		if modelName != "" {
			q = q.Where("model_name = ?", modelName)
		}
		var ids []int
		if err := q.Pluck("user_id", &ids).Error; err != nil {
			return 0, err
		}
		count += len(ids)
	}
	return count, nil
}
