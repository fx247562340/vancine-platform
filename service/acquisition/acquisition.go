package acquisition

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// IsHTTPSRequest detects HTTPS the same way passkey origin detection does:
// a real TLS connection, or X-Forwarded-Proto / X-Forwarded-Protocol set to
// https by a trusted proxy. Plain local HTTP stays false so development
// without TLS keeps a non-Secure cookie.
func IsHTTPSRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	if r.TLS != nil {
		return true
	}
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		parts := strings.Split(proto, ",")
		if strings.EqualFold(strings.TrimSpace(parts[0]), "https") {
			return true
		}
	}
	if proto := r.Header.Get("X-Forwarded-Protocol"); proto != "" {
		if strings.EqualFold(strings.TrimSpace(proto), "https") {
			return true
		}
	}
	return false
}

// SetTouchCookie writes the signed first-touch cookie: HttpOnly, SameSite=Lax,
// Path=/, host-only (no Domain), 180 days, Secure only over HTTPS. It never
// logs the cookie value.
func SetTouchCookie(c *gin.Context, touchID string) {
	if c == nil || touchID == "" {
		return
	}
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     model.AcquisitionCookieName,
		Value:    model.FormatTouchCookieValue(touchID),
		Path:     "/",
		MaxAge:   model.AcquisitionCookieMaxAge,
		Expires:  time.Now().Add(time.Duration(model.AcquisitionCookieMaxAge) * time.Second),
		HttpOnly: true,
		Secure:   IsHTTPSRequest(c.Request),
		SameSite: http.SameSiteLaxMode,
	})
}

// ReadVerifiedTouchID returns the signature-verified touch_id from the
// request cookie, or "" when the cookie is missing, malformed, or forged.
func ReadVerifiedTouchID(c *gin.Context) string {
	if c == nil || c.Request == nil {
		return ""
	}
	raw, err := c.Cookie(model.AcquisitionCookieName)
	if err != nil || raw == "" {
		return ""
	}
	id, ok := model.ParseAndVerifyTouchCookie(raw)
	if !ok {
		return ""
	}
	return id
}

// TouchResult is the minimal public API data payload. It deliberately echoes
// no UTM values and never exposes the touch_id (the HttpOnly cookie carries
// it), so a compromised page cannot exfiltrate attribution details.
type TouchResult struct {
	Ok           bool `json:"ok"`
	TouchPresent bool `json:"touch_present"`
}

// TouchFields is the controller-facing landing payload for event=landing_view.
// Controllers pass raw request strings; sanitization happens inside the
// model boundary, so controllers never need model types.
type TouchFields struct {
	UtmSource   string
	UtmMedium   string
	UtmCampaign string
	UtmContent  string
	UtmTerm     string
	LandingPath string
}

// RecordLandingView implements event=landing_view, the only path that may
// create a touch row. With a valid existing touch it is an idempotent no-op
// that only refreshes the cookie expiry — the first landing snapshot is
// never mutated. With a signature-valid cookie whose row is gone it mints a
// replacement touch and rotates the cookie. A transient database error is
// distinguished from a missing row: it never creates a row, never rotates
// the cookie, and is returned so first-touch continuity is preserved.
func RecordLandingView(c *gin.Context, fields TouchFields) (TouchResult, error) {
	if touchID := ReadVerifiedTouchID(c); touchID != "" {
		_, err := model.GetAcquisitionTouchByTouchID(touchID)
		if err == nil {
			SetTouchCookie(c, touchID)
			return TouchResult{Ok: true, TouchPresent: true}, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			// Transient lookup failure: keep the existing touch and cookie;
			// minting a replacement here would break first-touch continuity.
			// Log without touch/cookie raw values.
			common.SysLog("acquisition landing_view touch lookup failed")
			return TouchResult{}, err
		}
		// Valid signature but the row is gone: fall through and re-mint.
	}

	touch, err := model.CreateAcquisitionTouch(model.AcquisitionUTMFields{
		UtmSource:   fields.UtmSource,
		UtmMedium:   fields.UtmMedium,
		UtmCampaign: fields.UtmCampaign,
		UtmContent:  fields.UtmContent,
		UtmTerm:     fields.UtmTerm,
		LandingPath: fields.LandingPath,
	})
	if err != nil {
		common.SysLog("acquisition landing_view create failed")
		return TouchResult{}, err
	}
	SetTouchCookie(c, touch.TouchId)
	return TouchResult{Ok: true, TouchPresent: true}, nil
}

// MarkSignupStarted implements event=signup_started. It never creates rows:
// without a valid cookie/touch it returns a soft success so the register
// page is never disturbed. With a valid touch it sets signup_started_at at
// most once.
func MarkSignupStarted(c *gin.Context) TouchResult {
	touchID := ReadVerifiedTouchID(c)
	if touchID == "" {
		return TouchResult{Ok: true, TouchPresent: false}
	}
	present, err := model.MarkAcquisitionSignupStarted(touchID)
	if err != nil {
		// Attribution absence is acceptable; forged funnel rows are not.
		common.SysLog("acquisition signup_started update failed")
		return TouchResult{Ok: true, TouchPresent: false}
	}
	return TouchResult{Ok: true, TouchPresent: present}
}

// BindTouchToUser binds the cookie touch to a user that was just created by
// a server-side registration path (password, OAuth, WeChat). It must only be
// called after durable account provisioning succeeded, and it always
// soft-fails: a missing cookie, an invalid cookie, or any attribution DB
// problem never breaks the registration or login itself.
func BindTouchToUser(c *gin.Context, userID int) {
	if userID <= 0 {
		return
	}
	touchID := ReadVerifiedTouchID(c)
	if touchID == "" {
		return
	}
	model.BindAcquisitionTouchToUser(touchID, userID)
}

// FunnelQuery is the validated admin funnel request as handed over by
// controllers: parsed time bounds plus raw filter strings. UTM sanitization
// and model-filter normalization belong to this business boundary, so
// controllers never construct model types.
type FunnelQuery struct {
	From        int64
	To          int64
	UtmSource   string
	UtmCampaign string
	Model       string
}

// GetFunnel runs the admin acquisition funnel report for a validated query.
// A returned error means the whole report is unavailable and must surface as
// an API failure; partial honesty for token/log outages is encoded in the
// result's data_completeness instead.
func GetFunnel(q FunnelQuery) (*model.AcquisitionFunnelResult, error) {
	clean := model.SanitizeUTMFields(model.AcquisitionUTMFields{
		UtmSource:   q.UtmSource,
		UtmCampaign: q.UtmCampaign,
	})
	return model.QueryAcquisitionFunnel(model.AcquisitionFunnelFilter{
		From:        q.From,
		To:          q.To,
		UtmSource:   clean.UtmSource,
		UtmCampaign: clean.UtmCampaign,
		Model:       strings.TrimSpace(q.Model),
	})
}
