package controller

import (
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

var piCatalogUnavailableBody = []byte(`{"error":"catalog unavailable"}`)

// GetPiCatalog serves GET /api/pi/catalog as public JSON. It does not require
// login, cookies, or an API key, and it never wraps the Pi catalog schema in
// the dashboard success/data envelope.
func GetPiCatalog(c *gin.Context) {
	snapshot, err := service.SnapshotPiCatalog()
	if err != nil || snapshot == nil {
		c.Header("Cache-Control", "no-store")
		c.Data(http.StatusInternalServerError, "application/json", piCatalogUnavailableBody)
		return
	}

	c.Header("ETag", snapshot.ETag)
	c.Header("Last-Modified", snapshot.LastModified.UTC().Format(http.TimeFormat))
	c.Header("Cache-Control", snapshot.CacheControl)

	if piCatalogNotModified(c.GetHeader("If-None-Match"), c.GetHeader("If-Modified-Since"), snapshot) {
		c.AbortWithStatus(http.StatusNotModified)
		return
	}

	c.Data(http.StatusOK, snapshot.ContentType, snapshot.Body)
}

func piCatalogNotModified(ifNoneMatch, ifModifiedSince string, snapshot *service.PiCatalogSnapshot) bool {
	if snapshot == nil {
		return false
	}
	if strings.TrimSpace(ifNoneMatch) != "" {
		return piCatalogETagMatches(ifNoneMatch, snapshot.ETag)
	}
	return piCatalogModifiedSinceMatches(ifModifiedSince, snapshot.LastModified)
}

func piCatalogETagMatches(header, etag string) bool {
	current := normalizePiCatalogETag(etag)
	if current == "" {
		return false
	}
	for _, part := range strings.Split(header, ",") {
		part = strings.TrimSpace(part)
		if part == "*" {
			return true
		}
		if normalizePiCatalogETag(part) == current {
			return true
		}
	}
	return false
}

func normalizePiCatalogETag(value string) string {
	value = strings.TrimSpace(value)
	if len(value) >= 2 && (strings.HasPrefix(value, "W/") || strings.HasPrefix(value, "w/")) {
		value = strings.TrimSpace(value[2:])
	}
	return strings.Trim(value, `"`)
}

func piCatalogModifiedSinceMatches(header string, lastModified time.Time) bool {
	if strings.TrimSpace(header) == "" {
		return false
	}
	since, err := http.ParseTime(header)
	if err != nil {
		return false
	}
	return !lastModified.UTC().Truncate(time.Second).After(since)
}
