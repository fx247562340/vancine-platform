package middleware

import (
	"bytes"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	// CapturedResponseBodyKey is the gin context key for the captured response body.
	CapturedResponseBodyKey = "captured_response_body"
	// maxCaptureSize is the maximum response body size to capture (10KB).
	maxCaptureSize = 10 * 1024
)

// captureWriter wraps gin.ResponseWriter to capture the response body.
type captureWriter struct {
	gin.ResponseWriter
	buf bytes.Buffer
}

func (w *captureWriter) Write(b []byte) (int, error) {
	if w.buf.Len() < maxCaptureSize {
		remaining := maxCaptureSize - w.buf.Len()
		if len(b) > remaining {
			w.buf.Write(b[:remaining])
		} else {
			w.buf.Write(b)
		}
	}
	return w.ResponseWriter.Write(b)
}

// ResponseCaptureMiddleware captures the response body for API relay requests
// and stores it in the gin context for later use in logging.
func ResponseCaptureMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only capture for API relay paths
		path := c.Request.URL.Path
		if !strings.HasPrefix(path, "/v1/") {
			c.Next()
			return
		}

		// Skip SSE streaming responses (they can be very large)
		// We still capture the final usage data for streaming via other mechanisms
		isStream := false
		if c.Request.Header.Get("Accept") == "text/event-stream" {
			isStream = true
		}

		if isStream {
			c.Next()
			return
		}

		cw := &captureWriter{ResponseWriter: c.Writer}
		c.Writer = cw
		c.Next()

		// Store captured response body in context
		if cw.buf.Len() > 0 {
			body := cw.buf.String()
			c.Set(CapturedResponseBodyKey, body)
		}
	}
}
