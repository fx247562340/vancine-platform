# Changelog

All notable Vancine platform release and operations changes are tracked here.

## Unreleased

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
