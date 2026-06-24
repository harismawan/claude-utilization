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
