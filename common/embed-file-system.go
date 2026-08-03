package common

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"strings"

	"github.com/gin-contrib/static"
)

// Credit: https://github.com/gin-contrib/static/issues/19

type embedFileSystem struct {
	http.FileSystem
}

func (e *embedFileSystem) Exists(prefix string, path string) bool {
	_, err := e.Open(path)
	if err != nil {
		return false
	}
	return true
}

func (e *embedFileSystem) Open(name string) (http.File, error) {
	if name == "/" {
		// This will make sure the index page goes to NoRouter handler,
		// which will use the replaced index bytes with analytic codes.
		return nil, os.ErrNotExist
	}
	return e.FileSystem.Open(name)
}

func EmbedFolder(fsEmbed embed.FS, targetPath string) static.ServeFileSystem {
	efs, err := fs.Sub(fsEmbed, targetPath)
	if err != nil {
		panic(err)
	}
	return &embedFileSystem{
		FileSystem: http.FS(efs),
	}
}

// themeAwareFileSystem delegates to the appropriate embedded FS based on
// the current theme (via GetTheme). This enables runtime theme switching
// without restarting the server.
//
// For content-hashed build asset paths, it falls back to the inactive
// theme when a file is not found in the active theme. This prevents a
// loaded page from losing its lazy-loaded chunks when an admin switches
// the theme at runtime: the browser still holds references to the old
// theme's hashed asset filenames, and without fallback those requests
// would hit the SPA index.html (a broken JS module) instead of the
// correct file.
//
// Cross-theme fallback is restricted to known build-asset namespaces:
//   - /assets/* (Vite output, used by Classic)
//   - /static/* (Rsbuild output, used by Default)
//
// Fallback is NOT applied to:
//   - Root "/" (handled by NoRoute for SPA routing)
//   - HTML documents in any casing (.html, .htm, .HTML, .HTM)
//   - Extensionless SPA routes (/console, /docs, etc.)
//   - Any path outside the two asset namespaces
//
// Known TOCTOU limitation: Exists() and Open() each call GetTheme()
// independently. If the theme is toggled between the two calls within
// a single HTTP request, Exists may report true for one theme while
// Open resolves from the other. For content-hashed asset paths this
// is acceptable in practice — the files have unique names per build
// and cannot collide across themes — but we do not claim the mechanism
// is fully race-free for arbitrary paths.
type themeAwareFileSystem struct {
	defaultFS static.ServeFileSystem
	classicFS static.ServeFileSystem
}

// isStaticAssetPath returns true only for paths within the known
// build-asset namespaces used by the two embedded frontends:
//   - /assets/* (Vite output — Classic)
//   - /static/* (Rsbuild output — Default)
//
// This is intentionally narrow. It excludes root-level files,
// extensionless SPA routes, HTML documents, and any path outside
// these two namespaces.
func isStaticAssetPath(name string) bool {
	if name == "" || name == "/" {
		return false
	}
	// Exclude HTML documents in any casing
	lower := strings.ToLower(name)
	if strings.HasSuffix(lower, ".html") || strings.HasSuffix(lower, ".htm") {
		return false
	}
	// Only allow known build-asset namespace prefixes
	return strings.HasPrefix(name, "/assets/") || strings.HasPrefix(name, "/static/")
}

// IsAssetNotFoundPath returns true when the request URI belongs to a
// known namespace that should return a 404 (not SPA index) when the
// resource is not found. Used by the NoRoute handler.
//
// Matches are segment-aware: the prefix must be followed by "/", "?",
// or end-of-string. This prevents false positives like "/v10", "/apiary",
// "/assets-old", or "/static-page" which are ordinary SPA routes.
func IsAssetNotFoundPath(requestURI string) bool {
	// Strip query string for path matching
	path := requestURI
	if idx := strings.IndexByte(path, '?'); idx >= 0 {
		path = path[:idx]
	}
	return matchesSegment(path, "/v1") ||
		matchesSegment(path, "/api") ||
		matchesSegment(path, "/assets") ||
		matchesSegment(path, "/static")
}

// matchesSegment returns true when path equals prefix exactly or is
// prefix followed by "/". This ensures segment-boundary matching:
// "/v1" matches, "/v1/foo" matches, but "/v10" does not.
func matchesSegment(path, prefix string) bool {
	if path == prefix {
		return true
	}
	if len(path) > len(prefix) && path[:len(prefix)] == prefix && path[len(prefix)] == '/' {
		return true
	}
	return false
}

// activeAndInactive returns (active, inactive) based on GetTheme().
func (t *themeAwareFileSystem) activeAndInactive() (active, inactive static.ServeFileSystem) {
	if GetTheme() == "classic" {
		return t.classicFS, t.defaultFS
	}
	return t.defaultFS, t.classicFS
}

func (t *themeAwareFileSystem) Exists(prefix string, path string) bool {
	active, inactive := t.activeAndInactive()
	if active.Exists(prefix, path) {
		return true
	}
	// Fallback: try inactive theme for build-asset paths only.
	if isStaticAssetPath(path) && inactive.Exists(prefix, path) {
		return true
	}
	return false
}

func (t *themeAwareFileSystem) Open(name string) (http.File, error) {
	active, inactive := t.activeAndInactive()
	f, err := active.Open(name)
	if err == nil {
		return f, nil
	}
	// Fallback: try inactive theme for build-asset paths only.
	if isStaticAssetPath(name) {
		if f2, err2 := inactive.Open(name); err2 == nil {
			return f2, nil
		}
	}
	return nil, err
}

func NewThemeAwareFS(defaultFS, classicFS static.ServeFileSystem) static.ServeFileSystem {
	return &themeAwareFileSystem{defaultFS: defaultFS, classicFS: classicFS}
}
