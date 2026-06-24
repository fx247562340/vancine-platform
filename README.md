# Vancine

**One API, Infinite Creativity.**

A one-stop AI creative API platform aggregating Chinese AI models (video, image, LLM, music) for international developers and creators.

## Features

- **Unified API** — One endpoint for all AI generation (video, image, text, music)
- **OpenAI Compatible** — Standard `/v1/chat/completions` format
- **Multi-Provider** — SiliconFlow, Novita AI, DeepSeek
- **Pay-as-you-go** — Credits system with Stripe integration
- **Smart Routing** — Automatic failover between providers

## Quick Start

### Prerequisites

- Docker & Docker Compose
- API keys from SiliconFlow, Novita AI, or DeepSeek

### Deploy

```bash
git clone https://github.com/fx247562340/vancine-platform.git
cd vancine-platform

# ⚠️ Change default passwords in docker-compose.yml before deploying!

docker compose up -d
```

Access the admin panel at `http://localhost:3000`

### Configure Providers

1. Login to the admin panel
2. Go to "渠道管理" (Channel Management)
3. Add your API providers:
   - SiliconFlow: `https://api.siliconflow.cn/v1`
   - Novita AI: `https://api.novita.ai/v3/openai`
   - DeepSeek: `https://api.deepseek.com`

### Test

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"hello"}]}'
```

## Tech Stack

- **Backend:** New-API (Go) — multi-provider AI API gateway
- **Frontend:** Next.js 14 + Tailwind CSS + shadcn/ui
- **Database:** PostgreSQL + Redis
- **Deployment:** Docker + GitHub Actions CI/CD
- **Payment:** Stripe (pay-as-you-go credits)

## Deployment and Release

- Current version: [`VERSION`](VERSION) = `1.0.4`
- Production server: `27.124.22.102`
- Production URL: `https://vancine.com`
- Deployment reference: [docs/deployment.md](docs/deployment.md)
- Release process: [docs/release-process.md](docs/release-process.md)

Standard production deploy:

```bash
./deploy.sh
```

The deploy script builds on the production server from `origin/main`. It does not build locally or copy a local binary.

Required release gate:

1. Make changes locally.
2. Run the full app locally with Docker.
3. Verify the local app at `http://127.0.0.1:3000`.
4. After approval, commit/push and deploy with `./deploy.sh`.

## API Endpoints

| Type | Endpoint | Method |
|------|----------|--------|
| Chat | `/v1/chat/completions` | POST |
| Video | `/v1/video/generate` | POST |
| Image | `/v1/images/generate` | POST |
| Music | `/v1/music/generate` | POST |
| Credits | `/v1/credits` | GET |
| Usage | `/v1/usage` | GET |

## License

AGPL-3.0 — See [LICENSE](LICENSE)

## Credits

Built on [New-API](https://github.com/Calcium-Ion/new-api) by Calcium-Ion.
