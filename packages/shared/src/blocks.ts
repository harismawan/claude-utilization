export interface BlockInput {
  ts: Date
  totalTokens: number
  costUsd: number
}

export interface Block {
  startTs: Date
  endTs: Date
  events: number
  totalTokens: number
  costUsd: number
  active: boolean
}

const FIVE_HOURS = 5 * 60 * 60 * 1000

export function computeBlocks(events: BlockInput[], now = new Date(), windowMs = FIVE_HOURS): Block[] {
  const sorted = [...events].sort((a, b) => a.ts.getTime() - b.ts.getTime())
  const blocks: Block[] = []
  let cur: Block | null = null
  for (const e of sorted) {
    if (!cur || e.ts.getTime() - cur.startTs.getTime() > windowMs) {
      cur = {
        startTs: e.ts,
        endTs: new Date(e.ts.getTime() + windowMs),
        events: 0,
        totalTokens: 0,
        costUsd: 0,
        active: false,
      }
      blocks.push(cur)
    }
    cur.events += 1
    cur.totalTokens += e.totalTokens
    cur.costUsd += e.costUsd
  }
  for (const b of blocks) b.active = now.getTime() < b.endTs.getTime()
  return blocks
}
