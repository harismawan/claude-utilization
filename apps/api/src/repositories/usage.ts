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
export interface TimePoint {
  bucket: string
  model: string
  costUsd: number
  totalTokens: number
}
export interface ModelRow {
  model: string
  costUsd: number
  totalTokens: number
  requests: number
}
export interface ProjectRow {
  projectPath: string
  costUsd: number
  totalTokens: number
  requests: number
}
export interface SessionRow {
  sessionId: string
  projectPath: string
  lastTs: string
  requests: number
  costUsd: number
  totalTokens: number
}

// Per-column token sums returned by Prisma aggregate/groupBy.
type TokenSums = {
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheCreate1hTokens: number | null
  cacheCreate5mTokens: number | null
}
const sumTokens = (s: TokenSums): number =>
  (s.inputTokens ?? 0) +
  (s.outputTokens ?? 0) +
  (s.cacheReadTokens ?? 0) +
  (s.cacheCreate1hTokens ?? 0) +
  (s.cacheCreate5mTokens ?? 0)

const TOKEN_AND_COST_SUM = {
  costUsd: true,
  inputTokens: true,
  outputTokens: true,
  cacheReadTokens: true,
  cacheCreate1hTokens: true,
  cacheCreate5mTokens: true,
} as const

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const dedupeKey = (e: { requestId: string; lineUuid: string }) => `${e.requestId} ${e.lineUuid}`

export const usageRepo = {
  // Portable insert-if-new: pre-filter against existing (requestId, lineUuid)
  // pairs, then plain createMany. Avoids createMany's `skipDuplicates`, which
  // Postgres supports but SQLite does not. Safe because the ingestor is the
  // only writer (no concurrent inserter can race between the check and insert).
  async upsertEvents(events: ParsedUsageEvent[]): Promise<number> {
    if (events.length === 0) return 0

    const seen = new Set<string>()
    for (const group of chunk(events, 500)) {
      const existing = await db.usageEvent.findMany({
        where: { OR: group.map((e) => ({ requestId: e.requestId, lineUuid: e.lineUuid })) },
        select: { requestId: true, lineUuid: true },
      })
      for (const e of existing) seen.add(dedupeKey(e))
    }

    const fresh: ParsedUsageEvent[] = []
    for (const e of events) {
      const k = dedupeKey(e)
      if (seen.has(k)) continue
      seen.add(k) // also dedupes repeats within this batch
      fresh.push(e)
    }
    if (fresh.length === 0) return 0

    await db.usageEvent.createMany({
      data: fresh.map((e) => ({
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
    })
    return fresh.length
  },

  async summary(since: Date): Promise<SummaryRow> {
    const where = { ts: { gte: since } }
    const [agg, sessions] = await Promise.all([
      db.usageEvent.aggregate({ where, _sum: TOKEN_AND_COST_SUM, _count: { _all: true } }),
      db.usageEvent.groupBy({ by: ['sessionId'], where }),
    ])
    return {
      costUsd: agg._sum.costUsd ?? 0,
      inputTokens: agg._sum.inputTokens ?? 0,
      outputTokens: agg._sum.outputTokens ?? 0,
      cacheReadTokens: agg._sum.cacheReadTokens ?? 0,
      cacheCreateTokens: (agg._sum.cacheCreate1hTokens ?? 0) + (agg._sum.cacheCreate5mTokens ?? 0),
      requests: agg._count._all,
      sessions: sessions.length,
    }
  },

  // Bucket in JS (truncate the UTC instant to hour/day) so we avoid dialect
  // date functions (Postgres date_trunc has no SQLite equivalent).
  async timeseries(opts: { since: Date; granularity: 'hour' | 'day' }): Promise<TimePoint[]> {
    const rows = await db.usageEvent.findMany({
      where: { ts: { gte: opts.since } },
      select: {
        ts: true,
        model: true,
        costUsd: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheCreate1hTokens: true,
        cacheCreate5mTokens: true,
      },
      orderBy: { ts: 'asc' },
    })
    const byKey = new Map<string, TimePoint>()
    for (const r of rows) {
      const d = new Date(r.ts)
      if (opts.granularity === 'hour') d.setUTCMinutes(0, 0, 0)
      else d.setUTCHours(0, 0, 0, 0)
      const bucket = d.toISOString()
      const key = `${bucket} ${r.model}`
      const tokens =
        r.inputTokens +
        r.outputTokens +
        r.cacheReadTokens +
        r.cacheCreate1hTokens +
        r.cacheCreate5mTokens
      const point = byKey.get(key)
      if (point) {
        point.costUsd += r.costUsd
        point.totalTokens += tokens
      } else {
        byKey.set(key, { bucket, model: r.model, costUsd: r.costUsd, totalTokens: tokens })
      }
    }
    return [...byKey.values()].sort((a, b) =>
      a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0,
    )
  },

  async byModel(since: Date): Promise<ModelRow[]> {
    const grouped = await db.usageEvent.groupBy({
      by: ['model'],
      where: { ts: { gte: since } },
      _sum: TOKEN_AND_COST_SUM,
      _count: { _all: true },
    })
    return grouped
      .map((g) => ({
        model: g.model,
        costUsd: g._sum.costUsd ?? 0,
        totalTokens: sumTokens(g._sum),
        requests: g._count._all,
      }))
      .sort((a, b) => b.costUsd - a.costUsd)
  },

  async byProject(since: Date): Promise<ProjectRow[]> {
    const grouped = await db.usageEvent.groupBy({
      by: ['projectPath'],
      where: { ts: { gte: since } },
      _sum: TOKEN_AND_COST_SUM,
      _count: { _all: true },
    })
    return grouped
      .map((g) => ({
        projectPath: g.projectPath,
        costUsd: g._sum.costUsd ?? 0,
        totalTokens: sumTokens(g._sum),
        requests: g._count._all,
      }))
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, 50)
  },

  async recentSessions(limit: number): Promise<SessionRow[]> {
    const grouped = await db.usageEvent.groupBy({
      by: ['sessionId'],
      _max: { ts: true, projectPath: true },
      _sum: TOKEN_AND_COST_SUM,
      _count: { _all: true },
      orderBy: { _max: { ts: 'desc' } },
      take: limit,
    })
    return grouped.map((g) => ({
      sessionId: g.sessionId,
      projectPath: g._max.projectPath ?? '',
      lastTs: (g._max.ts ?? new Date(0)).toISOString(),
      requests: g._count._all,
      costUsd: g._sum.costUsd ?? 0,
      totalTokens: sumTokens(g._sum),
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
          r.inputTokens +
          r.outputTokens +
          r.cacheReadTokens +
          r.cacheCreate1hTokens +
          r.cacheCreate5mTokens,
      })),
    )
  },
}
