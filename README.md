# Claude Utilization Dashboard

A self-hosted dashboard for your **Claude Code** usage. It tails the local
session logs Claude Code writes under `~/.claude`, stores them in Postgres, and
shows token usage, request volume, per-model / per-project breakdowns, recent
sessions, and your subscription quota — plus an estimated pay-as-you-go API
value for the same activity.

Everything runs on your own machine. No data leaves your host.

## Features

- **Usage over time** — stacked area chart by model, hourly or daily, with
  compact (K/M/B) axis labels.
- **Breakdown** — cost/token/request split per model (donut + table) and per
  project (paginated table).
- **Quota** — live 5-hour and weekly windows with reset countdowns, plus a
  history chart (requires Claude credentials; see Notes).
- **Recent sessions** — last sessions with tokens, requests, and value.
- **API-equivalent value** — what the same usage would cost on pay-as-you-go
  pricing (see Notes).
- Light / dark theme toggle, range filter (today / 7d / 30d / all).

## Stack

Bun · Elysia · Prisma + Postgres · Vite + React · [stamp-ui](https://www.npmjs.com/package/@harismawan/stamp-ui) · recharts.

Monorepo (`apps/api`, `apps/ingestor`, `apps/web`, `packages/shared`) managed
with Bun workspaces.

## Quick start (local / dev)

Requires [Bun](https://bun.sh) and Docker (for Postgres).

```bash
git clone https://github.com/harismawan/claude-utilization.git
cd claude-utilization
cp .env.example .env          # defaults work for the docker compose Postgres below

docker compose up -d          # local Postgres on :5432
bun install
bun --filter claude-util-api db:migrate   # name the migration "init"
bun run dev                   # api + ingestor + web together
```

Open <http://localhost:5173>. The ingestor backfills from your existing
`~/.claude` logs on first run.

## Configuration

All config is via `.env` (see `.env.example`):

| Variable        | Purpose                                                        | Default                  |
| --------------- | -------------------------------------------------------------- | ------------------------ |
| `DATABASE_URL`  | Postgres connection string                                     | local docker compose db  |
| `API_PORT`      | API listen port                                                | `8787`                   |
| `API_HOST`      | API bind address (`127.0.0.1` local-only, `0.0.0.0` exposed)   | `127.0.0.1`              |
| `CORS_ORIGIN`   | Comma-separated browser origins allowed to call the API        | dev web origins          |
| `WEB_PORT`      | Port the production static web build is served on              | `4173`                   |
| `VITE_API_BASE` | Build-time absolute API base for the SPA (prod static serve)   | `/api` (dev proxy)       |
| `CLAUDE_DIR`    | Override the Claude data dir                                   | `~/.claude`              |

## Production deploy (PM2)

Serves the API, the ingestor, and the prebuilt web `dist` under PM2. Point
`DATABASE_URL` at your Postgres host and set `VITE_API_BASE` / `CORS_ORIGIN` to
the address browsers will use to reach the API.

```bash
cp .env.example .env          # edit DATABASE_URL, VITE_API_BASE, CORS_ORIGIN

# one-time: create the app role + database on your Postgres host (needs admin).
# The app password is passed in, never stored in the repo.
PGPASSWORD=<admin-password> psql -h <db-host> -U postgres -d postgres \
  -v app_pw='<app-db-password>' -f scripts/db-bootstrap.sql

bun install
bun --filter claude-util-api db:generate
cd apps/api && bunx prisma migrate deploy --schema prisma/schema.prisma && cd ../..
bun run --filter claude-util-web build     # builds apps/web/dist, bakes VITE_API_BASE

pm2 start ecosystem.config.cjs
pm2 save                                   # persist; `pm2 startup` to run on boot
```

Processes:

- `claude-util-api` — Elysia REST API (`:8787` by default)
- `claude-util-ingestor` — log tailer + quota poller
- `claude-util-web` — PM2's static server hosting `apps/web/dist` as an SPA (`:4173`)

The static server does not proxy `/api`, so the SPA calls the API at the
absolute `VITE_API_BASE` baked at build time — make sure `CORS_ORIGIN` lists the
web origin.

## Architecture

- `apps/ingestor` — tails `~/.claude/projects/**/*.jsonl` into Postgres and
  polls the Claude usage endpoint (cached, backs off on 429). The only writer.
- `apps/api` — Elysia REST API over Postgres aggregates (`/swagger` for docs).
- `apps/web` — React dashboard, polls the API.
- `packages/shared` — pricing, parsing, 5-hour blocks, quota normalization, theme.

## Notes

- **"Value" is an estimate.** It's the pay-as-you-go API-equivalent cost of your
  usage, computed from public model pricing — not your actual bill (a Claude
  subscription is a flat fee).
- **Quota needs credentials.** The quota panels read `~/.claude/.credentials.json`
  (written by Claude Code when signed in). Without it, all local usage analytics
  still work — only the quota sections are hidden.
- **Privacy.** The app only reads your local Claude logs and talks to your own
  Postgres. Nothing is sent anywhere except Claude's own usage endpoint for
  quota.

## Disclaimer

Unofficial, not affiliated with Anthropic. Pricing and quota parsing track
formats that can change upstream. Provided as-is.
