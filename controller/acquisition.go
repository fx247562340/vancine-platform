package controller

import (
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service/acquisition"
	"github.com/gin-gonic/gin"
)

// acquisitionFunnelMaxSpanSeconds caps one funnel query at 366 days.
const acquisitionFunnelMaxSpanSeconds = 366 * 24 * 60 * 60

type acquisitionTouchRequest struct {
	Event       string `json:"event"`
	UtmSource   string `json:"utm_source"`
	UtmMedium   string `json:"utm_medium"`
	UtmCampaign string `json:"utm_campaign"`
	UtmContent  string `json:"utm_content"`
	UtmTerm     string `json:"utm_term"`
	LandingPath string `json:"landing_path"`
}

// PostAcquisitionTouch handles POST /api/acquisition/touch (public,
// CriticalRateLimit + anonymous body limit). Only landing_view may create a
// touch; signup_started is a no-create milestone; signup_completed is
// server-side only and rejected from clients. The controller only decodes
// HTTP input; sanitization and persistence live behind the service layer.
func PostAcquisitionTouch(c *gin.Context) {
	var req acquisitionTouchRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request")
		return
	}

	switch strings.TrimSpace(req.Event) {
	case "landing_view":
		result, err := acquisition.RecordLandingView(c, acquisition.TouchFields{
			UtmSource:   req.UtmSource,
			UtmMedium:   req.UtmMedium,
			UtmCampaign: req.UtmCampaign,
			UtmContent:  req.UtmContent,
			UtmTerm:     req.UtmTerm,
			LandingPath: req.LandingPath,
		})
		if err != nil {
			common.ApiErrorMsg(c, "failed to record touch")
			return
		}
		common.ApiSuccess(c, result)
	case "signup_started":
		common.ApiSuccess(c, acquisition.MarkSignupStarted(c))
	default:
		// signup_completed is never accepted from clients; unknown or empty
		// events are rejected the same generic way.
		common.ApiErrorMsg(c, "invalid event")
	}
}

// GetAcquisitionFunnel handles GET /api/acquisition/funnel (AdminAuth). It
// returns aggregate counts only — never user ids, touch ids, or PII. The
// controller only parses and validates HTTP input; filter sanitization and
// the funnel report itself belong to the service layer.
func GetAcquisitionFunnel(c *gin.Context) {
	fromRaw := strings.TrimSpace(c.Query("from"))
	toRaw := strings.TrimSpace(c.Query("to"))
	if fromRaw == "" || toRaw == "" {
		common.ApiErrorMsg(c, "from and to are required")
		return
	}
	from, err := parseAcquisitionFunnelTime(fromRaw)
	if err != nil {
		common.ApiErrorMsg(c, "invalid from")
		return
	}
	to, err := parseAcquisitionFunnelTime(toRaw)
	if err != nil {
		common.ApiErrorMsg(c, "invalid to")
		return
	}
	if from >= to {
		common.ApiErrorMsg(c, "from must be less than to")
		return
	}
	// Overflow-safe span check: with from < to already established, to-from
	// overflows a signed int64 exactly when from < 0 and the true span
	// exceeds math.MaxInt64, i.e. to > math.MaxInt64+from. Such a span is
	// always far beyond the allowed window. Any representable span is then
	// compared normally (exactly 366 days stays allowed).
	if (from < 0 && to > math.MaxInt64+from) || to-from > acquisitionFunnelMaxSpanSeconds {
		common.ApiErrorMsg(c, "range too large")
		return
	}

	result, err := acquisition.GetFunnel(acquisition.FunnelQuery{
		From:        from,
		To:          to,
		UtmSource:   c.Query("utm_source"),
		UtmCampaign: c.Query("utm_campaign"),
		Model:       c.Query("model"),
	})
	if err != nil {
		common.ApiErrorMsg(c, "funnel unavailable")
		common.SysLog("acquisition funnel error: " + err.Error())
		return
	}
	common.ApiSuccess(c, result)
}

// parseAcquisitionFunnelTime accepts Unix seconds or a YYYY-MM-DD date
// interpreted as UTC day start.
func parseAcquisitionFunnelTime(raw string) (int64, error) {
	if v, err := strconv.ParseInt(raw, 10, 64); err == nil {
		return v, nil
	}
	t, err := time.Parse("2006-01-02", raw)
	if err != nil {
		return 0, err
	}
	return t.Unix(), nil
}
