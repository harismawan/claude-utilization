import { Elysia, t } from 'elysia'
import { type RangeKey, sinceFor } from './ranges'
import { quotaRepo, usageRepo } from './repositories'

const rangeQuery = t.Object({
  range: t.Optional(
    t.Union([t.Literal('today'), t.Literal('7d'), t.Literal('30d'), t.Literal('all')]),
  ),
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
    .get(
      '/projects',
      ({ query }) => usageRepo.byProject(sinceFor((query.range as RangeKey) ?? '7d')),
      {
        query: rangeQuery,
      },
    )
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
    .get(
      '/quota/history',
      ({ query }) => quotaRepo.history(sinceFor((query.range as RangeKey) ?? '7d')),
      {
        query: rangeQuery,
      },
    )
}
