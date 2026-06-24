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
