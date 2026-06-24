import { describe, expect, it } from 'bun:test'
import { computeEventCostUsd } from './pricing'

describe('computeEventCostUsd', () => {
  it('prices opus 4.8 input+output at $5/$25 per 1M', () => {
    const cost = computeEventCostUsd({
      model: 'claude-opus-4-8',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheCreate5mTokens: 0,
      cacheCreate1hTokens: 0,
      cacheReadTokens: 0,
    })
    expect(cost).toBeCloseTo(30, 6)
  })

  it('applies cache multipliers (read 0.1x, 5m write 1.25x, 1h write 2x of input rate)', () => {
    const cost = computeEventCostUsd({
      model: 'claude-opus-4-8',
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheCreate5mTokens: 1_000_000,
      cacheCreate1hTokens: 1_000_000,
    })
    // 5 * (0.1 + 1.25 + 2) = 16.75
    expect(cost).toBeCloseTo(16.75, 6)
  })

  it('adds $0.01 per web search and $0 per web fetch', () => {
    const cost = computeEventCostUsd({
      model: 'claude-haiku-4-5',
      inputTokens: 0,
      outputTokens: 0,
      cacheCreate5mTokens: 0,
      cacheCreate1hTokens: 0,
      cacheReadTokens: 0,
      webSearchCount: 3,
      webFetchCount: 5,
    })
    expect(cost).toBeCloseTo(0.03, 6)
  })

  it('returns 0 for unknown model', () => {
    const cost = computeEventCostUsd({
      model: 'claude-unknown-9',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheCreate5mTokens: 0,
      cacheCreate1hTokens: 0,
      cacheReadTokens: 0,
    })
    expect(cost).toBe(0)
  })
})
