package common

import (
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-contrib/static"
)

// ---------------------------------------------------------------------------
// Mock filesystem for testing
// ---------------------------------------------------------------------------

// mockFile implements http.File for in-memory test content.
type mockFile struct {
	name    string
	content string
	reader  *strings.Reader
}

func (f *mockFile) Close() error              { return nil }
func (f *mockFile) Read(p []byte) (int, error) { return f.reader.Read(p) }
func (f *mockFile) Seek(offset int64, whence int) (int64, error) {
	return f.reader.Seek(offset, whence)
}
func (f *mockFile) Readdir(count int) ([]os.FileInfo, error) {
	return nil, os.ErrNotExist
}
func (f *mockFile) Stat() (os.FileInfo, error) {
	return &mockFileInfo{name: f.name, size: int64(len(f.content))}, nil
}

type mockFileInfo struct {
	name string
	size int64
}

func (fi *mockFileInfo) Name() string       { return fi.name }
func (fi *mockFileInfo) Size() int64        { return fi.size }
func (fi *mockFileInfo) Mode() os.FileMode  { return 0444 }
func (fi *mockFileInfo) ModTime() time.Time { return time.Time{} }
func (fi *mockFileInfo) IsDir() bool        { return false }
func (fi *mockFileInfo) Sys() any           { return nil }

// mockServeFileSystem is a simple in-memory filesystem for tests.
type mockServeFileSystem struct {
	files map[string]string // path → content
}

func (m *mockServeFileSystem) Exists(prefix string, path string) bool {
	_, ok := m.files[path]
	return ok
}

func (m *mockServeFileSystem) Open(name string) (http.File, error) {
	content, ok := m.files[name]
	if !ok {
		return nil, os.ErrNotExist
	}
	f := &mockFile{name: name, content: content, reader: strings.NewReader(content)}
	return f, nil
}

// Compile-time check that mockServeFileSystem satisfies the interface.
var _ static.ServeFileSystem = (*mockServeFileSystem)(nil)

// ---------------------------------------------------------------------------
// Tests for isStaticAssetPath (narrow build-asset namespace rule)
// ---------------------------------------------------------------------------

func TestIsStaticAssetPath(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		// Root and empty — not asset paths
		{"/", false},
		{"", false},

		// HTML documents — never cross-fallback (any casing)
		{"/index.html", false},
		{"/page.htm", false},
		{"/INDEX.HTML", false},
		{"/page.HTM", false},

		// Extensionless SPA routes — not asset paths
		{"/console", false},
		{"/docs", false},
		{"/dashboard/overview", false},
		{"/about", false},

		// Known build-asset namespaces — YES, allow fallback
		{"/assets/js/chunk-abc123.js", true},
		{"/assets/css/main-def456.css", true},
		{"/assets/logo.svg", true},
		{"/static/js/chunk-abc123.js", true},
		{"/static/css/main-def456.css", true},
		{"/static/font/inter.woff2", true},

		// Root-level files outside asset namespaces — NO fallback
		{"/favicon.ico", false},
		{"/robots.txt", false},
		{"/site.webmanifest", false},
		{"/logo.png", false},

		// Other paths — NO fallback
		{"/uploads/images/photo.jpg", false},
		{"/api/status", false},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			got := isStaticAssetPath(tt.path)
			if got != tt.want {
				t.Errorf("isStaticAssetPath(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Tests for IsAssetNotFoundPath (NoRoute handler decision)
// ---------------------------------------------------------------------------

func TestIsAssetNotFoundPath(t *testing.T) {
	tests := []struct {
		uri  string
		want bool
	}{
		// Exact segment matches
		{"/v1", true},
		{"/v1/chat/completions", true},
		{"/api", true},
		{"/api/status", true},
		{"/assets", true},
		{"/assets/js/missing.js", true},
		{"/static", true},
		{"/static/js/missing.js", true},

		// Query string on exact root
		{"/v1?foo=bar", true},
		{"/api?key=val", true},
		{"/assets?x=1", true},
		{"/static?y=2", true},

		// Segment-boundary false positives — must NOT match
		{"/v10", false},
		{"/v10/models", false},
		{"/apiary", false},
		{"/apiary/endpoint", false},
		{"/assets-old", false},
		{"/assets-old/file.js", false},
		{"/static-page", false},
		{"/static-page/index", false},

		// Ordinary SPA routes — must NOT match
		{"/console", false},
		{"/docs", false},
		{"/dashboard/overview", false},
		{"/favicon.ico", false},
		{"/", false},
		{"/about", false},
	}
	for _, tt := range tests {
		t.Run(tt.uri, func(t *testing.T) {
			got := IsAssetNotFoundPath(tt.uri)
			if got != tt.want {
				t.Errorf("IsAssetNotFoundPath(%q) = %v, want %v", tt.uri, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Tests for themeAwareFileSystem
// ---------------------------------------------------------------------------

func newTestFS(activeTheme string) (*themeAwareFileSystem, *mockServeFileSystem, *mockServeFileSystem) {
	defaultFS := &mockServeFileSystem{
		files: map[string]string{
			"/static/js/default-chunk.js": "default js",
			"/static/css/default.css":     "default css",
			"/index.html":                 "<html>default</html>",
			"/static/only-in-default.js":  "only default",
		},
	}
	classicFS := &mockServeFileSystem{
		files: map[string]string{
			"/assets/js/classic-chunk.js": "classic js",
			"/assets/css/classic.css":     "classic css",
			"/index.html":                 "<html>classic</html>",
			"/assets/only-in-classic.js":  "only classic",
		},
	}

	SetTheme(activeTheme)

	tfs := &themeAwareFileSystem{
		defaultFS: defaultFS,
		classicFS: classicFS,
	}
	return tfs, defaultFS, classicFS
}

func TestThemeAwareFS_ActiveHit(t *testing.T) {
	tfs, _, _ := newTestFS("default")
	defer SetTheme("classic")

	if !tfs.Exists("", "/static/js/default-chunk.js") {
		t.Error("Expected default-chunk.js to exist in active theme")
	}

	f, err := tfs.Open("/static/js/default-chunk.js")
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	defer f.Close()

	buf, _ := io.ReadAll(f)
	if string(buf) != "default js" {
		t.Errorf("Expected 'default js', got %q", string(buf))
	}
}

func TestThemeAwareFS_InactiveFallbackHit(t *testing.T) {
	tfs, _, _ := newTestFS("default")
	defer SetTheme("classic")

	// File exists ONLY in classic (inactive) /assets/ namespace
	if !tfs.Exists("", "/assets/only-in-classic.js") {
		t.Error("Expected fallback to find only-in-classic.js in inactive /assets/")
	}

	f, err := tfs.Open("/assets/only-in-classic.js")
	if err != nil {
		t.Fatalf("Expected fallback to succeed, got error: %v", err)
	}
	defer f.Close()

	buf, _ := io.ReadAll(f)
	if string(buf) != "only classic" {
		t.Errorf("Expected 'only classic', got %q", string(buf))
	}
}

func TestThemeAwareFS_MissingInBoth(t *testing.T) {
	tfs, _, _ := newTestFS("default")
	defer SetTheme("classic")

	if tfs.Exists("", "/assets/does-not-exist.js") {
		t.Error("Expected non-existent file to not be found")
	}

	_, err := tfs.Open("/assets/does-not-exist.js")
	if err == nil {
		t.Error("Expected error for non-existent file")
	}
}

func TestThemeAwareFS_NoFallbackForHTML(t *testing.T) {
	// index.html exists in classic but NOT in default — no fallback for HTML
	defaultFS := &mockServeFileSystem{
		files: map[string]string{
			"/static/js/something.js": "js",
		},
	}
	classicFS := &mockServeFileSystem{
		files: map[string]string{
			"/index.html": "<html>classic</html>",
		},
	}
	tfs := &themeAwareFileSystem{defaultFS: defaultFS, classicFS: classicFS}
	SetTheme("default")
	defer SetTheme("classic")

	if tfs.Exists("", "/index.html") {
		t.Error("HTML files should NOT get inactive-theme fallback")
	}

	_, err := tfs.Open("/index.html")
	if err == nil {
		t.Error("Expected error for HTML file not in active theme (no fallback)")
	}
}

func TestThemeAwareFS_NoFallbackForUppercaseHTML(t *testing.T) {
	defaultFS := &mockServeFileSystem{files: map[string]string{}}
	classicFS := &mockServeFileSystem{
		files: map[string]string{
			"/page.HTML": "<html>classic</html>",
		},
	}
	tfs := &themeAwareFileSystem{defaultFS: defaultFS, classicFS: classicFS}
	SetTheme("default")
	defer SetTheme("classic")

	if tfs.Exists("", "/page.HTML") {
		t.Error("Uppercase .HTML should NOT get inactive-theme fallback")
	}
}

func TestThemeAwareFS_NoFallbackForSPARoutes(t *testing.T) {
	// /console exists in classic FS but not in default — should NOT fallback
	// because /console is not in /assets/ or /static/ namespace
	defaultFS := &mockServeFileSystem{files: map[string]string{}}
	classicFS := &mockServeFileSystem{
		files: map[string]string{
			"/console": "some content",
		},
	}
	tfs := &themeAwareFileSystem{defaultFS: defaultFS, classicFS: classicFS}
	SetTheme("default")
	defer SetTheme("classic")

	if tfs.Exists("", "/console") {
		t.Error("Extensionless SPA route /console should NOT get inactive-theme fallback")
	}
}

func TestThemeAwareFS_NoFallbackForDocs(t *testing.T) {
	defaultFS := &mockServeFileSystem{files: map[string]string{}}
	classicFS := &mockServeFileSystem{
		files: map[string]string{
			"/docs": "docs content",
		},
	}
	tfs := &themeAwareFileSystem{defaultFS: defaultFS, classicFS: classicFS}
	SetTheme("default")
	defer SetTheme("classic")

	if tfs.Exists("", "/docs") {
		t.Error("Extensionless SPA route /docs should NOT get inactive-theme fallback")
	}
}

func TestThemeAwareFS_RootNotServedByStaticFS(t *testing.T) {
	if isStaticAssetPath("/") {
		t.Error("Root / should not be treated as a static asset path")
	}
	if isStaticAssetPath("") {
		t.Error("Empty path should not be treated as a static asset path")
	}
}

func TestThemeAwareFS_ClassicSelectionCorrect(t *testing.T) {
	tfs, _, _ := newTestFS("classic")
	defer SetTheme("classic")

	f, err := tfs.Open("/assets/js/classic-chunk.js")
	if err != nil {
		t.Fatalf("Expected classic chunk to be found, got error: %v", err)
	}
	defer f.Close()

	buf, _ := io.ReadAll(f)
	if string(buf) != "classic js" {
		t.Errorf("Expected 'classic js', got %q", string(buf))
	}
}

func TestThemeAwareFS_DefaultSelectionCorrect(t *testing.T) {
	tfs, _, _ := newTestFS("default")
	defer SetTheme("classic")

	f, err := tfs.Open("/static/css/default.css")
	if err != nil {
		t.Fatalf("Expected default CSS to be found, got error: %v", err)
	}
	defer f.Close()

	buf, _ := io.ReadAll(f)
	if string(buf) != "default css" {
		t.Errorf("Expected 'default css', got %q", string(buf))
	}
}

func TestThemeAwareFS_FallbackWithClassicActive(t *testing.T) {
	tfs, _, _ := newTestFS("classic")
	defer SetTheme("classic")

	// File only in default /static/ (inactive when classic is active)
	if !tfs.Exists("", "/static/only-in-default.js") {
		t.Error("Expected fallback to find only-in-default.js when classic is active")
	}

	f, err := tfs.Open("/static/only-in-default.js")
	if err != nil {
		t.Fatalf("Expected fallback to succeed: %v", err)
	}
	defer f.Close()

	buf, _ := io.ReadAll(f)
	if string(buf) != "only default" {
		t.Errorf("Expected 'only default', got %q", string(buf))
	}
}

func TestThemeAwareFS_NoFallbackForNonAssetPaths(t *testing.T) {
	// /favicon.ico exists in classic but not default — no fallback
	defaultFS := &mockServeFileSystem{files: map[string]string{}}
	classicFS := &mockServeFileSystem{
		files: map[string]string{
			"/favicon.ico": "classic favicon",
		},
	}
	tfs := &themeAwareFileSystem{defaultFS: defaultFS, classicFS: classicFS}
	SetTheme("default")
	defer SetTheme("classic")

	if tfs.Exists("", "/favicon.ico") {
		t.Error("Root-level /favicon.ico should NOT get inactive-theme fallback")
	}
}
