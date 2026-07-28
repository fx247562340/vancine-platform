package acquisition

import (
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// IsHTTPSRequest mirrors passkey origin detection: TLS, X-Forwarded-Proto=https,
// or X-Forwarded-Protocol=https.
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
	if r.URL != nil && strings.EqualFold(r.URL.Scheme, "https") {
		return true
	}
	return false
}

// SetTouchCookie writes the signed HttpOnly first-touch cookie.
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

// ReadVerifiedTouchID returns the verified touch_id from cookie, or empty if missing/invalid.
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

// TouchResult is the minimal public API data payload.
type TouchResult struct {
	Ok           bool `json:"ok"`
	TouchPresent bool `json:"touch_present"`
}

// RecordLandingView creates a first landing snapshot when no valid touch exists,
// or is an idempotent no-op (may refresh cookie expiry) when one does.
// Never mutates UTM/landing_path on existing rows.
func RecordLandingView(c *gin.Context, fields model.AcquisitionUTMFields) (TouchResult, error) {
	if touchID := ReadVerifiedTouchID(c); touchID != "" {
		if _, err := model.GetAcquisitionTouchByTouchID(touchID); err == nil {
			// Refresh cookie expiry; do not mutate snapshot.
			SetTouchCookie(c, touchID)
			return TouchResult{Ok: true, TouchPresent: true}, nil
		}
		// Valid sig but missing row → mint replacement below.
	}

	touch, err := model.CreateAcquisitionTouch(fields)
	if err != nil {
		common.SysLog("acquisition landing_view create failed")
		return TouchResult{}, err
	}
	SetTouchCookie(c, touch.TouchId)
	return TouchResult{Ok: true, TouchPresent: true}, nil
}

// MarkSignupStarted never creates rows. Soft success when cookie/touch missing.
func MarkSignupStarted(c *gin.Context) TouchResult {
	touchID := ReadVerifiedTouchID(c)
	if touchID == "" {
		return TouchResult{Ok: true, TouchPresent: false}
	}
	present, err := model.MarkAcquisitionSignupStarted(touchID)
	if err != nil {
		// Prefer soft success for client UX; attribution absence is acceptable.
		common.SysLog("acquisition signup_started update failed")
		return TouchResult{Ok: true, TouchPresent: false}
	}
	return TouchResult{Ok: true, TouchPresent: present}
}

// BindTouchToUser binds the cookie touch to a newly created user. Soft-fail only.
func BindTouchToUser(c *gin.Context, userID int) {
	if userID <= 0 {
		return
	}
	touchID := ReadVerifiedTouchID(c)
	if touchID == "" {
		return
	}
	_ = model.BindAcquisitionTouchToUser(touchID, userID)
}
