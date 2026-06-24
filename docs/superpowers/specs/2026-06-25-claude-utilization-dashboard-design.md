# Claude Code Utilization Dashboard — Design

**Date:** 2026-06-25
**Status:** Approved (design); pending spec review
**Location:** `/home/homebrew/code/claude-utilization`

## Goal

Local web dashboard showing live Claude Code utilization: current quota (5-hour
session + weekly), usage-over-time graphs, estimated price/value, and per-model /
per-project / per-session analytics. Stack mirrors `tokoshi` (Bun + Elysia +
Prisma/Postgres + Vite/React/styled-components/stamp-ui), themed like `receh`.

## Stack (mirrors tokoshi)

Confirmed conventions from `tokoshi` and `receh`:

- **Language:** TypeScript (ESM, `"type": "module"`), per user override.
  `tsconfig.json` per workspace + root base config; `.ts` (api/ingestor/shared)
  and `.tsx` (web). Bun runs `.ts` natively (no build step for api/ingestor;
  Vite handles web). Runtime validation via `zod`; static types from `zod`
  schemas via `z.infer`. (Note: tokoshi/receh themselves are plain JS — this
  project diverges to TS by request, keeping the same frameworks/tooling.)
- **Runtime / pkg mgr:** Bun, workspaces, `bun.lock`.
- **Lint/format:** Biome (`biome.json`).
- **API:** Elysia + `@elysiajs/cors` + `@elysiajs/swagger` + `pino` logging +
  Prisma 7 (`@prisma/client`, `@prisma/adapter-pg`) on Postgres.
- **Web:** Vite 8, React 19, `react-router-dom` 7, `styled-components` 6,
  `@harismawan/stamp-ui` (`StampProvider` + `useThemeStore` for light/dark),
  `zustand`, `recharts` ^3.8.1 (already used by receh), `lucide-react`.
- **Infra:** `docker-compose.yml` for Postgres (as in tokoshi/receh).

## Theme (receh palette)

- **Brand / primary:** `#FFDE15` (receh yellow).
- **Categorical accents** (per-model series, donut slices), from receh
  `pickers.js` / `AllocationDonut.jsx`:
  `#FFDE15` `#FF6B6B` `#1FAB6E` `#28A6E0` `#FF9F43` `#A05CFA` `#7B5CFA`.
- **Pastel tints** (backgrounds/badges): `#FFF6BF` `#FFE0E0` `#FFE0CC` `#FFD7F2`
  `#F5E0FF` `#E8DFFF` `#E5F5D7` `#DCEEFF` `#D7F5E5`.
- Light/dark via stamp-ui `StampProvider mode={mode}` + `useThemeStore`. Brand
  palette lives in `packages/shared/theme.ts` so api/web/charts share it.

## Data sources (two pillars)

### 1. Local logs → token/cost analytics (deterministic, no rate limit)

`~/.claude/projects/**/*.jsonl`. Each assistant line carries `message.usage`:

```
input_tokens, output_tokens,
cache_creation_input_tokens (split: cache_creation.ephemeral_1h / _5m),
cache_read_input_tokens,
server_tool_use.web_search_requests / web_fetch_requests,
service_tier, model
```

plus top-level `timestamp`, `sessionId`, `cwd` (project path), `gitBranch`,
`requestId`, and line `uuid`. ~1751 files present. Dedup on `requestId` + `uuid`
(same request can recur across files). This is the ccusage data model.

### 2. OAuth usage endpoint → authoritative quota (fragile, must cache)

- `GET https://api.anthropic.com/api/oauth/usage`
- Headers: `Authorization: Bearer <accessToken>`,
  `anthropic-beta: oauth-2025-04-20`.
- Returns current 5-hour session used/limit, weekly used/limit, extra-credit
  balance, subscription tier.
- **⚠️ Hard constraint:** this endpoint rate-limits aggressively (HTTP 429) even
  at low poll rates (documented Claude Code bug). Therefore: only the ingestor
  touches it, polls gently (default every 2–5 min, exponential backoff on 429),
  and caches snapshots. The browser **never** calls Anthropic directly.

Credentials live in `~/.claude/.credentials.json`:

```
claudeAiOauth: { accessToken, refreshToken, expiresAt (ms), scopes,
                 subscriptionType: "max", rateLimitTier }
```

**Token refresh:** `POST https://console.anthropic.com/v1/oauth/token`, body
`{ grant_type: "refresh_token", refresh_token, client_id }` (public Claude Code
client_id). Refresh when within ~60s of `expiresAt` or on a 401. The dashboard
**reads** `.credentials.json` but **never overwrites it** (avoid racing Claude
Code's own refresh); refreshed tokens are cached in our DB (`OAuthState`),
preferring the fresher of file vs DB.

## Architecture

```
claude-utilization/
  apps/
    api/         Elysia + Prisma + Postgres + swagger + pino — REST from DB
    ingestor/    Bun service (tokoshi worker/scheduler analog) — only writer
    web/         Vite + React + styled-components + stamp-ui + recharts + zustand
  packages/
    shared/      zod schemas, pricing table, theme palette, model maps
  docker-compose.yml   biome.json   package.json (workspaces)   bunfig.toml
```

The ingestor is the only component that reads logs and touches Anthropic. API
and browser read pre-computed rows from Postgres, decoupling many dashboard
refreshes from the fragile upstream.

## Data flow

1. **Ingestor loop A (local logs, ~10s):** tail JSONL deltas via per-file cursor
   → parse `message.usage` → dedup → compute per-event cost → upsert `UsageEvent`.
2. **Ingestor loop B (quota, ~2–5 min, backoff on 429):** read `.credentials.json`
   → refresh token if near expiry → `GET /api/oauth/usage` → normalize → append
   `QuotaSnapshot`. On 429/failure keep last good snapshot + mark stale.
3. **API:** aggregate queries over `UsageEvent`; serve latest/historical
   `QuotaSnapshot`.
4. **Web:** polls API every ~15–30s; renders.

## Data model (Prisma / Postgres)

- **`UsageEvent`** — `ts`, `sessionId`, `projectPath`, `gitBranch`, `model`,
  `inputTokens`, `outputTokens`, `cacheCreate1hTokens`, `cacheCreate5mTokens`,
  `cacheReadTokens`, `webSearchCount`, `webFetchCount`, `serviceTier`,
  `costUsd`. Unique dedup key `(requestId, lineUuid)`. Indexes on `ts`, `model`,
  `sessionId`, `projectPath`.
- **`IngestCursor`** — `filePath` (unique), `inode`, `bytesRead`, `lastUuid` —
  resumable incremental ingest.
- **`QuotaSnapshot`** — `capturedAt`, `fiveHourUsed`, `fiveHourLimit`,
  `fiveHourResetsAt`, `weeklyUsed`, `weeklyLimit`, `weeklyResetsAt`,
  `extraCredits`, `subscriptionType`, `rateLimitTier`, `raw` (Json), `stale`
  (bool). Append-only → quota-over-time graph.
- **`OAuthState`** — cached `accessToken`, `expiresAt` from refresh (never writes
  back to `.credentials.json`).

## Pricing (`packages/shared/pricing.ts`)

Per-model rates (USD per 1M tokens, in/out) from current Anthropic pricing:

| Model | Input | Output |
|---|---|---|
| `claude-fable-5` | 10 | 50 |
| `claude-opus-4-8` / `4-7` / `4-6` | 5 | 25 |
| `claude-sonnet-4-6` | 3 | 15 |
| `claude-haiku-4-5` | 1 | 5 |

Cache read = 0.1× input; cache write = 1.25× input (5m TTL) / 2× input (1h TTL).
Web search/fetch server-tool costs added per request count. Cost computed per
event at ingest (stored `costUsd`); recomputable if the table changes. Unknown
models → 0 cost + logged warning (forward-compat for new model IDs).

**Framing:** the user is on a flat Max subscription — no per-token bill. So
"estimated price" = the **equivalent pay-as-you-go API value** of the usage
(what ccusage reports), labeled clearly as value, not a charge.

## API endpoints (Elysia, swagger at `/swagger`)

| Endpoint | Returns |
|---|---|
| `GET /api/summary` | totals today / 7d / 30d / all: tokens by type, cost, request count, active sessions |
| `GET /api/usage/timeseries?granularity=hour\|day&range=&groupBy=model\|project` | time buckets for the main graph |
| `GET /api/quota` | latest `QuotaSnapshot` (5h + weekly used/limit/reset, credits, tier, stale flag) |
| `GET /api/quota/history?range=` | quota utilization over time |
| `GET /api/models` | per-model breakdown (tokens, cost, share) |
| `GET /api/projects` | per-project breakdown |
| `GET /api/sessions` | recent sessions with cost |
| `GET /api/blocks` | 5-hour rolling windows (ccusage-style), computed from events |
| `GET /api/health` | liveness + ingest freshness |

CORS locked to localhost.

## Dashboard (single page, stamp-ui + recharts)

- **Header:** stamp-ui `TopNav`; tier `Badge` (Max); estimated-value `PriceTag`;
  live-refresh indicator + staleness dot; light/dark toggle.
- **Overview:** stat cards (cost today/7d/30d, total tokens, requests); **two
  quota gauges** — 5-hour window + weekly, each with used/limit and a reset
  countdown (stamp-ui `Progress`/`GoalProgress`); current-block burn rate.
- **Usage graph:** recharts stacked area/bar — tokens & cost over time;
  granularity toggle (hour/day); stack-by-model using the receh accent palette.
- **Breakdown:** per-model `DataTable` + cost-share donut (recharts, receh
  colors); per-project `DataTable`.
- **Quota history:** recharts line — utilization % over time.
- **Sessions:** recent sessions `DataTable` with cost.

## Error handling

- OAuth 429 / fetch failure → serve last good snapshot + `stale` badge in UI.
- Token refresh fails → "re-authenticate in Claude Code" banner.
- Malformed JSONL line → skip + count; cursor stays resumable.
- Missing `.credentials.json` → quota panel shows "not connected"; local
  analytics (graphs, breakdowns, cost) still fully work.
- Unknown model ID → cost 0 + warning, row still ingested.

## Security

- Localhost-only (API binds 127.0.0.1; CORS localhost).
- OAuth tokens never reach the browser — API exposes only normalized numbers.
- `.credentials.json` read server-side only, never written.
- No secrets logged.

## Testing (`bun test`)

- **Unit:** pricing calculation (each model + cache tiers); JSONL parse + dedup;
  5-hour block computation; quota-response normalization; token-refresh decision
  (near-expiry / 401).
- **Integration:** Elysia routes against a seeded Postgres.
- **Fixtures:** sample JSONL lines (real `message.usage` shapes) + sample
  `/api/oauth/usage` JSON.

## Scope notes

- "Mirror tokoshi" = stack/tooling/conventions, **not** its full app list (no
  studio/admin). The api/ingestor/web split parallels tokoshi's api/worker/
  scheduler.
- Single-user, local-first. No auth layer on the dashboard itself (localhost).

## Primary risks

1. **OAuth `/api/oauth/usage` 429 fragility** — mitigated by ingestor-only
   access, gentle polling, backoff, and DB caching. Exact response JSON shape is
   confirmed conceptually (5h/weekly/credits/tier) but field names will be
   verified against a live response during implementation; normalization layer
   isolates this.
2. **Token-refresh client_id** — public Claude Code OAuth client_id verified
   during implementation against a live refresh.
