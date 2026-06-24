import { homedir } from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import { pollQuotaOnce } from './quota'
import { ingestOnce } from './tailer'

const log = pino({ transport: { target: 'pino-pretty' } })
const CLAUDE_DIR = process.env.CLAUDE_DIR || join(homedir(), '.claude')
const LOG_INTERVAL_MS = 10_000
const QUOTA_BASE_MS = 120_000

async function logLoop() {
  for (;;) {
    try {
      const r = await ingestOnce(CLAUDE_DIR)
      if (r.events) log.info({ files: r.files, events: r.events }, 'ingested')
    } catch (err) {
      log.error({ err }, 'ingest failed')
    }
    await Bun.sleep(LOG_INTERVAL_MS)
  }
}

async function quotaLoop() {
  let backoff = QUOTA_BASE_MS
  for (;;) {
    let wait = QUOTA_BASE_MS
    try {
      const status = await pollQuotaOnce(CLAUDE_DIR)
      if (status === 'stale') {
        backoff = Math.min(backoff * 2, 30 * 60_000)
        wait = backoff
        log.warn({ wait }, 'quota stale (429/fail) — backing off')
      } else {
        backoff = QUOTA_BASE_MS
        if (status === 'no-creds') log.warn('no .credentials.json — quota disabled')
      }
    } catch (err) {
      log.error({ err }, 'quota poll failed')
    }
    await Bun.sleep(wait)
  }
}

log.info({ CLAUDE_DIR }, 'ingestor starting')
await Promise.all([logLoop(), quotaLoop()])
