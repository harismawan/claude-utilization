import { describe, expect, it } from 'bun:test'
import { computeBlocks } from './blocks'

const t = (iso: string) => new Date(iso)

describe('computeBlocks', () => {
  it('groups events within a 5h window into one block', () => {
    const blocks = computeBlocks(
      [
        { ts: t('2026-06-12T09:00:00Z'), totalTokens: 100, costUsd: 1 },
        { ts: t('2026-06-12T11:00:00Z'), totalTokens: 50, costUsd: 0.5 },
      ],
      t('2026-06-12T12:00:00Z'),
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.events).toBe(2)
    expect(blocks[0]!.totalTokens).toBe(150)
    expect(blocks[0]!.costUsd).toBeCloseTo(1.5, 6)
    expect(blocks[0]!.active).toBe(true) // now < start+5h
  })

  it('starts a new block when an event is >5h after the block start', () => {
    const blocks = computeBlocks(
      [
        { ts: t('2026-06-12T09:00:00Z'), totalTokens: 1, costUsd: 0 },
        { ts: t('2026-06-12T15:30:00Z'), totalTokens: 1, costUsd: 0 },
      ],
      t('2026-06-12T16:00:00Z'),
    )
    expect(blocks).toHaveLength(2)
    expect(blocks[0]!.active).toBe(false)
    expect(blocks[1]!.active).toBe(true)
  })
})
