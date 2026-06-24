# Claude Code Utilization Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Local web dashboard showing Claude Code quota (5h + weekly), usage-over-time graphs, estimated API-equivalent value, and per-model/project/session analytics.

**Architecture:** Bun monorepo. `apps/ingestor` is the only writer — it tails `~/.claude/projects/**/*.jsonl` into Postgres and gently polls the OAuth usage endpoint (which 429s aggressively) into cached snapshots. `apps/api` (Elysia) serves REST aggregates from Postgres. `apps/web` (Vite/React/stamp-ui/recharts) polls the API. Pure logic (pricing, parsing, blocks, schemas, theme) lives in `packages/shared`.

**Tech Stack:** TypeScript (ESM), Bun, Elysia, Prisma 7 + `@prisma/adapter-pg` + Postgres, pino, zod, Vite 8, React 19, styled-components 6, `@harismawan/stamp-ui`, recharts ^3.8.1, zustand, lucide-react, Biome.

## Global Constraints

- **Language:** TypeScript, ESM (`"type": "module"`) everywhere. Bun runs `.ts` natively for api/ingestor; Vite compiles web.
- **No secrets to browser:** API exposes only normalized numbers. OAuth tokens stay server-side.
- **Localhost only:** API binds `127.0.0.1`; CORS allows `http://localhost:5173` only.
- **`.credentials.json` is read-only:** never overwrite `~/.claude/.credentials.json`. Refreshed tokens cache in DB.
- **OAuth endpoint is fragile:** only the ingestor calls `https://api.anthropic.com/api/oauth/usage`; poll ≥120s apart; exponential backoff on 429; always serve last good snapshot.
- **Dedup key:** a usage event is unique on `(requestId, lineUuid)`.
- **Pricing framing:** flat Max subscription — all dollar figures are *equivalent pay-as-you-go API value*, never a bill. UI must label as "value".
- **Model rates (USD per 1M tokens):** fable-5 10/50; opus-4-8 / opus-4-7 / opus-4-6 5/25; sonnet-4-6 3/15; haiku-4-5 1/5. Cache read ×0.1 input; cache write ×1.25 (5m) / ×2 (1h); web search $0.01/req; web fetch $0.
- **Theme:** brand `#FFDE15`; accents `#FF6B6B #1FAB6E #28A6E0 #FF9F43 #A05CFA #7B5CFA`.
- **Run dirs:** all paths relative to `/home/homebrew/code/claude-utilization`. Use `~`-expansion via `os.homedir()`; default Claude dir `${homedir}/.claude`, overridable with env `CLAUDE_DIR`.

---

## Shared Contracts (defined in Task 2–4, consumed everywhere)

```ts
// packages/shared/src/pricing.ts
export interface ModelRate { input: number; output: number } // per 1M tokens
export const MODEL_RATES: Record<string, ModelRate>;
export interface CostInput {
  model: string; inputTokens: number; outputTokens: number;
  cacheCreate5mTokens: number; cacheCreate1hTokens: number; cacheReadTokens: number;
  webSearchCount?: number; webFetchCount?: number;
}
export function computeEventCostUsd(e: CostInput): number;

// packages/shared/src/parse.ts
export interface ParsedUsageEvent {
  requestId: string; lineUuid: string; ts: Date;
  sessionId: string; projectPath: string; gitBranch: string | null; model: string;
  inputTokens: number; outputTokens: number;
  cacheCreate1hTokens: number; cacheCreate5mTokens: number; cacheReadTokens: number;
  webSearchCount: number; webFetchCount: number; serviceTier: string | null;
  costUsd: number;
}
export function parseUsageLine(raw: string, projectPath: string): ParsedUsageEvent | null;

// packages/shared/src/blocks.ts
export interface BlockInput { ts: Date; totalTokens: number; costUsd: number; }
export interface Block {
  startTs: Date; endTs: Date; events: number; totalTokens: number; costUsd: number; active: boolean;
}
export function computeBlocks(events: BlockInput[], now?: Date, windowMs?: number): Block[];

// packages/shared/src/quota.ts
export interface NormalizedQuota {
  fiveHourUsed: number; fiveHourLimit: number; fiveHourResetsAt: Date | null;
  weeklyUsed: number; weeklyLimit: number; weeklyResetsAt: Date | null;
  extraCredits: number; subscriptionType: string | null; rateLimitTier: string | null;
}
export function normalizeUsage(raw: unknown): NormalizedQuota;
```

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `bunfig.toml`, `biome.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `docker-compose.yml`, `README.md`

**Interfaces:**
- Produces: workspace layout `apps/*`, `packages/*`; `bun install` succeeds; `docker compose up -d` starts Postgres on `localhost:5432`.

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "claude-utilization",
  "private": true,
  "type": "module",
  "workspaces": ["apps/api", "apps/ingestor", "apps/web", "packages/shared"],
  "scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "test": "bun test",
    "db:migrate": "bun --filter claude-util-api db:migrate",
    "db:generate": "bun --filter claude-util-api db:generate",
    "dev:api": "bun --filter claude-util-api dev",
    "dev:ingestor": "bun --filter claude-util-ingestor dev",
    "dev:web": "bun --filter claude-util-web dev"
  },
  "devDependencies": { "@biomejs/biome": "^2.5.0" }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "strict": true, "noUncheckedIndexedAccess": true,
    "esModuleInterop": true, "skipLibCheck": true,
    "resolveJsonModule": true, "verbatimModuleSyntax": true,
    "types": ["bun"]
  }
}
```

- [ ] **Step 3: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.0/schema.json",
  "files": { "ignore": ["node_modules", "dist", "**/generated/**", "**/*.gen.ts"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" } }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules
dist
.env
*.log
apps/api/src/generated
.DS_Store
```

- [ ] **Step 5: Create `.env.example`**

```
DATABASE_URL=postgresql://claude:claude@localhost:5432/claude_util
API_PORT=8787
# Optional override; defaults to ~/.claude
CLAUDE_DIR=
```

- [ ] **Step 6: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: claude
      POSTGRES_PASSWORD: claude
      POSTGRES_DB: claude_util
    ports: ["5432:5432"]
    volumes: ["claude_util_pg:/var/lib/postgresql/data"]
volumes:
  claude_util_pg:
```

- [ ] **Step 7: Create `bunfig.toml`**

```toml
[install]
exact = true
```

- [ ] **Step 8: `git init` + initial install + bring up Postgres**

Run:
```bash
cd /home/homebrew/code/claude-utilization
git init
cp .env.example .env
bun install
docker compose up -d
```
Expected: `bun install` completes; `docker compose ps` shows `postgres` healthy.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold claude-utilization monorepo"
```

---

## Task 2: `packages/shared` — pricing

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/pricing.ts`
- Test: `packages/shared/src/pricing.test.ts`

**Interfaces:**
- Produces: `MODEL_RATES`, `CostInput`, `computeEventCostUsd` (see Shared Contracts).

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "claude-util-shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^4.4.3" }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: Write the failing test `packages/shared/src/pricing.test.ts`**

```ts
import { describe, expect, it } from 'bun:test'
import { computeEventCostUsd } from './pricing'

describe('computeEventCostUsd', () => {
  it('prices opus 4.8 input+output at $5/$25 per 1M', () => {
    const cost = computeEventCostUsd({
      model: 'claude-opus-4-8', inputTokens: 1_000_000, outputTokens: 1_000_000,
      cacheCreate5mTokens: 0, cacheCreate1hTokens: 0, cacheReadTokens: 0,
    })
    expect(cost).toBeCloseTo(30, 6)
  })

  it('applies cache multipliers (read 0.1x, 5m write 1.25x, 1h write 2x of input rate)', () => {
    const cost = computeEventCostUsd({
      model: 'claude-opus-4-8', inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 1_000_000, cacheCreate5mTokens: 1_000_000, cacheCreate1hTokens: 1_000_000,
    })
    // 5 * (0.1 + 1.25 + 2) = 16.75
    expect(cost).toBeCloseTo(16.75, 6)
  })

  it('adds $0.01 per web search and $0 per web fetch', () => {
    const cost = computeEventCostUsd({
      model: 'claude-haiku-4-5', inputTokens: 0, outputTokens: 0,
      cacheCreate5mTokens: 0, cacheCreate1hTokens: 0, cacheReadTokens: 0,
      webSearchCount: 3, webFetchCount: 5,
    })
    expect(cost).toBeCloseTo(0.03, 6)
  })

  it('returns 0 for unknown model', () => {
    const cost = computeEventCostUsd({
      model: 'claude-unknown-9', inputTokens: 1_000_000, outputTokens: 1_000_000,
      cacheCreate5mTokens: 0, cacheCreate1hTokens: 0, cacheReadTokens: 0,
    })
    expect(cost).toBe(0)
  })
})
```

- [ ] **Step 4: Run test, verify it fails**

Run: `bun test packages/shared/src/pricing.test.ts`
Expected: FAIL (`Cannot find module './pricing'`).

- [ ] **Step 5: Implement `packages/shared/src/pricing.ts`**

```ts
export interface ModelRate {
  input: number // USD per 1M input tokens
  output: number // USD per 1M output tokens
}

export const MODEL_RATES: Record<string, ModelRate> = {
  'claude-fable-5': { input: 10, output: 50 },
  'claude-mythos-5': { input: 10, output: 50 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}

export const CACHE_READ_MULT = 0.1
export const CACHE_WRITE_5M_MULT = 1.25
export const CACHE_WRITE_1H_MULT = 2
export const WEB_SEARCH_COST = 0.01
export const WEB_FETCH_COST = 0

export interface CostInput {
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreate5mTokens: number
  cacheCreate1hTokens: number
  cacheReadTokens: number
  webSearchCount?: number
  webFetchCount?: number
}

const PER_TOKEN = 1 / 1_000_000

export function computeEventCostUsd(e: CostInput): number {
  const rate = MODEL_RATES[e.model]
  if (!rate) return 0
  const tokenCost =
    e.inputTokens * rate.input * PER_TOKEN +
    e.outputTokens * rate.output * PER_TOKEN +
    e.cacheReadTokens * rate.input * CACHE_READ_MULT * PER_TOKEN +
    e.cacheCreate5mTokens * rate.input * CACHE_WRITE_5M_MULT * PER_TOKEN +
    e.cacheCreate1hTokens * rate.input * CACHE_WRITE_1H_MULT * PER_TOKEN
  const toolCost =
    (e.webSearchCount ?? 0) * WEB_SEARCH_COST + (e.webFetchCount ?? 0) * WEB_FETCH_COST
  return tokenCost + toolCost
}
```

- [ ] **Step 6: Run test, verify it passes**

Run: `bun test packages/shared/src/pricing.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): model pricing + computeEventCostUsd"
```

---

## Task 3: `packages/shared` — JSONL parser

**Files:**
- Create: `packages/shared/src/parse.ts`, `packages/shared/test/fixtures/usage-lines.jsonl`
- Test: `packages/shared/src/parse.test.ts`

**Interfaces:**
- Consumes: `computeEventCostUsd`, `CostInput` (Task 2).
- Produces: `ParsedUsageEvent`, `parseUsageLine` (see Shared Contracts).

- [ ] **Step 1: Create fixture `packages/shared/test/fixtures/usage-lines.jsonl`**

(Three lines: one real assistant usage line, one user line without usage, one malformed.)

```
{"type":"assistant","uuid":"u-1","requestId":"req-1","timestamp":"2026-06-12T09:04:59.662Z","sessionId":"sess-1","cwd":"/home/u/code/tokoshi","gitBranch":"main","message":{"model":"claude-opus-4-8","usage":{"input_tokens":7706,"output_tokens":369,"cache_read_input_tokens":0,"cache_creation_input_tokens":24291,"cache_creation":{"ephemeral_1h_input_tokens":24291,"ephemeral_5m_input_tokens":0},"server_tool_use":{"web_search_requests":2,"web_fetch_requests":0},"service_tier":"standard"}}}
{"type":"user","uuid":"u-2","timestamp":"2026-06-12T09:05:00.000Z","sessionId":"sess-1","message":{"role":"user","content":"hi"}}
{not valid json
```

- [ ] **Step 2: Write the failing test `packages/shared/src/parse.test.ts`**

```ts
import { describe, expect, it } from 'bun:test'
import { parseUsageLine } from './parse'

const ASSISTANT =
  '{"type":"assistant","uuid":"u-1","requestId":"req-1","timestamp":"2026-06-12T09:04:59.662Z","sessionId":"sess-1","cwd":"/home/u/code/tokoshi","gitBranch":"main","message":{"model":"claude-opus-4-8","usage":{"input_tokens":7706,"output_tokens":369,"cache_read_input_tokens":0,"cache_creation_input_tokens":24291,"cache_creation":{"ephemeral_1h_input_tokens":24291,"ephemeral_5m_input_tokens":0},"server_tool_use":{"web_search_requests":2,"web_fetch_requests":0},"service_tier":"standard"}}}'

describe('parseUsageLine', () => {
  it('parses an assistant usage line into a normalized event', () => {
    const e = parseUsageLine(ASSISTANT, '/proj')!
    expect(e.requestId).toBe('req-1')
    expect(e.lineUuid).toBe('u-1')
    expect(e.model).toBe('claude-opus-4-8')
    expect(e.inputTokens).toBe(7706)
    expect(e.outputTokens).toBe(369)
    expect(e.cacheCreate1hTokens).toBe(24291)
    expect(e.cacheCreate5mTokens).toBe(0)
    expect(e.webSearchCount).toBe(2)
    expect(e.gitBranch).toBe('main')
    expect(e.projectPath).toBe('/home/u/code/tokoshi') // prefers cwd over arg
    expect(e.costUsd).toBeGreaterThan(0)
    expect(e.ts.toISOString()).toBe('2026-06-12T09:04:59.662Z')
  })

  it('returns null for a user line (no usage)', () => {
    expect(parseUsageLine('{"type":"user","uuid":"u-2","message":{"role":"user"}}', '/p')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseUsageLine('{not json', '/p')).toBeNull()
  })

  it('falls back to projectPath arg when cwd absent', () => {
    const line =
      '{"type":"assistant","uuid":"u-3","requestId":"r3","timestamp":"2026-06-12T00:00:00.000Z","sessionId":"s","message":{"model":"claude-haiku-4-5","usage":{"input_tokens":1,"output_tokens":1}}}'
    expect(parseUsageLine(line, '/fallback')!.projectPath).toBe('/fallback')
  })
})
```

- [ ] **Step 3: Run test, verify it fails**

Run: `bun test packages/shared/src/parse.test.ts`
Expected: FAIL (`Cannot find module './parse'`).

- [ ] **Step 4: Implement `packages/shared/src/parse.ts`**

```ts
import { computeEventCostUsd } from './pricing'

export interface ParsedUsageEvent {
  requestId: string
  lineUuid: string
  ts: Date
  sessionId: string
  projectPath: string
  gitBranch: string | null
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreate1hTokens: number
  cacheCreate5mTokens: number
  cacheReadTokens: number
  webSearchCount: number
  webFetchCount: number
  serviceTier: string | null
  costUsd: number
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function parseUsageLine(raw: string, projectPath: string): ParsedUsageEvent | null {
  let d: any
  try {
    d = JSON.parse(raw)
  } catch {
    return null
  }
  if (!d || d.type !== 'assistant') return null
  const msg = d.message
  const usage = msg?.usage
  if (!usage || typeof msg.model !== 'string') return null
  const uuid = d.uuid
  if (typeof uuid !== 'string') return null

  const inputTokens = num(usage.input_tokens)
  const outputTokens = num(usage.output_tokens)
  const cacheReadTokens = num(usage.cache_read_input_tokens)
  const cacheCreate1hTokens = num(usage.cache_creation?.ephemeral_1h_input_tokens)
  const cacheCreate5mTokens = num(usage.cache_creation?.ephemeral_5m_input_tokens)
  // If split not present, attribute the lump sum to 5m bucket.
  const lumpCreate = num(usage.cache_creation_input_tokens)
  const create5m =
    cacheCreate1hTokens + cacheCreate5mTokens === 0 ? lumpCreate : cacheCreate5mTokens
  const webSearchCount = num(usage.server_tool_use?.web_search_requests)
  const webFetchCount = num(usage.server_tool_use?.web_fetch_requests)
  const model = msg.model

  const costUsd = computeEventCostUsd({
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreate1hTokens,
    cacheCreate5mTokens: create5m,
    webSearchCount,
    webFetchCount,
  })

  return {
    requestId: typeof d.requestId === 'string' ? d.requestId : uuid,
    lineUuid: uuid,
    ts: new Date(d.timestamp),
    sessionId: typeof d.sessionId === 'string' ? d.sessionId : 'unknown',
    projectPath: typeof d.cwd === 'string' ? d.cwd : projectPath,
    gitBranch: typeof d.gitBranch === 'string' ? d.gitBranch : null,
    model,
    inputTokens,
    outputTokens,
    cacheCreate1hTokens,
    cacheCreate5mTokens: create5m,
    cacheReadTokens,
    webSearchCount,
    webFetchCount,
    serviceTier: typeof usage.service_tier === 'string' ? usage.service_tier : null,
    costUsd,
  }
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `bun test packages/shared/src/parse.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): JSONL usage line parser"
```

---

## Task 4: `packages/shared` — blocks, quota normalization, theme, index

**Files:**
- Create: `packages/shared/src/blocks.ts`, `packages/shared/src/quota.ts`, `packages/shared/src/theme.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/blocks.test.ts`, `packages/shared/src/quota.test.ts`

**Interfaces:**
- Produces: `computeBlocks`, `Block`, `BlockInput`, `normalizeUsage`, `NormalizedQuota`, `BRAND`, `ACCENTS`, and a barrel `index.ts` re-exporting all of `packages/shared`.

- [ ] **Step 1: Write failing test `packages/shared/src/blocks.test.ts`**

```ts
import { describe, expect, it } from 'bun:test'
import { computeBlocks } from './blocks'

const t = (iso: string) => new Date(iso)

describe('computeBlocks', () => {
  it('groups events within a 5h window into one block', () => {
    const blocks = computeBlocks(
      [
        { ts: t('2026-06-12T09:00:00Z'), totalTokens: 100, costUsd: 1 },
        { ts: t('2026-06-12T11:00:00Z'), totalTokens: 50, costUsd: 0.5 },
      ],
      t('2026-06-12T12:00:00Z'),
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.events).toBe(2)
    expect(blocks[0]!.totalTokens).toBe(150)
    expect(blocks[0]!.costUsd).toBeCloseTo(1.5, 6)
    expect(blocks[0]!.active).toBe(true) // now < start+5h
  })

  it('starts a new block when an event is >5h after the block start', () => {
    const blocks = computeBlocks(
      [
        { ts: t('2026-06-12T09:00:00Z'), totalTokens: 1, costUsd: 0 },
        { ts: t('2026-06-12T15:30:00Z'), totalTokens: 1, costUsd: 0 },
      ],
      t('2026-06-12T16:00:00Z'),
    )
    expect(blocks).toHaveLength(2)
    expect(blocks[0]!.active).toBe(false)
    expect(blocks[1]!.active).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `bun test packages/shared/src/blocks.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/shared/src/blocks.ts`**

```ts
export interface BlockInput {
  ts: Date
  totalTokens: number
  costUsd: number
}

export interface Block {
  startTs: Date
  endTs: Date
  events: number
  totalTokens: number
  costUsd: number
  active: boolean
}

const FIVE_HOURS = 5 * 60 * 60 * 1000

export function computeBlocks(events: BlockInput[], now = new Date(), windowMs = FIVE_HOURS): Block[] {
  const sorted = [...events].sort((a, b) => a.ts.getTime() - b.ts.getTime())
  const blocks: Block[] = []
  let cur: Block | null = null
  for (const e of sorted) {
    if (!cur || e.ts.getTime() - cur.startTs.getTime() > windowMs) {
      cur = {
        startTs: e.ts,
        endTs: new Date(e.ts.getTime() + windowMs),
        events: 0,
        totalTokens: 0,
        costUsd: 0,
        active: false,
      }
      blocks.push(cur)
    }
    cur.events += 1
    cur.totalTokens += e.totalTokens
    cur.costUsd += e.costUsd
  }
  for (const b of blocks) b.active = now.getTime() < b.endTs.getTime()
  return blocks
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `bun test packages/shared/src/blocks.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write failing test `packages/shared/src/quota.test.ts`**

```ts
import { describe, expect, it } from 'bun:test'
import { normalizeUsage } from './quota'

describe('normalizeUsage', () => {
  it('maps a five_hour/seven_day shaped payload', () => {
    const q = normalizeUsage({
      five_hour: { utilization: 0.4, resets_at: '2026-06-12T14:00:00Z' },
      seven_day: { utilization: 0.1, resets_at: '2026-06-18T00:00:00Z' },
      subscription_type: 'max',
    })
    expect(q.fiveHourUsed).toBeCloseTo(40, 6)
    expect(q.fiveHourLimit).toBe(100)
    expect(q.fiveHourResetsAt?.toISOString()).toBe('2026-06-12T14:00:00.000Z')
    expect(q.subscriptionType).toBe('max')
  })

  it('tolerates a used/limit shaped payload', () => {
    const q = normalizeUsage({
      five_hour: { used: 30, limit: 200 },
      seven_day: { used: 5, limit: 1000 },
    })
    expect(q.fiveHourUsed).toBe(30)
    expect(q.fiveHourLimit).toBe(200)
  })

  it('returns safe zeros for an empty payload', () => {
    const q = normalizeUsage({})
    expect(q.fiveHourLimit).toBe(0)
    expect(q.fiveHourResetsAt).toBeNull()
  })
})
```

> **NOTE for implementer:** the live `/api/oauth/usage` field names are not contractually documented. `normalizeUsage` must accept *both* a `{utilization, resets_at}` shape and a `{used, limit, resets_at}` shape, reading several candidate keys. After the first successful live fetch (Task 9 manual check), confirm the real keys and tighten if needed — but keep the dual tolerance.

- [ ] **Step 6: Run test, verify it fails, then implement `packages/shared/src/quota.ts`**

```ts
export interface NormalizedQuota {
  fiveHourUsed: number
  fiveHourLimit: number
  fiveHourResetsAt: Date | null
  weeklyUsed: number
  weeklyLimit: number
  weeklyResetsAt: Date | null
  extraCredits: number
  subscriptionType: string | null
  rateLimitTier: string | null
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
function date(v: unknown): Date | null {
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
function pick(obj: any, keys: string[]): unknown {
  for (const k of keys) if (obj && obj[k] != null) return obj[k]
  return undefined
}

interface Window {
  used: number
  limit: number
  resetsAt: Date | null
}
function window(w: any): Window {
  if (!w || typeof w !== 'object') return { used: 0, limit: 0, resetsAt: null }
  const used = pick(w, ['used', 'usage'])
  const limit = pick(w, ['limit', 'cap'])
  if (used != null && limit != null) {
    return { used: num(used), limit: num(limit), resetsAt: date(pick(w, ['resets_at', 'resetsAt'])) }
  }
  // utilization fraction → percentage of 100
  const util = num(pick(w, ['utilization', 'used_fraction']))
  return { used: util * 100, limit: 100, resetsAt: date(pick(w, ['resets_at', 'resetsAt'])) }
}

export function normalizeUsage(raw: unknown): NormalizedQuota {
  const r: any = raw ?? {}
  const five = window(pick(r, ['five_hour', 'fiveHour', 'session', 'rolling']))
  const week = window(pick(r, ['seven_day', 'sevenDay', 'weekly', 'week']))
  return {
    fiveHourUsed: five.used,
    fiveHourLimit: five.limit,
    fiveHourResetsAt: five.resetsAt,
    weeklyUsed: week.used,
    weeklyLimit: week.limit,
    weeklyResetsAt: week.resetsAt,
    extraCredits: num(pick(r, ['extra_credits', 'extra_usage_credits', 'credits'])),
    subscriptionType:
      (pick(r, ['subscription_type', 'subscriptionType']) as string | undefined) ?? null,
    rateLimitTier: (pick(r, ['rate_limit_tier', 'rateLimitTier']) as string | undefined) ?? null,
  }
}
```

Run: `bun test packages/shared/src/quota.test.ts` → Expected PASS (3 tests).

- [ ] **Step 7: Create `packages/shared/src/theme.ts`**

```ts
export const BRAND = '#FFDE15'
export const ACCENTS = ['#FFDE15', '#FF6B6B', '#1FAB6E', '#28A6E0', '#FF9F43', '#A05CFA', '#7B5CFA']
export const TINTS = ['#FFF6BF', '#FFE0E0', '#FFE0CC', '#FFD7F2', '#F5E0FF', '#E8DFFF', '#E5F5D7', '#DCEEFF', '#D7F5E5']
// Stable color per model id (hash → ACCENTS index).
export function colorForModel(model: string): string {
  let h = 0
  for (let i = 0; i < model.length; i++) h = (h * 31 + model.charCodeAt(i)) >>> 0
  return ACCENTS[h % ACCENTS.length]!
}
```

- [ ] **Step 8: Create barrel `packages/shared/src/index.ts`**

```ts
export * from './pricing'
export * from './parse'
export * from './blocks'
export * from './quota'
export * from './theme'
```

- [ ] **Step 9: Run full shared suite + commit**

Run: `bun test packages/shared`
Expected: PASS (all tests from Tasks 2–4).

```bash
git add packages/shared
git commit -m "feat(shared): blocks, quota normalization, theme palette, barrel"
```

---

## Task 5: `apps/api` — Prisma schema, DB client, migration

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/prisma/schema.prisma`, `apps/api/src/db.ts`
- Modify: `.env` (already has `DATABASE_URL`)

**Interfaces:**
- Produces: Prisma models `UsageEvent`, `IngestCursor`, `QuotaSnapshot`, `OAuthState`; `db` (PrismaClient) exported from `apps/api/src/db.ts`; package exports `./db` and `./repositories`.

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "claude-util-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./db": "./src/db.ts",
    "./repositories": "./src/repositories/index.ts"
  },
  "scripts": {
    "dev": "bun --env-file=../../.env --watch src/index.ts",
    "start": "bun --env-file=../../.env src/index.ts",
    "db:migrate": "bunx prisma migrate dev --schema prisma/schema.prisma",
    "db:generate": "bunx prisma generate --schema prisma/schema.prisma"
  },
  "dependencies": {
    "@elysiajs/cors": "^1.4.2",
    "@elysiajs/swagger": "^1.3.1",
    "@prisma/adapter-pg": "^7.8.0",
    "@prisma/client": "^7.8.0",
    "claude-util-shared": "workspace:*",
    "elysia": "^1.4.29",
    "pino": "^10.3.1"
  },
  "devDependencies": { "prisma": "^7.8.0", "pino-pretty": "^13.1.3" }
}
```

- [ ] **Step 2: Create `apps/api/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: Create `apps/api/prisma/schema.prisma`**

```prisma
generator client {
  provider        = "prisma-client-js"
  output          = "../src/generated/client"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model UsageEvent {
  id                  BigInt   @id @default(autoincrement())
  requestId           String
  lineUuid            String
  ts                  DateTime
  sessionId           String
  projectPath         String
  gitBranch           String?
  model               String
  inputTokens         Int
  outputTokens        Int
  cacheCreate1hTokens Int
  cacheCreate5mTokens Int
  cacheReadTokens     Int
  webSearchCount      Int
  webFetchCount       Int
  serviceTier         String?
  costUsd             Float

  @@unique([requestId, lineUuid])
  @@index([ts])
  @@index([model])
  @@index([sessionId])
  @@index([projectPath])
}

model IngestCursor {
  filePath  String   @id
  inode     String
  bytesRead BigInt
  lastUuid  String?
  updatedAt DateTime @updatedAt
}

model QuotaSnapshot {
  id               BigInt   @id @default(autoincrement())
  capturedAt       DateTime @default(now())
  fiveHourUsed     Float
  fiveHourLimit    Float
  fiveHourResetsAt DateTime?
  weeklyUsed       Float
  weeklyLimit      Float
  weeklyResetsAt   DateTime?
  extraCredits     Float
  subscriptionType String?
  rateLimitTier    String?
  stale            Boolean  @default(false)
  raw              Json

  @@index([capturedAt])
}

model OAuthState {
  id          Int      @id @default(1)
  accessToken String
  expiresAt   BigInt
  updatedAt   DateTime @updatedAt
}
```

- [ ] **Step 4: Create `apps/api/src/db.ts`**

```ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/client/index.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

const adapter = new PrismaPg({ connectionString })
export const db = new PrismaClient({ adapter })
```

- [ ] **Step 5: Install + generate + migrate**

Run:
```bash
cd /home/homebrew/code/claude-utilization
bun install
bun --filter claude-util-api db:migrate
```
When prompted for a migration name, enter: `init`.
Expected: migration applied; `apps/api/src/generated/client` produced; tables created.

- [ ] **Step 6: Smoke-check the client compiles**

Run: `bun -e "import { db } from './apps/api/src/db.ts'; console.log(await db.usageEvent.count())"`
Expected: prints `0`.

- [ ] **Step 7: Commit**

```bash
git add apps/api package.json bun.lock
git commit -m "feat(api): prisma schema, pg adapter client, init migration"
```

---

## Task 6: `apps/api` — repositories

**Files:**
- Create: `apps/api/src/repositories/usage.ts`, `apps/api/src/repositories/quota.ts`, `apps/api/src/repositories/cursor.ts`, `apps/api/src/repositories/oauth.ts`, `apps/api/src/repositories/index.ts`
- Test: `apps/api/src/repositories/usage.test.ts`

**Interfaces:**
- Consumes: `db` (Task 5), `ParsedUsageEvent`, `NormalizedQuota`, `computeBlocks` (shared).
- Produces:
  - `usageRepo.upsertEvents(events: ParsedUsageEvent[]): Promise<number>`
  - `usageRepo.summary(since: Date): Promise<SummaryRow>`
  - `usageRepo.timeseries(opts): Promise<TimePoint[]>`
  - `usageRepo.byModel(since: Date): Promise<ModelRow[]>`
  - `usageRepo.byProject(since: Date): Promise<ProjectRow[]>`
  - `usageRepo.recentSessions(limit: number): Promise<SessionRow[]>`
  - `usageRepo.blocks(since: Date): Promise<Block[]>`
  - `quotaRepo.append(q: NormalizedQuota, raw: unknown, stale: boolean)`, `quotaRepo.latest()`, `quotaRepo.history(since: Date)`
  - `cursorRepo.get(filePath)`, `cursorRepo.save(...)`
  - `oauthRepo.get()`, `oauthRepo.set(accessToken, expiresAt)`

Type shapes (also re-exported from `index.ts`):

```ts
export interface SummaryRow {
  costUsd: number; inputTokens: number; outputTokens: number;
  cacheReadTokens: number; cacheCreateTokens: number; requests: number; sessions: number;
}
export interface TimePoint { bucket: string; model: string; costUsd: number; totalTokens: number }
export interface ModelRow { model: string; costUsd: number; totalTokens: number; requests: number }
export interface ProjectRow { projectPath: string; costUsd: number; totalTokens: number; requests: number }
export interface SessionRow {
  sessionId: string; projectPath: string; lastTs: string; requests: number; costUsd: number; totalTokens: number
}
```

- [ ] **Step 1: Write failing test `apps/api/src/repositories/usage.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import type { ParsedUsageEvent } from 'claude-util-shared'
import { db } from '../db'
import { usageRepo } from './usage'

const mk = (over: Partial<ParsedUsageEvent>): ParsedUsageEvent => ({
  requestId: 'r', lineUuid: 'u', ts: new Date('2026-06-12T09:00:00Z'),
  sessionId: 's1', projectPath: '/p', gitBranch: 'main', model: 'claude-opus-4-8',
  inputTokens: 100, outputTokens: 10, cacheCreate1hTokens: 0, cacheCreate5mTokens: 0,
  cacheReadTokens: 0, webSearchCount: 0, webFetchCount: 0, serviceTier: 'standard', costUsd: 1,
  ...over,
})

beforeAll(async () => { await db.usageEvent.deleteMany() })
afterAll(async () => { await db.usageEvent.deleteMany() })

describe('usageRepo', () => {
  it('upserts events and dedups on (requestId, lineUuid)', async () => {
    const inserted = await usageRepo.upsertEvents([mk({ requestId: 'a', lineUuid: '1' })])
    expect(inserted).toBe(1)
    await usageRepo.upsertEvents([mk({ requestId: 'a', lineUuid: '1' })]) // dup
    expect(await db.usageEvent.count()).toBe(1)
  })

  it('aggregates a summary since a date', async () => {
    await usageRepo.upsertEvents([
      mk({ requestId: 'b', lineUuid: '1', costUsd: 2, inputTokens: 200 }),
      mk({ requestId: 'c', lineUuid: '1', costUsd: 3, sessionId: 's2' }),
    ])
    const s = await usageRepo.summary(new Date('2026-01-01T00:00:00Z'))
    expect(s.costUsd).toBeCloseTo(6, 6)
    expect(s.sessions).toBe(2)
    expect(s.requests).toBe(3)
  })

  it('computes 5h blocks', async () => {
    const blocks = await usageRepo.blocks(new Date('2026-01-01T00:00:00Z'))
    expect(blocks.length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `bun --env-file=.env test apps/api/src/repositories/usage.test.ts`
Expected: FAIL (`Cannot find module './usage'`).

- [ ] **Step 3: Implement `apps/api/src/repositories/usage.ts`**

```ts
import { type Block, computeBlocks, type ParsedUsageEvent } from 'claude-util-shared'
import { db } from '../db'

export interface SummaryRow {
  costUsd: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreateTokens: number
  requests: number
  sessions: number
}
export interface TimePoint { bucket: string; model: string; costUsd: number; totalTokens: number }
export interface ModelRow { model: string; costUsd: number; totalTokens: number; requests: number }
export interface ProjectRow { projectPath: string; costUsd: number; totalTokens: number; requests: number }
export interface SessionRow {
  sessionId: string
  projectPath: string
  lastTs: string
  requests: number
  costUsd: number
  totalTokens: number
}

export const usageRepo = {
  async upsertEvents(events: ParsedUsageEvent[]): Promise<number> {
    if (events.length === 0) return 0
    const res = await db.usageEvent.createMany({
      data: events.map((e) => ({
        requestId: e.requestId,
        lineUuid: e.lineUuid,
        ts: e.ts,
        sessionId: e.sessionId,
        projectPath: e.projectPath,
        gitBranch: e.gitBranch,
        model: e.model,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        cacheCreate1hTokens: e.cacheCreate1hTokens,
        cacheCreate5mTokens: e.cacheCreate5mTokens,
        cacheReadTokens: e.cacheReadTokens,
        webSearchCount: e.webSearchCount,
        webFetchCount: e.webFetchCount,
        serviceTier: e.serviceTier,
        costUsd: e.costUsd,
      })),
      skipDuplicates: true,
    })
    return res.count
  },

  async summary(since: Date): Promise<SummaryRow> {
    const rows = await db.$queryRaw<
      {
        cost: number | null
        input: bigint | null
        output: bigint | null
        cacheread: bigint | null
        cachecreate: bigint | null
        requests: bigint
        sessions: bigint
      }[]
    >`
      SELECT
        COALESCE(SUM("costUsd"),0) AS cost,
        COALESCE(SUM("inputTokens"),0) AS input,
        COALESCE(SUM("outputTokens"),0) AS output,
        COALESCE(SUM("cacheReadTokens"),0) AS cacheread,
        COALESCE(SUM("cacheCreate1hTokens" + "cacheCreate5mTokens"),0) AS cachecreate,
        COUNT(*) AS requests,
        COUNT(DISTINCT "sessionId") AS sessions
      FROM "UsageEvent" WHERE "ts" >= ${since}`
    const r = rows[0]!
    return {
      costUsd: Number(r.cost ?? 0),
      inputTokens: Number(r.input ?? 0),
      outputTokens: Number(r.output ?? 0),
      cacheReadTokens: Number(r.cacheread ?? 0),
      cacheCreateTokens: Number(r.cachecreate ?? 0),
      requests: Number(r.requests),
      sessions: Number(r.sessions),
    }
  },

  async timeseries(opts: { since: Date; granularity: 'hour' | 'day' }): Promise<TimePoint[]> {
    const trunc = opts.granularity === 'hour' ? 'hour' : 'day'
    const rows = await db.$queryRawUnsafe<
      { bucket: Date; model: string; cost: number; tokens: bigint }[]
    >(
      `SELECT date_trunc($1, "ts") AS bucket, "model" AS model,
              SUM("costUsd") AS cost,
              SUM("inputTokens" + "outputTokens" + "cacheReadTokens" + "cacheCreate1hTokens" + "cacheCreate5mTokens") AS tokens
       FROM "UsageEvent" WHERE "ts" >= $2
       GROUP BY 1, 2 ORDER BY 1 ASC`,
      trunc,
      opts.since,
    )
    return rows.map((r) => ({
      bucket: r.bucket.toISOString(),
      model: r.model,
      costUsd: Number(r.cost),
      totalTokens: Number(r.tokens),
    }))
  },

  async byModel(since: Date): Promise<ModelRow[]> {
    const rows = await db.$queryRaw<{ model: string; cost: number; tokens: bigint; reqs: bigint }[]>`
      SELECT "model",
             SUM("costUsd") AS cost,
             SUM("inputTokens" + "outputTokens" + "cacheReadTokens" + "cacheCreate1hTokens" + "cacheCreate5mTokens") AS tokens,
             COUNT(*) AS reqs
      FROM "UsageEvent" WHERE "ts" >= ${since}
      GROUP BY "model" ORDER BY cost DESC`
    return rows.map((r) => ({
      model: r.model,
      costUsd: Number(r.cost),
      totalTokens: Number(r.tokens),
      requests: Number(r.reqs),
    }))
  },

  async byProject(since: Date): Promise<ProjectRow[]> {
    const rows = await db.$queryRaw<{ p: string; cost: number; tokens: bigint; reqs: bigint }[]>`
      SELECT "projectPath" AS p,
             SUM("costUsd") AS cost,
             SUM("inputTokens" + "outputTokens" + "cacheReadTokens" + "cacheCreate1hTokens" + "cacheCreate5mTokens") AS tokens,
             COUNT(*) AS reqs
      FROM "UsageEvent" WHERE "ts" >= ${since}
      GROUP BY "projectPath" ORDER BY cost DESC LIMIT 50`
    return rows.map((r) => ({
      projectPath: r.p,
      costUsd: Number(r.cost),
      totalTokens: Number(r.tokens),
      requests: Number(r.reqs),
    }))
  },

  async recentSessions(limit: number): Promise<SessionRow[]> {
    const rows = await db.$queryRaw<
      { s: string; p: string; last: Date; reqs: bigint; cost: number; tokens: bigint }[]
    >`
      SELECT "sessionId" AS s, MAX("projectPath") AS p, MAX("ts") AS last,
             COUNT(*) AS reqs, SUM("costUsd") AS cost,
             SUM("inputTokens" + "outputTokens" + "cacheReadTokens" + "cacheCreate1hTokens" + "cacheCreate5mTokens") AS tokens
      FROM "UsageEvent" GROUP BY "sessionId" ORDER BY last DESC LIMIT ${limit}`
    return rows.map((r) => ({
      sessionId: r.s,
      projectPath: r.p,
      lastTs: r.last.toISOString(),
      requests: Number(r.reqs),
      costUsd: Number(r.cost),
      totalTokens: Number(r.tokens),
    }))
  },

  async blocks(since: Date): Promise<Block[]> {
    const rows = await db.usageEvent.findMany({
      where: { ts: { gte: since } },
      select: {
        ts: true,
        costUsd: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheCreate1hTokens: true,
        cacheCreate5mTokens: true,
      },
      orderBy: { ts: 'asc' },
    })
    return computeBlocks(
      rows.map((r) => ({
        ts: r.ts,
        costUsd: r.costUsd,
        totalTokens:
          r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheCreate1hTokens + r.cacheCreate5mTokens,
      })),
    )
  },
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `bun --env-file=.env test apps/api/src/repositories/usage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `apps/api/src/repositories/quota.ts`**

```ts
import type { NormalizedQuota } from 'claude-util-shared'
import { db } from '../db'

export const quotaRepo = {
  async append(q: NormalizedQuota, raw: unknown, stale: boolean) {
    return db.quotaSnapshot.create({
      data: {
        fiveHourUsed: q.fiveHourUsed,
        fiveHourLimit: q.fiveHourLimit,
        fiveHourResetsAt: q.fiveHourResetsAt,
        weeklyUsed: q.weeklyUsed,
        weeklyLimit: q.weeklyLimit,
        weeklyResetsAt: q.weeklyResetsAt,
        extraCredits: q.extraCredits,
        subscriptionType: q.subscriptionType,
        rateLimitTier: q.rateLimitTier,
        stale,
        raw: (raw ?? {}) as object,
      },
    })
  },
  latest() {
    return db.quotaSnapshot.findFirst({ orderBy: { capturedAt: 'desc' } })
  },
  history(since: Date) {
    return db.quotaSnapshot.findMany({
      where: { capturedAt: { gte: since }, stale: false },
      orderBy: { capturedAt: 'asc' },
    })
  },
}
```

- [ ] **Step 6: Implement `apps/api/src/repositories/cursor.ts`**

```ts
import { db } from '../db'

export const cursorRepo = {
  get(filePath: string) {
    return db.ingestCursor.findUnique({ where: { filePath } })
  },
  save(filePath: string, inode: string, bytesRead: number, lastUuid: string | null) {
    return db.ingestCursor.upsert({
      where: { filePath },
      create: { filePath, inode, bytesRead: BigInt(bytesRead), lastUuid },
      update: { inode, bytesRead: BigInt(bytesRead), lastUuid },
    })
  },
}
```

- [ ] **Step 7: Implement `apps/api/src/repositories/oauth.ts`**

```ts
import { db } from '../db'

export const oauthRepo = {
  get() {
    return db.oAuthState.findUnique({ where: { id: 1 } })
  },
  set(accessToken: string, expiresAt: number) {
    return db.oAuthState.upsert({
      where: { id: 1 },
      create: { id: 1, accessToken, expiresAt: BigInt(expiresAt) },
      update: { accessToken, expiresAt: BigInt(expiresAt) },
    })
  },
}
```

- [ ] **Step 8: Implement barrel `apps/api/src/repositories/index.ts`**

```ts
export * from './usage'
export { quotaRepo } from './quota'
export { cursorRepo } from './cursor'
export { oauthRepo } from './oauth'
```

- [ ] **Step 9: Run repo tests + commit**

Run: `bun --env-file=.env test apps/api/src/repositories`
Expected: PASS.

```bash
git add apps/api
git commit -m "feat(api): usage/quota/cursor/oauth repositories"
```

---

## Task 7: `apps/ingestor` — OAuth client module

**Files:**
- Create: `apps/ingestor/package.json`, `apps/ingestor/tsconfig.json`, `apps/ingestor/src/oauth.ts`
- Test: `apps/ingestor/src/oauth.test.ts`

**Interfaces:**
- Consumes: `normalizeUsage`, `NormalizedQuota` (shared); `oauthRepo` (api).
- Produces:
  - `readCredentials(claudeDir: string): StoredCreds | null`
  - `needsRefresh(expiresAt: number, now: number): boolean`
  - `refreshAccessToken(refreshToken: string, fetchImpl?): Promise<{ accessToken: string; expiresAt: number }>`
  - `fetchUsage(accessToken: string, fetchImpl?): Promise<{ ok: true; quota: NormalizedQuota; raw: unknown } | { ok: false; status: number }>`
  - `OAUTH_CLIENT_ID` const, `USAGE_URL`, `TOKEN_URL`.

```ts
export interface StoredCreds {
  accessToken: string; refreshToken: string; expiresAt: number;
  subscriptionType: string | null; rateLimitTier: string | null;
}
```

- [ ] **Step 1: Create `apps/ingestor/package.json`**

```json
{
  "name": "claude-util-ingestor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --env-file=../../.env --watch src/index.ts",
    "start": "bun --env-file=../../.env src/index.ts"
  },
  "dependencies": {
    "claude-util-api": "workspace:*",
    "claude-util-shared": "workspace:*",
    "pino": "^10.3.1"
  },
  "devDependencies": { "pino-pretty": "^13.1.3" }
}
```

- [ ] **Step 2: Create `apps/ingestor/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: Write failing test `apps/ingestor/src/oauth.test.ts`**

```ts
import { describe, expect, it } from 'bun:test'
import { fetchUsage, needsRefresh, refreshAccessToken } from './oauth'

describe('needsRefresh', () => {
  it('is true within 60s of expiry', () => {
    const now = 1_000_000
    expect(needsRefresh(now + 30_000, now)).toBe(true)
    expect(needsRefresh(now + 120_000, now)).toBe(false)
  })
})

describe('refreshAccessToken', () => {
  it('posts a refresh grant and returns the new token + expiry', async () => {
    const fakeFetch = (async (_url: string, init: any) => {
      const body = JSON.parse(init.body)
      expect(body.grant_type).toBe('refresh_token')
      expect(body.refresh_token).toBe('rt')
      return new Response(JSON.stringify({ access_token: 'new', expires_in: 3600 }), { status: 200 })
    }) as unknown as typeof fetch
    const out = await refreshAccessToken('rt', fakeFetch)
    expect(out.accessToken).toBe('new')
    expect(out.expiresAt).toBeGreaterThan(Date.now())
  })
})

describe('fetchUsage', () => {
  it('returns ok:false on 429', async () => {
    const fakeFetch = (async () => new Response('rate limited', { status: 429 })) as unknown as typeof fetch
    const res = await fetchUsage('tok', fakeFetch)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(429)
  })

  it('normalizes a 200 usage payload', async () => {
    const payload = { five_hour: { utilization: 0.5 }, seven_day: { utilization: 0.2 } }
    const fakeFetch = (async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch
    const res = await fetchUsage('tok', fakeFetch)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.quota.fiveHourUsed).toBeCloseTo(50, 6)
  })
})
```

- [ ] **Step 4: Run test, verify it fails**

Run: `bun test apps/ingestor/src/oauth.test.ts`
Expected: FAIL.

- [ ] **Step 5: Implement `apps/ingestor/src/oauth.ts`**

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type NormalizedQuota, normalizeUsage } from 'claude-util-shared'

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
export const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
// Public Claude Code OAuth client id. VERIFY against a live refresh during Task 9;
// if refresh returns 400/401, re-check this value before debugging anything else.
export const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const OAUTH_BETA = 'oauth-2025-04-20'
const REFRESH_SKEW_MS = 60_000

export interface StoredCreds {
  accessToken: string
  refreshToken: string
  expiresAt: number
  subscriptionType: string | null
  rateLimitTier: string | null
}

export function readCredentials(claudeDir: string): StoredCreds | null {
  try {
    const raw = readFileSync(join(claudeDir, '.credentials.json'), 'utf8')
    const o = JSON.parse(raw)?.claudeAiOauth
    if (!o?.accessToken || !o?.refreshToken) return null
    return {
      accessToken: o.accessToken,
      refreshToken: o.refreshToken,
      expiresAt: Number(o.expiresAt) || 0,
      subscriptionType: o.subscriptionType ?? null,
      rateLimitTier: o.rateLimitTier ?? null,
    }
  } catch {
    return null
  }
}

export function needsRefresh(expiresAt: number, now: number): boolean {
  return expiresAt - now <= REFRESH_SKEW_MS
}

export async function refreshAccessToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresAt: number }> {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: OAUTH_CLIENT_ID,
    }),
  })
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`)
  const j = (await res.json()) as { access_token: string; expires_in?: number }
  return {
    accessToken: j.access_token,
    expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000,
  }
}

export type UsageResult =
  | { ok: true; quota: NormalizedQuota; raw: unknown }
  | { ok: false; status: number }

export async function fetchUsage(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UsageResult> {
  const res = await fetchImpl(USAGE_URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      'anthropic-beta': OAUTH_BETA,
    },
  })
  if (!res.ok) return { ok: false, status: res.status }
  const raw = await res.json()
  return { ok: true, quota: normalizeUsage(raw), raw }
}
```

- [ ] **Step 6: Run test, verify it passes**

Run: `bun test apps/ingestor/src/oauth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/ingestor
git commit -m "feat(ingestor): OAuth credentials/refresh/usage client"
```

---

## Task 8: `apps/ingestor` — log tailer

**Files:**
- Create: `apps/ingestor/src/tailer.ts`
- Test: `apps/ingestor/src/tailer.test.ts`

**Interfaces:**
- Consumes: `parseUsageLine`, `ParsedUsageEvent` (shared); `usageRepo`, `cursorRepo` (api).
- Produces: `ingestOnce(claudeDir: string): Promise<{ files: number; events: number }>` — scans `${claudeDir}/projects/**/*.jsonl`, reads only new bytes per cursor, upserts events.

- [ ] **Step 1: Write failing test `apps/ingestor/src/tailer.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { db } from 'claude-util-api/db'
import { ingestOnce } from './tailer'

const LINE = (uuid: string, req: string) =>
  `{"type":"assistant","uuid":"${uuid}","requestId":"${req}","timestamp":"2026-06-12T09:00:00.000Z","sessionId":"s","cwd":"/proj","message":{"model":"claude-haiku-4-5","usage":{"input_tokens":10,"output_tokens":2}}}\n`

let dir: string
beforeAll(async () => {
  await db.usageEvent.deleteMany()
  await db.ingestCursor.deleteMany()
  dir = mkdtempSync(join(tmpdir(), 'cu-'))
  const proj = join(dir, 'projects', '-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(proj, 'a.jsonl'), LINE('u1', 'r1'))
})
afterAll(async () => {
  await db.usageEvent.deleteMany()
  await db.ingestCursor.deleteMany()
})

describe('ingestOnce', () => {
  it('ingests new lines and is idempotent on re-run', async () => {
    const first = await ingestOnce(dir)
    expect(first.events).toBe(1)
    const second = await ingestOnce(dir) // no new bytes
    expect(second.events).toBe(0)
    expect(await db.usageEvent.count()).toBe(1)
  })

  it('ingests appended lines only', async () => {
    const proj = join(dir, 'projects', '-proj')
    appendFileSync(join(proj, 'a.jsonl'), LINE('u2', 'r2'))
    const res = await ingestOnce(dir)
    expect(res.events).toBe(1)
    expect(await db.usageEvent.count()).toBe(2)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `bun --env-file=.env test apps/ingestor/src/tailer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `apps/ingestor/src/tailer.ts`**

```ts
import { createReadStream, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { cursorRepo, usageRepo } from 'claude-util-api/repositories'
import { type ParsedUsageEvent, parseUsageLine } from 'claude-util-shared'

async function findJsonl(root: string): Promise<string[]> {
  const out: string[] = []
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    const full = join(root, ent.name)
    if (ent.isDirectory()) out.push(...(await findJsonl(full)))
    else if (ent.isFile() && ent.name.endsWith('.jsonl')) out.push(full)
  }
  return out
}

async function readFrom(
  filePath: string,
  startByte: number,
  projectPath: string,
): Promise<{ events: ParsedUsageEvent[]; bytesRead: number; lastUuid: string | null }> {
  const stat = statSync(filePath)
  if (stat.size <= startByte) return { events: [], bytesRead: stat.size, lastUuid: null }
  const stream = createReadStream(filePath, { start: startByte, encoding: 'utf8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  const events: ParsedUsageEvent[] = []
  let lastUuid: string | null = null
  for await (const line of rl) {
    if (!line.trim()) continue
    const ev = parseUsageLine(line, projectPath)
    if (ev) {
      events.push(ev)
      lastUuid = ev.lineUuid
    }
  }
  return { events, bytesRead: stat.size, lastUuid }
}

export async function ingestOnce(claudeDir: string): Promise<{ files: number; events: number }> {
  const projectsRoot = join(claudeDir, 'projects')
  const files = await findJsonl(projectsRoot)
  let total = 0
  for (const file of files) {
    const cursor = await cursorRepo.get(file)
    const start = cursor ? Number(cursor.bytesRead) : 0
    const inode = String(statSync(file).ino)
    // If the file shrank or inode changed (rotation), re-read from 0.
    const safeStart = cursor && cursor.inode === inode ? start : 0
    const { events, bytesRead, lastUuid } = await readFrom(file, safeStart, file)
    if (events.length) total += await usageRepo.upsertEvents(events)
    await cursorRepo.save(file, inode, bytesRead, lastUuid ?? cursor?.lastUuid ?? null)
  }
  return { files: files.length, events: total }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `bun --env-file=.env test apps/ingestor/src/tailer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/ingestor
git commit -m "feat(ingestor): incremental JSONL tailer with cursor"
```

---

## Task 9: `apps/ingestor` — quota poller + service loop + live verification

**Files:**
- Create: `apps/ingestor/src/quota.ts`, `apps/ingestor/src/index.ts`
- Test: `apps/ingestor/src/quota.test.ts`

**Interfaces:**
- Consumes: oauth module (Task 7), `quotaRepo`, `oauthRepo` (api).
- Produces: `pollQuotaOnce(claudeDir, deps): Promise<'ok' | 'stale' | 'no-creds'>`; `main()` loop in `index.ts`.

- [ ] **Step 1: Write failing test `apps/ingestor/src/quota.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { db } from 'claude-util-api/db'
import { pollQuotaOnce } from './quota'

let dir: string
beforeAll(async () => {
  await db.quotaSnapshot.deleteMany()
  dir = mkdtempSync(join(tmpdir(), 'cuq-'))
  writeFileSync(
    join(dir, '.credentials.json'),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: Date.now() + 3_600_000,
        subscriptionType: 'max',
        rateLimitTier: 'tier',
      },
    }),
  )
})
afterAll(async () => { await db.quotaSnapshot.deleteMany() })

describe('pollQuotaOnce', () => {
  it('writes a fresh snapshot on success', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ five_hour: { utilization: 0.3 }, seven_day: { utilization: 0.1 } }), {
        status: 200,
      })) as unknown as typeof fetch
    const out = await pollQuotaOnce(dir, { fetchImpl: fakeFetch })
    expect(out).toBe('ok')
    const snap = await db.quotaSnapshot.findFirst({ orderBy: { capturedAt: 'desc' } })
    expect(snap!.stale).toBe(false)
    expect(snap!.fiveHourUsed).toBeCloseTo(30, 6)
  })

  it('writes a stale snapshot on 429', async () => {
    const fakeFetch = (async () => new Response('rl', { status: 429 })) as unknown as typeof fetch
    const out = await pollQuotaOnce(dir, { fetchImpl: fakeFetch })
    expect(out).toBe('stale')
    const snap = await db.quotaSnapshot.findFirst({ orderBy: { capturedAt: 'desc' } })
    expect(snap!.stale).toBe(true)
  })

  it('returns no-creds when credentials missing', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'cuq-empty-'))
    expect(await pollQuotaOnce(empty, { fetchImpl: fetch })).toBe('no-creds')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `bun --env-file=.env test apps/ingestor/src/quota.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `apps/ingestor/src/quota.ts`**

```ts
import { oauthRepo, quotaRepo } from 'claude-util-api/repositories'
import {
  fetchUsage,
  needsRefresh,
  readCredentials,
  refreshAccessToken,
} from './oauth'

export interface PollDeps {
  fetchImpl?: typeof fetch
}

export async function pollQuotaOnce(
  claudeDir: string,
  deps: PollDeps = {},
): Promise<'ok' | 'stale' | 'no-creds'> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const creds = readCredentials(claudeDir)
  if (!creds) return 'no-creds'

  // Prefer the fresher of file vs cached DB token.
  const cached = await oauthRepo.get()
  let accessToken = creds.accessToken
  let expiresAt = creds.expiresAt
  if (cached && Number(cached.expiresAt) > expiresAt) {
    accessToken = cached.accessToken
    expiresAt = Number(cached.expiresAt)
  }

  if (needsRefresh(expiresAt, Date.now())) {
    try {
      const refreshed = await refreshAccessToken(creds.refreshToken, fetchImpl)
      accessToken = refreshed.accessToken
      await oauthRepo.set(refreshed.accessToken, refreshed.expiresAt)
    } catch {
      // fall through with the (possibly expired) token; fetch will 401 → stale
    }
  }

  const res = await fetchUsage(accessToken, fetchImpl)
  if (!res.ok) {
    const last = await quotaRepo.latest()
    // Re-append last good values flagged stale so the UI can show staleness.
    await quotaRepo.append(
      {
        fiveHourUsed: last?.fiveHourUsed ?? 0,
        fiveHourLimit: last?.fiveHourLimit ?? 0,
        fiveHourResetsAt: last?.fiveHourResetsAt ?? null,
        weeklyUsed: last?.weeklyUsed ?? 0,
        weeklyLimit: last?.weeklyLimit ?? 0,
        weeklyResetsAt: last?.weeklyResetsAt ?? null,
        extraCredits: last?.extraCredits ?? 0,
        subscriptionType: creds.subscriptionType,
        rateLimitTier: creds.rateLimitTier,
      },
      { error: res.status },
      true,
    )
    return 'stale'
  }

  await quotaRepo.append(
    {
      ...res.quota,
      subscriptionType: res.quota.subscriptionType ?? creds.subscriptionType,
      rateLimitTier: res.quota.rateLimitTier ?? creds.rateLimitTier,
    },
    res.raw,
    false,
  )
  return 'ok'
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `bun --env-file=.env test apps/ingestor/src/quota.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement service loop `apps/ingestor/src/index.ts`**

```ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import { ingestOnce } from './tailer'
import { pollQuotaOnce } from './quota'

const log = pino({ transport: { target: 'pino-pretty' } })
const CLAUDE_DIR = process.env.CLAUDE_DIR || join(homedir(), '.claude')
const LOG_INTERVAL_MS = 10_000
const QUOTA_BASE_MS = 120_000

async function logLoop() {
  for (;;) {
    try {
      const r = await ingestOnce(CLAUDE_DIR)
      if (r.events) log.info({ files: r.files, events: r.events }, 'ingested')
    } catch (err) {
      log.error({ err }, 'ingest failed')
    }
    await Bun.sleep(LOG_INTERVAL_MS)
  }
}

async function quotaLoop() {
  let backoff = QUOTA_BASE_MS
  for (;;) {
    let wait = QUOTA_BASE_MS
    try {
      const status = await pollQuotaOnce(CLAUDE_DIR)
      if (status === 'stale') {
        backoff = Math.min(backoff * 2, 30 * 60_000)
        wait = backoff
        log.warn({ wait }, 'quota stale (429/fail) — backing off')
      } else {
        backoff = QUOTA_BASE_MS
        if (status === 'no-creds') log.warn('no .credentials.json — quota disabled')
      }
    } catch (err) {
      log.error({ err }, 'quota poll failed')
    }
    await Bun.sleep(wait)
  }
}

log.info({ CLAUDE_DIR }, 'ingestor starting')
await Promise.all([logLoop(), quotaLoop()])
```

- [ ] **Step 6: LIVE VERIFICATION — run the ingestor against real data**

Run (in one terminal, ~30s, then Ctrl-C):
```bash
cd /home/homebrew/code/claude-utilization
bun --filter claude-util-ingestor dev
```
Expected: logs "ingested" lines; a `QuotaSnapshot` row appears.

Verify rows + **confirm the real OAuth response shape**:
```bash
bun -e "import {db} from './apps/api/src/db.ts'; console.log('events', await db.usageEvent.count()); const q = await db.quotaSnapshot.findFirst({orderBy:{capturedAt:'desc'}}); console.log('quota', JSON.stringify(q?.raw)); console.log('5h', q?.fiveHourUsed, '/', q?.fiveHourLimit, 'stale', q?.stale)"
```
- If `events` > 0 → tailer works.
- Inspect printed `raw` JSON: confirm `normalizeUsage` keys match. If `fiveHourLimit` is 0 but `raw` clearly has usage data, update `packages/shared/src/quota.ts` key candidates to match the real payload, re-run `bun test packages/shared`, and re-verify.
- If quota row is `stale` due to a token refresh 400 → re-check `OAUTH_CLIENT_ID` in `apps/ingestor/src/oauth.ts` against the live Claude Code value before proceeding.

- [ ] **Step 7: Commit**

```bash
git add apps/ingestor packages/shared
git commit -m "feat(ingestor): quota poller with backoff + service loop"
```

---

## Task 10: `apps/api` — HTTP server + endpoints

**Files:**
- Create: `apps/api/src/index.ts`, `apps/api/src/routes.ts`, `apps/api/src/ranges.ts`
- Test: `apps/api/src/routes.test.ts`

**Interfaces:**
- Consumes: `usageRepo`, `quotaRepo` (Task 6).
- Produces: Elysia app on `127.0.0.1:${API_PORT}` with the endpoints in the spec; `buildApp()` factory for tests.

- [ ] **Step 1: Create `apps/api/src/ranges.ts`**

```ts
export type RangeKey = 'today' | '7d' | '30d' | 'all'

export function sinceFor(range: RangeKey, now = new Date()): Date {
  switch (range) {
    case 'today': {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case '7d':
      return new Date(now.getTime() - 7 * 86_400_000)
    case '30d':
      return new Date(now.getTime() - 30 * 86_400_000)
    default:
      return new Date(0)
  }
}
```

- [ ] **Step 2: Write failing test `apps/api/src/routes.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import type { ParsedUsageEvent } from 'claude-util-shared'
import { db } from './db'
import { usageRepo } from './repositories/usage'
import { buildApp } from './routes'

const app = buildApp()
const mk = (over: Partial<ParsedUsageEvent>): ParsedUsageEvent => ({
  requestId: 'r', lineUuid: 'u', ts: new Date(), sessionId: 's1', projectPath: '/p',
  gitBranch: 'main', model: 'claude-opus-4-8', inputTokens: 100, outputTokens: 10,
  cacheCreate1hTokens: 0, cacheCreate5mTokens: 0, cacheReadTokens: 0, webSearchCount: 0,
  webFetchCount: 0, serviceTier: 'standard', costUsd: 1, ...over,
})

beforeAll(async () => {
  await db.usageEvent.deleteMany()
  await usageRepo.upsertEvents([mk({ requestId: 'a', lineUuid: '1' }), mk({ requestId: 'b', lineUuid: '1', model: 'claude-haiku-4-5' })])
})
afterAll(async () => { await db.usageEvent.deleteMany() })

const get = (path: string) => app.handle(new Request(`http://localhost${path}`)).then((r) => r.json())

describe('routes', () => {
  it('GET /api/health', async () => {
    expect((await get('/api/health')).ok).toBe(true)
  })
  it('GET /api/summary returns totals', async () => {
    const s = await get('/api/summary?range=all')
    expect(s.requests).toBe(2)
    expect(s.costUsd).toBeCloseTo(2, 6)
  })
  it('GET /api/models lists two models', async () => {
    const m = await get('/api/models?range=all')
    expect(m.length).toBe(2)
  })
  it('GET /api/quota returns null-safe object when empty', async () => {
    const q = await get('/api/quota')
    expect(q).toHaveProperty('connected')
  })
})
```

- [ ] **Step 3: Run test, verify it fails**

Run: `bun --env-file=.env test apps/api/src/routes.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement `apps/api/src/routes.ts`**

```ts
import { Elysia, t } from 'elysia'
import { quotaRepo, usageRepo } from './repositories'
import { type RangeKey, sinceFor } from './ranges'

const rangeQuery = t.Object({
  range: t.Optional(t.Union([t.Literal('today'), t.Literal('7d'), t.Literal('30d'), t.Literal('all')])),
})

export function buildApp() {
  return new Elysia({ prefix: '/api' })
    .get('/health', async () => {
      const latest = await usageRepo.summary(new Date(Date.now() - 600_000))
      return { ok: true, recentRequests: latest.requests }
    })
    .get(
      '/summary',
      ({ query }) => usageRepo.summary(sinceFor((query.range as RangeKey) ?? '7d')),
      { query: rangeQuery },
    )
    .get(
      '/usage/timeseries',
      ({ query }) =>
        usageRepo.timeseries({
          since: sinceFor((query.range as RangeKey) ?? '7d'),
          granularity: query.granularity === 'day' ? 'day' : 'hour',
        }),
      {
        query: t.Object({
          range: t.Optional(t.String()),
          granularity: t.Optional(t.Union([t.Literal('hour'), t.Literal('day')])),
        }),
      },
    )
    .get('/models', ({ query }) => usageRepo.byModel(sinceFor((query.range as RangeKey) ?? '7d')), {
      query: rangeQuery,
    })
    .get('/projects', ({ query }) => usageRepo.byProject(sinceFor((query.range as RangeKey) ?? '7d')), {
      query: rangeQuery,
    })
    .get('/sessions', () => usageRepo.recentSessions(25))
    .get('/blocks', ({ query }) => usageRepo.blocks(sinceFor((query.range as RangeKey) ?? '7d')), {
      query: rangeQuery,
    })
    .get('/quota', async () => {
      const q = await quotaRepo.latest()
      if (!q) return { connected: false }
      return {
        connected: true,
        capturedAt: q.capturedAt,
        stale: q.stale,
        fiveHour: { used: q.fiveHourUsed, limit: q.fiveHourLimit, resetsAt: q.fiveHourResetsAt },
        weekly: { used: q.weeklyUsed, limit: q.weeklyLimit, resetsAt: q.weeklyResetsAt },
        extraCredits: q.extraCredits,
        subscriptionType: q.subscriptionType,
        rateLimitTier: q.rateLimitTier,
      }
    })
    .get('/quota/history', ({ query }) => quotaRepo.history(sinceFor((query.range as RangeKey) ?? '7d')), {
      query: rangeQuery,
    })
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `bun --env-file=.env test apps/api/src/routes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Implement `apps/api/src/index.ts` (server wiring)**

```ts
import cors from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { Elysia } from 'elysia'
import pino from 'pino'
import { buildApp } from './routes'

const log = pino({ transport: { target: 'pino-pretty' } })
const port = Number(process.env.API_PORT) || 8787

new Elysia()
  .use(cors({ origin: ['http://localhost:5173'] }))
  .use(swagger({ path: '/swagger' }))
  .use(buildApp())
  .onError(({ error, code }) => {
    log.error({ err: error, code }, 'request error')
    return { error: 'internal' }
  })
  .listen({ hostname: '127.0.0.1', port })

log.info({ port }, 'api listening on http://127.0.0.1')
```

- [ ] **Step 7: Smoke-run the server**

Run (then Ctrl-C):
```bash
cd /home/homebrew/code/claude-utilization
bun --filter claude-util-api dev &
sleep 2
curl -s http://127.0.0.1:8787/api/health
curl -s "http://127.0.0.1:8787/api/summary?range=all"
kill %1
```
Expected: health JSON `{"ok":true,...}`; summary JSON with numbers.

- [ ] **Step 8: Commit**

```bash
git add apps/api
git commit -m "feat(api): elysia server, routes, swagger, cors"
```

---

## Task 11: `apps/web` — scaffold, theme, API client, polling store

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/api.ts`, `apps/web/src/store.ts`, `apps/web/src/format.ts`
- Test: `apps/web/src/format.test.ts`

**Interfaces:**
- Produces: `useDashboard()` zustand store that polls the API; typed `api` client; `fmtUsd`, `fmtTokens`, `fmtCountdown` formatters.

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "claude-util-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@harismawan/stamp-ui": "^0.4.7",
    "claude-util-shared": "workspace:*",
    "lucide-react": "^1.20.0",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "recharts": "^3.8.1",
    "styled-components": "^6.4.2",
    "zustand": "^5.0.14"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^6.0.2",
    "vite": "^8.0.14"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`, `vite.config.ts`, `index.html`**

`apps/web/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "jsx": "react-jsx" }, "include": ["src"] }
```

`apps/web/vite.config.ts`:
```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8787' } },
})
```

`apps/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claude Utilization</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Write failing test `apps/web/src/format.test.ts`**

```ts
import { describe, expect, it } from 'bun:test'
import { fmtCountdown, fmtTokens, fmtUsd } from './format'

describe('formatters', () => {
  it('formats usd', () => {
    expect(fmtUsd(1234.5)).toBe('$1,234.50')
    expect(fmtUsd(0.0123)).toBe('$0.0123')
  })
  it('formats tokens compactly', () => {
    expect(fmtTokens(1500)).toBe('1.5K')
    expect(fmtTokens(2_300_000)).toBe('2.3M')
  })
  it('formats a countdown', () => {
    expect(fmtCountdown(new Date(Date.now() + 90 * 60_000))).toMatch(/1h 30m|1h 29m/)
    expect(fmtCountdown(null)).toBe('—')
  })
})
```

- [ ] **Step 4: Run test, verify it fails, then implement `apps/web/src/format.ts`**

```ts
export function fmtUsd(n: number): string {
  if (n > 0 && n < 1) return `$${n.toPrecision(3)}`
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function fmtCountdown(target: Date | string | null): string {
  if (!target) return '—'
  const ms = new Date(target).getTime() - Date.now()
  if (ms <= 0) return 'now'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
```

Run: `bun test apps/web/src/format.test.ts` → Expected PASS (3 tests).

- [ ] **Step 5: Implement `apps/web/src/api.ts`**

```ts
const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export type Range = 'today' | '7d' | '30d' | 'all'

export interface Summary {
  costUsd: number; inputTokens: number; outputTokens: number;
  cacheReadTokens: number; cacheCreateTokens: number; requests: number; sessions: number
}
export interface TimePoint { bucket: string; model: string; costUsd: number; totalTokens: number }
export interface ModelRow { model: string; costUsd: number; totalTokens: number; requests: number }
export interface ProjectRow { projectPath: string; costUsd: number; totalTokens: number; requests: number }
export interface SessionRow {
  sessionId: string; projectPath: string; lastTs: string; requests: number; costUsd: number; totalTokens: number
}
export interface QuotaWindow { used: number; limit: number; resetsAt: string | null }
export type Quota =
  | { connected: false }
  | {
      connected: true; capturedAt: string; stale: boolean
      fiveHour: QuotaWindow; weekly: QuotaWindow
      extraCredits: number; subscriptionType: string | null; rateLimitTier: string | null
    }
export interface QuotaHistoryRow {
  capturedAt: string; fiveHourUsed: number; fiveHourLimit: number; weeklyUsed: number; weeklyLimit: number
}
export interface BlockRow {
  startTs: string; endTs: string; events: number; totalTokens: number; costUsd: number; active: boolean
}

export const api = {
  summary: (r: Range) => get<Summary>(`/summary?range=${r}`),
  timeseries: (r: Range, g: 'hour' | 'day') => get<TimePoint[]>(`/usage/timeseries?range=${r}&granularity=${g}`),
  models: (r: Range) => get<ModelRow[]>(`/models?range=${r}`),
  projects: (r: Range) => get<ProjectRow[]>(`/projects?range=${r}`),
  sessions: () => get<SessionRow[]>(`/sessions`),
  blocks: (r: Range) => get<BlockRow[]>(`/blocks?range=${r}`),
  quota: () => get<Quota>(`/quota`),
  quotaHistory: (r: Range) => get<QuotaHistoryRow[]>(`/quota/history?range=${r}`),
}
```

- [ ] **Step 6: Implement `apps/web/src/store.ts`**

```ts
import { create } from 'zustand'
import {
  api,
  type BlockRow,
  type ModelRow,
  type ProjectRow,
  type Quota,
  type QuotaHistoryRow,
  type Range,
  type SessionRow,
  type Summary,
  type TimePoint,
} from './api'

interface DashState {
  range: Range
  granularity: 'hour' | 'day'
  summary: Summary | null
  timeseries: TimePoint[]
  models: ModelRow[]
  projects: ProjectRow[]
  sessions: SessionRow[]
  blocks: BlockRow[]
  quota: Quota | null
  quotaHistory: QuotaHistoryRow[]
  loading: boolean
  error: string | null
  setRange: (r: Range) => void
  setGranularity: (g: 'hour' | 'day') => void
  refresh: () => Promise<void>
}

export const useDashboard = create<DashState>((set, getState) => ({
  range: '7d',
  granularity: 'day',
  summary: null,
  timeseries: [],
  models: [],
  projects: [],
  sessions: [],
  blocks: [],
  quota: null,
  quotaHistory: [],
  loading: false,
  error: null,
  setRange: (range) => {
    set({ range })
    void getState().refresh()
  },
  setGranularity: (granularity) => {
    set({ granularity })
    void getState().refresh()
  },
  refresh: async () => {
    const { range, granularity } = getState()
    set({ loading: true, error: null })
    try {
      const [summary, timeseries, models, projects, sessions, blocks, quota, quotaHistory] =
        await Promise.all([
          api.summary(range),
          api.timeseries(range, granularity),
          api.models(range),
          api.projects(range),
          api.sessions(),
          api.blocks(range),
          api.quota(),
          api.quotaHistory(range),
        ])
      set({ summary, timeseries, models, projects, sessions, blocks, quota, quotaHistory, loading: false })
    } catch (err) {
      set({ error: String(err), loading: false })
    }
  },
}))

export function startPolling(intervalMs = 20_000): () => void {
  void useDashboard.getState().refresh()
  const id = setInterval(() => void useDashboard.getState().refresh(), intervalMs)
  return () => clearInterval(id)
}
```

- [ ] **Step 7: Implement `apps/web/src/main.tsx` (provider) + placeholder `App.tsx`**

`apps/web/src/main.tsx`:
```tsx
import { StampProvider } from '@harismawan/stamp-ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StampProvider mode="dark">
      <App />
    </StampProvider>
  </StrictMode>,
)
```

`apps/web/src/App.tsx` (placeholder, replaced in Task 14):
```tsx
import { useEffect } from 'react'
import { startPolling, useDashboard } from './store'

export function App() {
  const summary = useDashboard((s) => s.summary)
  useEffect(() => startPolling(), [])
  return <pre>{JSON.stringify(summary, null, 2)}</pre>
}
```

- [ ] **Step 8: Install, typecheck, build, smoke**

Run:
```bash
cd /home/homebrew/code/claude-utilization
bun install
bun --filter claude-util-web build
```
Expected: `tsc --noEmit` passes, `vite build` produces `dist/`.

- [ ] **Step 9: Commit**

```bash
git add apps/web bun.lock
git commit -m "feat(web): scaffold, api client, polling store, formatters"
```

---

## Task 12: `apps/web` — chart + UI primitives

**Files:**
- Create: `apps/web/src/components/StatCard.tsx`, `apps/web/src/components/QuotaGauge.tsx`, `apps/web/src/components/UsageAreaChart.tsx`, `apps/web/src/components/CostDonut.tsx`, `apps/web/src/components/QuotaHistoryChart.tsx`

**Interfaces:**
- Consumes: `api` types, `colorForModel`/`ACCENTS`/`BRAND` (shared), `fmtUsd`/`fmtTokens`/`fmtCountdown`.
- Produces: presentational components consumed by pages in Task 13.

> These are presentational. The gate is `tsc --noEmit` + `vite build` (Step at end). Mirror receh's recharts usage (`ResponsiveContainer` wrappers, `Cell` colored slices).

- [ ] **Step 1: `apps/web/src/components/StatCard.tsx`**

```tsx
import { Card } from '@harismawan/stamp-ui'
import styled from 'styled-components'

const Label = styled.div`
  font-size: 0.8rem;
  color: ${(p) => p.theme.colors.textMuted};
`
const Value = styled.div`
  font-size: 1.6rem;
  font-weight: 700;
`
const Sub = styled.div`
  font-size: 0.75rem;
  color: ${(p) => p.theme.colors.textMuted};
`

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <Label>{label}</Label>
      <Value>{value}</Value>
      {sub ? <Sub>{sub}</Sub> : null}
    </Card>
  )
}
```

- [ ] **Step 2: `apps/web/src/components/QuotaGauge.tsx`**

```tsx
import { Progress } from '@harismawan/stamp-ui'
import { BRAND } from 'claude-util-shared'
import styled from 'styled-components'
import { fmtCountdown } from '../format'

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`
const Row = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
`
const Pct = styled.span<{ $danger: boolean }>`
  font-weight: 700;
  color: ${(p) => (p.$danger ? '#FF6B6B' : BRAND)};
`

export function QuotaGauge({
  title,
  used,
  limit,
  resetsAt,
}: {
  title: string
  used: number
  limit: number
  resetsAt: string | null
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  return (
    <Wrap>
      <Row>
        <span>{title}</span>
        <Pct $danger={pct >= 90}>{pct.toFixed(0)}%</Pct>
      </Row>
      <Progress value={pct} max={100} />
      <Row>
        <span>{limit > 0 ? `${used.toFixed(0)} / ${limit.toFixed(0)}` : 'no limit data'}</span>
        <span>resets {fmtCountdown(resetsAt)}</span>
      </Row>
    </Wrap>
  )
}
```

> **NOTE:** if stamp-ui `Progress` does not accept `value`/`max` props, check its signature in `node_modules/@harismawan/stamp-ui/src/components/Progress.tsx` and adapt (likely `value` is 0–100). Keep the percentage math here.

- [ ] **Step 3: `apps/web/src/components/UsageAreaChart.tsx`**

```tsx
import { colorForModel } from 'claude-util-shared'
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TimePoint } from '../api'

type Row = { bucket: string } & Record<string, number | string>

function pivot(points: TimePoint[], metric: 'costUsd' | 'totalTokens') {
  const byBucket = new Map<string, Row>()
  const models = new Set<string>()
  for (const p of points) {
    models.add(p.model)
    const row = byBucket.get(p.bucket) ?? { bucket: p.bucket }
    row[p.model] = ((row[p.model] as number) ?? 0) + p[metric]
    byBucket.set(p.bucket, row)
  }
  return { rows: [...byBucket.values()], models: [...models] }
}

export function UsageAreaChart({
  points,
  metric,
}: {
  points: TimePoint[]
  metric: 'costUsd' | 'totalTokens'
}) {
  const { rows, models } = pivot(points, metric)
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={rows}>
        <CartesianGrid strokeOpacity={0.1} />
        <XAxis dataKey="bucket" tickFormatter={(v: string) => v.slice(5, 16)} fontSize={11} />
        <YAxis fontSize={11} />
        <Tooltip />
        <Legend />
        {models.map((m) => (
          <Area key={m} type="monotone" dataKey={m} stackId="1" stroke={colorForModel(m)} fill={colorForModel(m)} fillOpacity={0.5} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 4: `apps/web/src/components/CostDonut.tsx`**

```tsx
import { colorForModel } from 'claude-util-shared'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { ModelRow } from '../api'

export function CostDonut({ models }: { models: ModelRow[] }) {
  const data = models.map((m) => ({ name: m.model, value: m.costUsd }))
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
          {data.map((d) => (
            <Cell key={d.name} fill={colorForModel(d.name)} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 5: `apps/web/src/components/QuotaHistoryChart.tsx`**

```tsx
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { QuotaHistoryRow } from '../api'

export function QuotaHistoryChart({ rows }: { rows: QuotaHistoryRow[] }) {
  const data = rows.map((r) => ({
    t: r.capturedAt.slice(5, 16),
    fiveHour: r.fiveHourLimit > 0 ? (r.fiveHourUsed / r.fiveHourLimit) * 100 : 0,
    weekly: r.weeklyLimit > 0 ? (r.weeklyUsed / r.weeklyLimit) * 100 : 0,
  }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeOpacity={0.1} />
        <XAxis dataKey="t" fontSize={11} />
        <YAxis domain={[0, 100]} fontSize={11} unit="%" />
        <Tooltip />
        <Line type="monotone" dataKey="fiveHour" stroke="#FFDE15" dot={false} name="5-hour %" />
        <Line type="monotone" dataKey="weekly" stroke="#28A6E0" dot={false} name="weekly %" />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 6: Typecheck + build gate**

Run: `bun --filter claude-util-web build`
Expected: passes (no type errors).

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): stat card, quota gauge, recharts components"
```

---

## Task 13: `apps/web` — dashboard layout + pages

**Files:**
- Create: `apps/web/src/components/Section.tsx`, `apps/web/src/sections/Overview.tsx`, `apps/web/src/sections/UsageGraph.tsx`, `apps/web/src/sections/Breakdown.tsx`, `apps/web/src/sections/QuotaHistory.tsx`, `apps/web/src/sections/Sessions.tsx`
- Modify: `apps/web/src/App.tsx` (replace placeholder)

**Interfaces:**
- Consumes: store, components (Task 12), `api` types, formatters.

- [ ] **Step 1: `apps/web/src/components/Section.tsx`**

```tsx
import styled from 'styled-components'

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
`
export const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 2rem;
`
export const SectionTitle = styled.h2`
  font-size: 1rem;
  margin: 0;
  color: ${(p) => p.theme.colors.text};
`
export const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  @media (max-width: 880px) {
    grid-template-columns: 1fr;
  }
`
```

- [ ] **Step 2: `apps/web/src/sections/Overview.tsx`**

```tsx
import { Card } from '@harismawan/stamp-ui'
import { useDashboard } from '../store'
import { fmtTokens, fmtUsd } from '../format'
import { StatCard } from '../components/StatCard'
import { QuotaGauge } from '../components/QuotaGauge'
import { Grid, Section, SectionTitle, TwoCol } from '../components/Section'

export function Overview() {
  const summary = useDashboard((s) => s.summary)
  const quota = useDashboard((s) => s.quota)
  const blocks = useDashboard((s) => s.blocks)
  const activeBlock = blocks.find((b) => b.active)

  return (
    <Section>
      <SectionTitle>Overview</SectionTitle>
      <Grid>
        <StatCard label="Value (range)" value={summary ? fmtUsd(summary.costUsd) : '—'} sub="API-equivalent" />
        <StatCard label="Tokens" value={summary ? fmtTokens(summary.inputTokens + summary.outputTokens + summary.cacheReadTokens + summary.cacheCreateTokens) : '—'} />
        <StatCard label="Requests" value={summary ? String(summary.requests) : '—'} />
        <StatCard label="Sessions" value={summary ? String(summary.sessions) : '—'} />
        <StatCard label="Active block burn" value={activeBlock ? fmtUsd(activeBlock.costUsd) : '$0.00'} sub={activeBlock ? `${activeBlock.events} reqs` : 'idle'} />
      </Grid>
      <TwoCol>
        <Card>
          {quota && quota.connected ? (
            <QuotaGauge title="5-hour window" used={quota.fiveHour.used} limit={quota.fiveHour.limit} resetsAt={quota.fiveHour.resetsAt} />
          ) : (
            <div>Quota not connected — local analytics only.</div>
          )}
        </Card>
        <Card>
          {quota && quota.connected ? (
            <QuotaGauge title="Weekly" used={quota.weekly.used} limit={quota.weekly.limit} resetsAt={quota.weekly.resetsAt} />
          ) : (
            <div>—</div>
          )}
        </Card>
      </TwoCol>
    </Section>
  )
}
```

- [ ] **Step 3: `apps/web/src/sections/UsageGraph.tsx`**

```tsx
import { Card, SegmentedControl } from '@harismawan/stamp-ui'
import { useState } from 'react'
import { UsageAreaChart } from '../components/UsageAreaChart'
import { Section, SectionTitle } from '../components/Section'
import { useDashboard } from '../store'

export function UsageGraph() {
  const points = useDashboard((s) => s.timeseries)
  const granularity = useDashboard((s) => s.granularity)
  const setGranularity = useDashboard((s) => s.setGranularity)
  const [metric, setMetric] = useState<'costUsd' | 'totalTokens'>('costUsd')

  return (
    <Section>
      <SectionTitle>Usage over time</SectionTitle>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <SegmentedControl
          value={metric}
          onChange={(v: string) => setMetric(v as 'costUsd' | 'totalTokens')}
          options={[
            { label: 'Value', value: 'costUsd' },
            { label: 'Tokens', value: 'totalTokens' },
          ]}
        />
        <SegmentedControl
          value={granularity}
          onChange={(v: string) => setGranularity(v as 'hour' | 'day')}
          options={[
            { label: 'Hourly', value: 'hour' },
            { label: 'Daily', value: 'day' },
          ]}
        />
      </div>
      <Card>
        <UsageAreaChart points={points} metric={metric} />
      </Card>
    </Section>
  )
}
```

> **NOTE:** if stamp-ui `SegmentedControl` prop names differ, inspect `node_modules/@harismawan/stamp-ui/src/components/SegmentedControl.tsx` and adapt the `value`/`onChange`/`options` mapping; keep the two controls.

- [ ] **Step 4: `apps/web/src/sections/Breakdown.tsx`**

```tsx
import { Card, DataTable } from '@harismawan/stamp-ui'
import { CostDonut } from '../components/CostDonut'
import { fmtTokens, fmtUsd } from '../format'
import { Section, SectionTitle, TwoCol } from '../components/Section'
import { useDashboard } from '../store'

export function Breakdown() {
  const models = useDashboard((s) => s.models)
  const projects = useDashboard((s) => s.projects)

  return (
    <Section>
      <SectionTitle>Breakdown</SectionTitle>
      <TwoCol>
        <Card>
          <CostDonut models={models} />
        </Card>
        <Card>
          <DataTable
            data={models}
            columns={[
              { key: 'model', header: 'Model' },
              { key: 'costUsd', header: 'Value', render: (r: (typeof models)[number]) => fmtUsd(r.costUsd) },
              { key: 'totalTokens', header: 'Tokens', render: (r: (typeof models)[number]) => fmtTokens(r.totalTokens) },
              { key: 'requests', header: 'Reqs' },
            ]}
          />
        </Card>
      </TwoCol>
      <Card>
        <DataTable
          data={projects}
          columns={[
            { key: 'projectPath', header: 'Project' },
            { key: 'costUsd', header: 'Value', render: (r: (typeof projects)[number]) => fmtUsd(r.costUsd) },
            { key: 'totalTokens', header: 'Tokens', render: (r: (typeof projects)[number]) => fmtTokens(r.totalTokens) },
            { key: 'requests', header: 'Reqs' },
          ]}
        />
      </Card>
    </Section>
  )
}
```

> **NOTE:** `DataTable` column API may differ in stamp-ui. Inspect `node_modules/@harismawan/stamp-ui/src/components/DataTable.tsx`. If it has no `render`, fall back to pre-formatting the data into display strings before passing to `data`. Keep the same columns.

- [ ] **Step 5: `apps/web/src/sections/QuotaHistory.tsx`**

```tsx
import { Card } from '@harismawan/stamp-ui'
import { QuotaHistoryChart } from '../components/QuotaHistoryChart'
import { Section, SectionTitle } from '../components/Section'
import { useDashboard } from '../store'

export function QuotaHistory() {
  const rows = useDashboard((s) => s.quotaHistory)
  if (rows.length === 0) return null
  return (
    <Section>
      <SectionTitle>Quota history</SectionTitle>
      <Card>
        <QuotaHistoryChart rows={rows} />
      </Card>
    </Section>
  )
}
```

- [ ] **Step 6: `apps/web/src/sections/Sessions.tsx`**

```tsx
import { Card, DataTable } from '@harismawan/stamp-ui'
import { fmtTokens, fmtUsd } from '../format'
import { Section, SectionTitle } from '../components/Section'
import { useDashboard } from '../store'

export function Sessions() {
  const sessions = useDashboard((s) => s.sessions)
  return (
    <Section>
      <SectionTitle>Recent sessions</SectionTitle>
      <Card>
        <DataTable
          data={sessions.map((s) => ({
            ...s,
            value: fmtUsd(s.costUsd),
            tokens: fmtTokens(s.totalTokens),
            when: new Date(s.lastTs).toLocaleString(),
          }))}
          columns={[
            { key: 'projectPath', header: 'Project' },
            { key: 'when', header: 'Last activity' },
            { key: 'requests', header: 'Reqs' },
            { key: 'tokens', header: 'Tokens' },
            { key: 'value', header: 'Value' },
          ]}
        />
      </Card>
    </Section>
  )
}
```

- [ ] **Step 7: Build gate + commit**

Run: `bun --filter claude-util-web build`
Expected: passes.

```bash
git add apps/web
git commit -m "feat(web): overview, usage graph, breakdown, quota history, sessions sections"
```

---

## Task 14: `apps/web` — App shell (header, nav, dark mode, staleness)

**Files:**
- Modify: `apps/web/src/App.tsx`, `apps/web/src/main.tsx`

**Interfaces:**
- Consumes: all sections (Task 13), store, stamp-ui `TopNav`/`Badge`/`useThemeStore`.

- [ ] **Step 1: Replace `apps/web/src/App.tsx`**

```tsx
import { Badge } from '@harismawan/stamp-ui'
import { useEffect } from 'react'
import styled from 'styled-components'
import { Breakdown } from './sections/Breakdown'
import { Overview } from './sections/Overview'
import { QuotaHistory } from './sections/QuotaHistory'
import { Sessions } from './sections/Sessions'
import { UsageGraph } from './sections/UsageGraph'
import { startPolling, useDashboard } from './store'

const Shell = styled.div`
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem;
`
const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
`
const Brand = styled.h1`
  font-size: 1.25rem;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  &::before {
    content: '';
    width: 14px;
    height: 14px;
    border-radius: 4px;
    background: #ffde15;
  }
`
const Right = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
`
const Dot = styled.span<{ $stale: boolean }>`
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: ${(p) => (p.$stale ? '#FF9F43' : '#1FAB6E')};
  display: inline-block;
`
const RangeBtns = styled.div`
  display: flex;
  gap: 0.25rem;
`
const RangeBtn = styled.button<{ $active: boolean }>`
  background: ${(p) => (p.$active ? '#FFDE15' : 'transparent')};
  color: ${(p) => (p.$active ? '#111' : p.theme.colors.text)};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: 6px;
  padding: 0.25rem 0.6rem;
  cursor: pointer;
`

const RANGES = ['today', '7d', '30d', 'all'] as const

export function App() {
  const range = useDashboard((s) => s.range)
  const setRange = useDashboard((s) => s.setRange)
  const quota = useDashboard((s) => s.quota)
  const error = useDashboard((s) => s.error)
  useEffect(() => startPolling(), [])

  const connected = quota?.connected === true
  const stale = connected ? quota.stale : false
  const tier = connected ? quota.subscriptionType : null

  return (
    <Shell>
      <Header>
        <Brand>Claude Utilization</Brand>
        <Right>
          {tier ? <Badge>{tier.toUpperCase()}</Badge> : null}
          <RangeBtns>
            {RANGES.map((r) => (
              <RangeBtn key={r} $active={range === r} onClick={() => setRange(r)}>
                {r}
              </RangeBtn>
            ))}
          </RangeBtns>
          <span>
            <Dot $stale={stale} /> {connected ? (stale ? 'stale' : 'live') : 'no quota'}
          </span>
        </Right>
      </Header>
      {error ? <div style={{ color: '#FF6B6B', marginBottom: '1rem' }}>API error: {error}</div> : null}
      <Overview />
      <UsageGraph />
      <Breakdown />
      <QuotaHistory />
      <Sessions />
    </Shell>
  )
}
```

- [ ] **Step 2: Build gate**

Run: `bun --filter claude-util-web build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web
git commit -m "feat(web): app shell with header, range switch, staleness indicator"
```

---

## Task 15: End-to-end wiring, README, full verification

**Files:**
- Create: `README.md` (replace scaffold stub), `scripts/dev.sh`
- Modify: root `package.json` (add `dev` convenience script)

**Interfaces:** none new — this task proves the whole system runs.

- [ ] **Step 1: Add root `dev` script to `package.json` scripts**

```json
"dev": "bun run dev:api & bun run dev:ingestor & bun run dev:web & wait"
```

- [ ] **Step 2: Create `scripts/dev.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d
bun --filter claude-util-api db:migrate || true
exec bun run dev
```

- [ ] **Step 3: Write `README.md`**

````markdown
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
````

- [ ] **Step 4: Full-stack verification**

Run:
```bash
cd /home/homebrew/code/claude-utilization
docker compose up -d
bun --filter claude-util-api db:migrate || true
# terminal A
bun --filter claude-util-ingestor dev &
sleep 15   # let it ingest a batch
# terminal B
bun --filter claude-util-api dev &
sleep 3
curl -s "http://127.0.0.1:8787/api/summary?range=all" | head -c 300
curl -s "http://127.0.0.1:8787/api/models?range=all" | head -c 300
curl -s "http://127.0.0.1:8787/api/quota" | head -c 300
```
Expected:
- `/api/summary` shows non-zero `requests` and `costUsd` (real logs ingested).
- `/api/models` lists real model ids.
- `/api/quota` shows `connected:true` with non-zero limits (if creds present) OR `connected:false`.

- [ ] **Step 5: Web smoke**

Run: `bun --filter claude-util-web dev` then open http://localhost:5173.
Expected: Overview cards populate, usage chart renders stacked model areas, quota gauges show percentages + reset countdown, breakdown donut/tables render.

Fix any stamp-ui prop mismatches flagged in Task 12–13 NOTES at this point (inspect the component source under `node_modules/@harismawan/stamp-ui/src/components/`).

- [ ] **Step 6: Run the whole test suite + lint**

Run:
```bash
bun --env-file=.env test
bun run lint
```
Expected: all tests pass; lint clean (fix with `bun run lint:fix`).

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: end-to-end wiring, dev scripts, README"
```

---

## Self-Review

**Spec coverage:**
- Stack mirror (Bun/Elysia/Prisma/Postgres/Vite/React/stamp-ui/recharts/TS) → Tasks 1, 5, 11.
- Two-pillar data (local logs + OAuth quota) → Tasks 3/8 (logs), 7/9 (quota).
- OAuth 429 fragility (ingestor-only, gentle poll, backoff, cache) → Task 9 loop + `pollQuotaOnce` stale path.
- Token refresh, read-only creds, DB cache → Task 7 + Task 9 (`oauthRepo` prefer-fresher).
- Data model (UsageEvent/IngestCursor/QuotaSnapshot/OAuthState) → Task 5.
- Pricing + value framing → Task 2 + UI labels "Value" (Tasks 12–14).
- Endpoints (summary/timeseries/quota/history/models/projects/sessions/blocks/health) → Task 10.
- Dashboard sections (overview+gauges, usage graph, breakdown, quota history, sessions, header/tier/staleness) → Tasks 12–14.
- Theme (receh palette, dark mode) → Task 4 `theme.ts`, Tasks 12–14.
- Error handling (429 stale, missing creds, malformed JSONL, unknown model) → Tasks 2/3/8/9 + UI not-connected/stale states.
- Security (localhost bind, CORS, no tokens to browser) → Task 10.
- Testing (pricing/parse/blocks/quota/refresh unit; repo+routes integration; fixtures) → Tasks 2–10.

**Placeholder scan:** No "TBD"/"add error handling" placeholders — every code step has full code. The two genuine unknowns (OAuth response keys, `client_id`) are handled by a dual-tolerant normalizer + a live-verification step (Task 9 Step 6) that adjusts concrete values, not by deferring code.

**Type consistency:** `ParsedUsageEvent`, `NormalizedQuota`, `Block`, repo row types, and `api.ts` DTOs use identical field names across producer (shared/api) and consumer (ingestor/web). `usageRepo`/`quotaRepo`/`cursorRepo`/`oauthRepo` names consistent Tasks 6→8→9→10. Web `api.ts` interfaces mirror the API route return shapes from Task 10.
