# Deploy — Vancine Platform

Production deployment configuration files.

## Structure

```
deploy/
├── nginx/
│   └── vancine           # Nginx reverse proxy config (server: /etc/nginx/sites-enabled/vancine)
└── README.md
```

## Server

- **IP**: 64.83.35.21
- **Containers**: vancine (app), postgres, redis
- **Domain**: vancine.com (+ api.vancine.com → redirect)

## Deploy Process

1. Build frontend: `cd web/classic && npm run build`
2. Build Go binary:
   ```bash
   VERSION=$(git describe --tags --always 2>/dev/null || echo "v1.0.4")
   CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
     -ldflags "-s -w -X github.com/QuantumNous/new-api/common.Version=${VERSION}" \
     -o vancine
   ```
3. Upload to server: `scp vancine root@64.83.35.21:/tmp/vancine`
4. Deploy binary:
   ```bash
   docker cp /tmp/vancine vancine:/vancine
   docker restart vancine
   ```

> **Never** run `docker build` or `go build` on the server — it will OOM (1.9 GB RAM).

## Nginx

After editing `nginx/vancine`:

```bash
scp deploy/nginx/vancine root@64.83.35.21:/etc/nginx/sites-enabled/vancine
ssh root@64.83.35.21 "nginx -t && systemctl reload nginx"
```
