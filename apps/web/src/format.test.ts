import { describe, expect, it } from 'bun:test'
import { fmtCountdown, fmtTokens, fmtUsd } from './format'

describe('formatters', () => {
  it('formats usd', () => {
    expect(fmtUsd(1234.5)).toBe('$1,234.50')
    expect(fmtUsd(0.0123)).toBe('$0.0123')
  })
  it('formats tokens compactly', () => {
    expect(fmtTokens(1500)).toBe('1.5K')
    expect(fmtTokens(2_300_000)).toBe('2.3M')
  })
  it('formats a countdown', () => {
    expect(fmtCountdown(new Date(Date.now() + 90 * 60_000))).toMatch(/1h 30m|1h 29m/)
    expect(fmtCountdown(null)).toBe('—')
  })
})
