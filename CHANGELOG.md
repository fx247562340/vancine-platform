# Changelog

All notable Vancine platform release and operations changes are tracked here.

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
