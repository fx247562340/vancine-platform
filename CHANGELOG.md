# Changelog

All notable Vancine platform release and operations changes are tracked here.

## 1.0.6 - 2026-06-25

### Light mode

- Adapted homepage, docs, and About pages to support light/dark theme switching.
- Replaced hardcoded dark-only color palettes with Semi Design CSS variable tokens.
- Added `vancine-public-page` semantic CSS token layer for public marketing pages.
- Made homepage hero video overlay, provider logos, pricing cards, and footer theme-aware.
- Made docs page tables, code blocks, callouts, and TOC follow the active theme.
- Made About page cards, model coverage chips, and contact section follow the active theme.

### Motion

- Added aurora soft-light background blobs to the homepage hero (dark mode only).
- Added word-by-word text reveal animation on the hero headline.
- Added count-up number animation on hero stats.
- Added spring hover micro-interactions on hero CTA buttons.
- Added cursor-tracking spotlight glow on feature cards.
- Added icon scale/rotate on feature card hover.
- Added ScrollReveal staggered entrance on About page sections.
- Added spring hover lift on About cards, model chips, and contact card.
- Respected `prefers-reduced-motion` for aurora blobs.

### Branding

- Replaced root and frontend public logos with the new transparent Vancine logo.
- Replaced favicon.ico assets for classic/default/front-end app entry points.
- Added 16x16, 32x32, Apple touch, Android Chrome, and web manifest favicon assets to both frontend public directories.
- Updated both frontend HTML entry points to use `/favicon.ico`, size-specific PNG favicons, `apple-touch-icon`, and `site.webmanifest`.

### Build

- Increased Node heap for frontend Docker build steps with `NODE_OPTIONS=--max-old-space-size=4096` to avoid local Docker OOM during classic Vite build.

### Local verification

- Synced production `.env`, PostgreSQL data, `data/`, and `uploads/` to local Docker.
- Local verification service is running at `http://127.0.0.1:3001` because port 3000 is occupied by another local container.

## 1.0.5 - 2026-06-25

### Homepage

- Updated the classic homepage model category cards to show current connected Chinese models.
- Replaced unavailable overseas provider logos in the connected-provider marquee with connected Chinese provider logos.
- Updated the pricing highlight to compare current overseas models against current Chinese models.
- Fixed homepage model category card heights so the cards align cleanly.

### About

- Rewrote the classic About page with more realistic product-focused copy.
- Removed user-facing GitHub and open-source attribution links from the About page display.
- Cleaned up the About page model coverage card layout so five cards wrap with the final row centered.

### Build and release

- Bumped the Docker Compose runtime `VERSION` environment to `v1.0.5` so `/api/status` reports the release version.

## 1.0.4 - 2026-06-25

### Infrastructure

- Migrated production from `64.83.35.21` (Japan, 2C/2G) to `27.124.22.102` (Hong Kong, 16C/32G).
- Switched production deployment to server-side Docker builds from GitHub.
- Kept the old Japan server as a short-term cold backup with its app container stopped.
- Verified production on `https://vancine.com` with `success:true`, `setup:true`, `system_name:"Vancine"`, `server_address:"https://vancine.com"`, and `version:"v1.0.4"`.

### Build and release

- Standardized both frontend themes on npm and committed `package-lock.json` files.
- Removed `bun.lock` files from the production build path.
- Pinned `web/classic` `react-icons` to `5.3.0` because later `5.x` versions remove `SiLinkedin`.
- Updated Docker builds to use official base images.
- Configured Docker frontend stages to use `registry.npmmirror.com` plus npm retry settings to avoid BuildKit `ECONNRESET` on the new server.

### Documentation

- Added deployment and release process documentation.
- Updated deployment scripts and server documentation for the new production IP.
