package router

import (
	"embed"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// ThemeAssets holds the embedded frontend assets for both themes.
type ThemeAssets struct {
	DefaultBuildFS   embed.FS
	DefaultIndexPage []byte
	ClassicBuildFS   embed.FS
	ClassicIndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets ThemeAssets) {
	defaultFS := common.EmbedFolder(assets.DefaultBuildFS, "web/default/dist")
	classicFS := common.EmbedFolder(assets.ClassicBuildFS, "web/classic/dist")
	themeFS := common.NewThemeAwareFS(defaultFS, classicFS)

	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())
	router.Static("/uploads/images", constant.UploadedImageDir)
	router.Use(static.Serve("/", themeFS))

	// Sitemap
	router.GET("/sitemap.xml", func(c *gin.Context) {
		host := "https://vancine.com"
		now := time.Now().UTC().Format("2006-01-02")
		pages := []struct {
			Path     string
			Priority string
			Freq     string
		}{
			{"/", "1.0", "daily"},
			{"/pricing", "0.8", "weekly"},
			{"/docs", "0.8", "weekly"},
			{"/about", "0.6", "monthly"},
			{"/user-agreement", "0.3", "monthly"},
			{"/privacy-policy", "0.3", "monthly"},
			{"/login", "0.5", "monthly"},
			{"/register", "0.5", "monthly"},
		}
		var sb strings.Builder
		sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
		sb.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)
		for _, p := range pages {
			sb.WriteString(fmt.Sprintf(
				`<url><loc>%s%s</loc><lastmod>%s</lastmod><changefreq>%s</changefreq><priority>%s</priority></url>`,
				host, p.Path, now, p.Freq, p.Priority,
			))
		}
		sb.WriteString(`</urlset>`)
		c.Data(http.StatusOK, "application/xml; charset=utf-8", []byte(sb.String()))
	})

	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		if common.GetTheme() == "classic" {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.ClassicIndexPage)
		} else {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.DefaultIndexPage)
		}
	})
}
