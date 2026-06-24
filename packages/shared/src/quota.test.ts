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
