package model

import (
	"crypto/subtle"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	// AcquisitionCoverageStartedAtKey is the options key for first-party attribution coverage start.
	AcquisitionCoverageStartedAtKey = "acquisition.coverage_started_at"
	// AcquisitionCookieName is the signed first-touch cookie name.
	AcquisitionCookieName = "vancine_ft"
	// AcquisitionCookieMaxAge is 180 days in seconds.
	AcquisitionCookieMaxAge = 15552000
)

var (
	touchIDPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)
	utmAllowChars  = regexp.MustCompile(`[^A-Za-z0-9._%-]+`)
)

// AcquisitionTouch stores an immutable first-landing snapshot and funnel milestones.
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

// SanitizeUTMValue applies design §7.2 order exactly:
// 1) Trim whitespace
// 2) UTF-8 valid + strip control chars (U+0000–U+001F, U+007F)
// 3) Hard-truncate to maxLen (byte-safe for remaining UTF-8)
// 4) Collapse whitespace runs to single "_"; drop chars outside [A-Za-z0-9._%-]
// Empty after sanitize → "".
func SanitizeUTMValue(raw string, maxLen int) string {
	if raw == "" {
		return ""
	}
	// 1. Trim whitespace first (design §7.2 step 1).
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	// 2. UTF-8 valid; strip control characters.
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
	// 3. Hard-truncate at maxLen AFTER trim/control strip, BEFORE allowlist clean.
	// Use rune-aware cut so multi-byte UTF-8 is not split mid-codepoint.
	if maxLen > 0 {
		s = truncateUTF8(s, maxLen)
	}
	if s == "" {
		return ""
	}
	// 4. Whitespace → "_"; drop non-allowlist chars. Result is ASCII-only.
	parts := strings.Fields(s)
	s = strings.Join(parts, "_")
	s = utmAllowChars.ReplaceAllString(s, "")
	return s
}

// truncateUTF8 returns the longest valid UTF-8 prefix of s with byte length <= maxBytes.
func truncateUTF8(s string, maxBytes int) string {
	if maxBytes <= 0 {
		return ""
	}
	if len(s) <= maxBytes {
		return s
	}
	// Walk runes so we never cut mid-codepoint.
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

// SanitizeLandingPath validates a site-relative path. Invalid input becomes "".
func SanitizeLandingPath(raw string) string {
	if raw == "" {
		return ""
	}
	if !utf8.ValidString(raw) {
		raw = strings.ToValidUTF8(raw, "")
	}
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	// Strip query/fragment.
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
	// Collapse duplicate slashes.
	for strings.Contains(s, "//") {
		s = strings.ReplaceAll(s, "//", "/")
	}
	if len(s) > 255 {
		s = s[:255]
	}
	return s
}

// SanitizeUTMFields sanitizes a full UTM + path payload.
func SanitizeUTMFields(in AcquisitionUTMFields) AcquisitionUTMFields {
	return AcquisitionUTMFields{
		UtmSource:   SanitizeUTMValue(in.UtmSource, 64),
		UtmMedium:   SanitizeUTMValue(in.UtmMedium, 64),
		UtmCampaign: SanitizeUTMValue(in.UtmCampaign, 128),
		UtmContent:  SanitizeUTMValue(in.UtmContent, 128),
		UtmTerm:     SanitizeUTMValue(in.UtmTerm, 128),
		LandingPath: SanitizeLandingPath(in.LandingPath),
	}
}

// SignTouchID returns hex(HMAC_SHA256(CryptoSecret, touchID)).
func SignTouchID(touchID string) string {
	return common.GenerateHMAC(touchID)
}

// FormatTouchCookieValue builds "<touch_id>.<hmac_hex>".
func FormatTouchCookieValue(touchID string) string {
	return touchID + "." + SignTouchID(touchID)
}

// ParseAndVerifyTouchCookie parses and constant-time verifies the cookie value.
// Returns touchID and true only when format, charset, and signature are valid.
func ParseAndVerifyTouchCookie(raw string) (string, bool) {
	if raw == "" {
		return "", false
	}
	// Exactly one '.' separator expected between id and sig.
	dot := strings.IndexByte(raw, '.')
	if dot <= 0 || dot != strings.LastIndexByte(raw, '.') {
		return "", false
	}
	touchID := raw[:dot]
	sig := raw[dot+1:]
	if !touchIDPattern.MatchString(touchID) {
		return "", false
	}
	expected := SignTouchID(touchID)
	if subtle.ConstantTimeCompare([]byte(sig), []byte(expected)) != 1 {
		return "", false
	}
	return touchID, true
}

// CreateAcquisitionTouch inserts a new first-landing snapshot row.
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

// GetAcquisitionTouchByTouchID loads a touch by public touch_id.
func GetAcquisitionTouchByTouchID(touchID string) (*AcquisitionTouch, error) {
	if !touchIDPattern.MatchString(touchID) {
		return nil, gorm.ErrRecordNotFound
	}
	var touch AcquisitionTouch
	err := DB.Where("touch_id = ?", touchID).First(&touch).Error
	if err != nil {
		return nil, err
	}
	return &touch, nil
}

// MarkAcquisitionSignupStarted sets signup_started_at once when currently null.
// Returns (touchPresent, error). Missing row is not an error — caller treats as soft no-op.
func MarkAcquisitionSignupStarted(touchID string) (bool, error) {
	touch, err := GetAcquisitionTouchByTouchID(touchID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	if touch.SignupStartedAt != nil {
		return true, nil
	}
	now := common.GetTimestamp()
	res := DB.Model(&AcquisitionTouch{}).
		Where("id = ? AND signup_started_at IS NULL", touch.Id).
		Updates(map[string]interface{}{
			"signup_started_at": now,
			"updated_at":        now,
		})
	if res.Error != nil {
		return true, res.Error
	}
	return true, nil
}

// BindAcquisitionTouchToUser binds a valid touch to a newly created user exactly once.
// Soft-fails on missing/invalid touch; never blocks registration.
func BindAcquisitionTouchToUser(touchID string, userID int) error {
	if userID <= 0 || !touchIDPattern.MatchString(touchID) {
		return nil
	}
	touch, err := GetAcquisitionTouchByTouchID(touchID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		common.SysLog(fmt.Sprintf("acquisition bind load error: %v", err))
		return nil
	}

	// Already bound to this user — ensure completed timestamp with set-if-null only.
	// Concurrent binds must not overwrite an already-written first completion time.
	if touch.UserId != nil && *touch.UserId == userID {
		if touch.SignupCompletedAt == nil {
			now := common.GetTimestamp()
			_ = DB.Model(&AcquisitionTouch{}).
				Where("id = ? AND signup_completed_at IS NULL", touch.Id).
				Updates(map[string]interface{}{
					"signup_completed_at": now,
					"updated_at":          now,
				}).Error
		}
		// Also fill signup_started_at if still null (set-if-null).
		if touch.SignupStartedAt == nil {
			now := common.GetTimestamp()
			_ = DB.Model(&AcquisitionTouch{}).
				Where("id = ? AND signup_started_at IS NULL", touch.Id).
				Updates(map[string]interface{}{
					"signup_started_at": now,
					"updated_at":        now,
				}).Error
		}
		return nil
	}
	// Bound to a different user — do not rebind.
	if touch.UserId != nil {
		common.SysLog("acquisition bind skipped: touch already bound to another user")
		return nil
	}

	// Another touch already owns this user — leave both; prefer earlier bind.
	var existing int64
	if err := DB.Model(&AcquisitionTouch{}).Where("user_id = ?", userID).Count(&existing).Error; err != nil {
		common.SysLog(fmt.Sprintf("acquisition bind user-check error: %v", err))
		return nil
	}
	if existing > 0 {
		return nil
	}

	now := common.GetTimestamp()
	updates := map[string]interface{}{
		"user_id":             userID,
		"signup_completed_at": now,
		"updated_at":          now,
	}
	// OAuth may skip client signup_started — fill if still null.
	if touch.SignupStartedAt == nil {
		updates["signup_started_at"] = now
	}

	res := DB.Model(&AcquisitionTouch{}).
		Where("id = ? AND user_id IS NULL", touch.Id).
		Updates(updates)
	if res.Error != nil {
		// Unique race on user_id: treat same-user as success.
		if isUniqueViolation(res.Error) {
			return nil
		}
		common.SysLog(fmt.Sprintf("acquisition bind update error: %v", res.Error))
		return nil
	}
	return nil
}

func isUniqueViolation(err error) bool {
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

// EnsureAcquisitionCoverageStartedAt performs insert-if-absent for coverage marker.
// Never overwrites an existing value. Returns the stored value.
// Non-already-exists DB errors are returned to the caller (migrate must fail).
func EnsureAcquisitionCoverageStartedAt() (int64, error) {
	// Fast path: already present. Use struct field query (cross-DB; no raw key col).
	var existing Option
	err := DB.Where(&Option{Key: AcquisitionCoverageStartedAtKey}).First(&existing).Error
	if err == nil {
		v, parseErr := strconv.ParseInt(existing.Value, 10, 64)
		if parseErr != nil {
			return 0, fmt.Errorf("acquisition coverage_started_at unparseable: %w", parseErr)
		}
		return v, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, err
	}

	now := common.GetTimestamp()
	opt := Option{
		Key:   AcquisitionCoverageStartedAtKey,
		Value: strconv.FormatInt(now, 10),
	}
	// Insert-if-absent: DoNothing on conflict so we never overwrite.
	createErr := DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoNothing: true,
	}).Create(&opt).Error
	if createErr != nil {
		// Some drivers surface unique as error even with DoNothing; treat as already-exists.
		if !isUniqueViolation(createErr) {
			return 0, createErr
		}
	}

	// Re-read authoritative value (ours or a concurrent winner).
	var stored Option
	if err := DB.Where(&Option{Key: AcquisitionCoverageStartedAtKey}).First(&stored).Error; err != nil {
		return 0, err
	}
	v, parseErr := strconv.ParseInt(stored.Value, 10, 64)
	if parseErr != nil {
		return 0, fmt.Errorf("acquisition coverage_started_at unparseable after insert: %w", parseErr)
	}
	return v, nil
}

// GetAcquisitionCoverageStartedAt reads the fixed coverage marker.
func GetAcquisitionCoverageStartedAt() (int64, error) {
	var opt Option
	err := DB.Where(&Option{Key: AcquisitionCoverageStartedAtKey}).First(&opt).Error
	if err != nil {
		return 0, err
	}
	return strconv.ParseInt(opt.Value, 10, 64)
}

// AcquisitionFunnelFilter is the admin funnel query input after validation.
type AcquisitionFunnelFilter struct {
	From        int64
	To          int64
	UtmSource   string
	UtmCampaign string
	Model       string
}

// AcquisitionFunnelResult is the admin funnel aggregate payload.
// Pointer metrics serialize as JSON null when unavailable/errored/zero-denominator rates.
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

// AcquisitionFunnelFilterEcho echoes sanitized filters.
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
	UserId            int
	SignupCompletedAt int64
}

// QueryAcquisitionFunnel computes funnel metrics without cross-DB JOINs.
// Touches query failure returns error (entire API fails).
// Token/log failures null out only their metrics and set completeness flags.
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
			Touches:     "complete",
			Tokens:      "complete",
			ConsumeLogs: "complete",
		},
	}

	// --- touches cohort ---
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

	var landingView int64
	if err := baseTouch().Count(&landingView).Error; err != nil {
		return nil, err
	}
	result.LandingView = int(landingView)

	var signupStarted int64
	if err := baseTouch().
		Where("signup_started_at IS NOT NULL AND signup_started_at < ?", filter.To).
		Count(&signupStarted).Error; err != nil {
		return nil, err
	}
	result.SignupStarted = int(signupStarted)

	var completed []completedTouchRow
	if err := baseTouch().
		Where("user_id IS NOT NULL").
		Where("signup_completed_at IS NOT NULL AND signup_completed_at < ?", filter.To).
		Select("user_id, signup_completed_at").
		Find(&completed).Error; err != nil {
		return nil, err
	}
	result.SignupCompleted = len(completed)

	if result.LandingView > 0 {
		rate := float64(result.SignupCompleted) / float64(result.LandingView)
		result.LandingToSignup = &rate
	}

	userIDs := make([]int, 0, len(completed))
	completedAtByUser := make(map[int]int64, len(completed))
	for _, row := range completed {
		userIDs = append(userIDs, row.UserId)
		// If multiple rows somehow exist, keep earliest completed_at for log lower bound.
		if prev, ok := completedAtByUser[row.UserId]; !ok || row.SignupCompletedAt < prev {
			completedAtByUser[row.UserId] = row.SignupCompletedAt
		}
	}

	// --- tokens (Unscoped earliest created_time) ---
	apiKeyCount, tokensErr := countUsersWithApiKeyBefore(userIDs, filter.To)
	if tokensErr != nil {
		result.ApiKeyCreated = nil
		result.DataCompleteness.Tokens = "error"
		common.SysLog(fmt.Sprintf("acquisition funnel tokens error: %v", tokensErr))
	} else {
		result.ApiKeyCreated = &apiKeyCount
	}

	// --- consume logs ---
	if !common.LogConsumeEnabled {
		result.FirstApiCallSucceeded = nil
		result.SignupToFirstCall = nil
		result.DataCompleteness.ConsumeLogs = "unavailable"
	} else {
		firstCall, logsErr := countUsersWithFirstConsume(userIDs, completedAtByUser, filter.To, filter.Model)
		if logsErr != nil {
			result.FirstApiCallSucceeded = nil
			result.SignupToFirstCall = nil
			result.DataCompleteness.ConsumeLogs = "error"
			common.SysLog(fmt.Sprintf("acquisition funnel logs error: %v", logsErr))
		} else {
			result.FirstApiCallSucceeded = &firstCall
			if result.SignupCompleted > 0 {
				rate := float64(firstCall) / float64(result.SignupCompleted)
				result.SignupToFirstCall = &rate
			}
		}
	}

	return result, nil
}

func countUsersWithApiKeyBefore(userIDs []int, to int64) (int, error) {
	if len(userIDs) == 0 {
		return 0, nil
	}
	// Earliest created_time per user via Unscoped (includes soft-deleted).
	type row struct {
		UserId int
		MinTs  int64
	}
	var rows []row
	err := DB.Unscoped().Model(&Token{}).
		Select("user_id, MIN(created_time) as min_ts").
		Where("user_id IN ?", userIDs).
		Group("user_id").
		Find(&rows).Error
	if err != nil {
		return 0, err
	}
	count := 0
	for _, r := range rows {
		if r.MinTs < to {
			count++
		}
	}
	return count, nil
}

func countUsersWithFirstConsume(userIDs []int, completedAt map[int]int64, to int64, modelName string) (int, error) {
	if len(userIDs) == 0 {
		return 0, nil
	}
	if LOG_DB == nil {
		return 0, errors.New("log database unavailable")
	}

	// Query distinct user_ids that have at least one qualifying consume log.
	// Per-user lower bound differs (signup_completed_at), so iterate in batches
	// with a single IN query first, then filter in application code.
	type logRow struct {
		UserId    int
		CreatedAt int64
	}
	q := LOG_DB.Model(&Log{}).
		Select("user_id, created_at").
		Where("type = ?", LogTypeConsume).
		Where("user_id IN ?", userIDs).
		Where("created_at < ?", to)
	if modelName != "" {
		q = q.Where("model_name = ?", modelName)
	}
	var logs []logRow
	if err := q.Find(&logs).Error; err != nil {
		return 0, err
	}

	matched := make(map[int]struct{})
	for _, l := range logs {
		lower, ok := completedAt[l.UserId]
		if !ok {
			continue
		}
		if l.CreatedAt >= lower && l.CreatedAt < to {
			matched[l.UserId] = struct{}{}
		}
	}
	return len(matched), nil
}

// TouchIDValid reports whether s matches the 32-char hex touch id charset.
func TouchIDValid(s string) bool {
	return touchIDPattern.MatchString(s)
}

// AcquisitionNow is exposed for tests that need deterministic timestamps.
func AcquisitionNow() int64 {
	return time.Now().Unix()
}
