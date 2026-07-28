package controller

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/acquisition"
	"github.com/gin-gonic/gin"
)

type acquisitionTouchRequest struct {
	Event       string `json:"event"`
	UtmSource   string `json:"utm_source"`
	UtmMedium   string `json:"utm_medium"`
	UtmCampaign string `json:"utm_campaign"`
	UtmContent  string `json:"utm_content"`
	UtmTerm     string `json:"utm_term"`
	LandingPath string `json:"landing_path"`
}

// PostAcquisitionTouch handles POST /api/acquisition/touch (public, CriticalRateLimit).
func PostAcquisitionTouch(c *gin.Context) {
	var req acquisitionTouchRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request")
		return
	}

	switch strings.TrimSpace(req.Event) {
	case "landing_view":
		fields := model.AcquisitionUTMFields{
			UtmSource:   req.UtmSource,
			UtmMedium:   req.UtmMedium,
			UtmCampaign: req.UtmCampaign,
			UtmContent:  req.UtmContent,
			UtmTerm:     req.UtmTerm,
			LandingPath: req.LandingPath,
		}
		result, err := acquisition.RecordLandingView(c, fields)
		if err != nil {
			common.ApiErrorMsg(c, "failed to record touch")
			return
		}
		common.ApiSuccess(c, result)
		return

	case "signup_started":
		// Never creates a touch; soft success when cookie/touch missing.
		result := acquisition.MarkSignupStarted(c)
		common.ApiSuccess(c, result)
		return

	case "signup_completed":
		// Client must not submit this event; bind is server-side only.
		common.ApiErrorMsg(c, "invalid event")
		return

	default:
		common.ApiErrorMsg(c, "invalid event")
		return
	}
}

// GetAcquisitionFunnel handles GET /api/acquisition/funnel (AdminAuth).
func GetAcquisitionFunnel(c *gin.Context) {
	fromRaw := strings.TrimSpace(c.Query("from"))
	toRaw := strings.TrimSpace(c.Query("to"))
	if fromRaw == "" || toRaw == "" {
		common.ApiErrorMsg(c, "from and to are required")
		return
	}

	from, err := parseFunnelTime(fromRaw)
	if err != nil {
		common.ApiErrorMsg(c, "invalid from")
		return
	}
	to, err := parseFunnelTime(toRaw)
	if err != nil {
		common.ApiErrorMsg(c, "invalid to")
		return
	}
	if from >= to {
		common.ApiErrorMsg(c, "from must be less than to")
		return
	}
	// Max span 366 days.
	if to-from > 366*24*60*60 {
		common.ApiErrorMsg(c, "range too large")
		return
	}

	filter := model.AcquisitionFunnelFilter{
		From:        from,
		To:          to,
		UtmSource:   model.SanitizeUTMValue(c.Query("utm_source"), 64),
		UtmCampaign: model.SanitizeUTMValue(c.Query("utm_campaign"), 128),
		Model:       strings.TrimSpace(c.Query("model")),
	}

	result, err := model.QueryAcquisitionFunnel(filter)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func parseFunnelTime(raw string) (int64, error) {
	// Unix seconds
	if v, err := strconv.ParseInt(raw, 10, 64); err == nil {
		return v, nil
	}
	// YYYY-MM-DD → UTC day start
	t, err := time.Parse("2006-01-02", raw)
	if err != nil {
		return 0, err
	}
	return t.UTC().Unix(), nil
}

// Ensure unused import guard if http is needed by tests via this package.
var _ = http.StatusOK
