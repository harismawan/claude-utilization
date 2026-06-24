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
