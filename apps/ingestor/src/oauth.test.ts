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
