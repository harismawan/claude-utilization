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
