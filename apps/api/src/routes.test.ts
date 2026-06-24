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
