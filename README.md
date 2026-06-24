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

## Architecture
- `apps/ingestor` — tails `~/.claude/projects/**/*.jsonl` into Postgres + polls the OAuth usage endpoint (cached, backoff on 429). Only writer.
- `apps/api` — Elysia REST over Postgres aggregates (`/swagger` for docs).
- `apps/web` — React dashboard, polls the API.
- `packages/shared` — pricing, parsing, blocks, quota normalization, theme.

## Notes
- "Value" figures are pay-as-you-go API equivalents, not a bill (flat Max sub).
- Quota needs `~/.claude/.credentials.json`; without it, local analytics still work.
