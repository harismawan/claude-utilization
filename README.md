# Claude Utilization Dashboard

Local dashboard for Claude Code usage, quota, and estimated API-equivalent value.

## Stack
Bun · Elysia · Prisma/Postgres · Vite/React · stamp-ui · recharts. Themed like `receh`.

## Run
```bash
cp .env.example .env
docker compose up -d
bun install
bun --filter claude-util-api db:migrate   # name it "init"
bun run dev                                # api + ingestor + web
```
Open http://localhost:5173.

## Deploy (PM2)
Postgres lives on `192.168.100.21`; app uses db/role `claude_util`.
```bash
cp .env.example .env                       # set DATABASE_URL password
# one-time: create role + db on a fresh host (needs admin creds)
PGPASSWORD=<admin> psql -h 192.168.100.21 -U postgres -d postgres \
  -v app_pw='<app-db-password>' -f scripts/db-bootstrap.sql

bun install
bun --filter claude-util-api db:generate   # prisma client
cd apps/api && bunx prisma migrate deploy --schema prisma/schema.prisma && cd ../..
bun run --filter claude-util-web build      # apps/web/dist (bakes VITE_API_BASE)

pm2 start ecosystem.config.cjs
pm2 save                                    # persist; `pm2 startup` for boot
```
Processes: `claude-util-api` (:8787), `claude-util-ingestor`, `claude-util-web` (static dist on :4173, SPA). The SPA fetches the API at `VITE_API_BASE` (no proxy in static serve), so `CORS_ORIGIN` must list the web origin.

## Architecture
- `apps/ingestor` — tails `~/.claude/projects/**/*.jsonl` into Postgres + polls the OAuth usage endpoint (cached, backoff on 429). Only writer.
- `apps/api` — Elysia REST over Postgres aggregates (`/swagger` for docs).
- `apps/web` — React dashboard, polls the API.
- `packages/shared` — pricing, parsing, blocks, quota normalization, theme.

## Notes
- "Value" figures are pay-as-you-go API equivalents, not a bill (flat Max sub).
- Quota needs `~/.claude/.credentials.json`; without it, local analytics still work.
