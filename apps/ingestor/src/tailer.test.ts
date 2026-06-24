import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { db } from 'claude-util-api/db'
import { ingestOnce } from './tailer'

const LINE = (uuid: string, req: string) =>
  `{"type":"assistant","uuid":"${uuid}","requestId":"${req}","timestamp":"2026-06-12T09:00:00.000Z","sessionId":"s","cwd":"/proj","message":{"model":"claude-haiku-4-5","usage":{"input_tokens":10,"output_tokens":2}}}\n`

let dir: string
beforeAll(async () => {
  await db.usageEvent.deleteMany()
  await db.ingestCursor.deleteMany()
  dir = mkdtempSync(join(tmpdir(), 'cu-'))
  const proj = join(dir, 'projects', '-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(proj, 'a.jsonl'), LINE('u1', 'r1'))
})
afterAll(async () => {
  await db.usageEvent.deleteMany()
  await db.ingestCursor.deleteMany()
})

describe('ingestOnce', () => {
  it('ingests new lines and is idempotent on re-run', async () => {
    const first = await ingestOnce(dir)
    expect(first.events).toBe(1)
    const second = await ingestOnce(dir) // no new bytes
    expect(second.events).toBe(0)
    expect(await db.usageEvent.count()).toBe(1)
  })

  it('ingests appended lines only', async () => {
    const proj = join(dir, 'projects', '-proj')
    appendFileSync(join(proj, 'a.jsonl'), LINE('u2', 'r2'))
    const res = await ingestOnce(dir)
    expect(res.events).toBe(1)
    expect(await db.usageEvent.count()).toBe(2)
  })
})
