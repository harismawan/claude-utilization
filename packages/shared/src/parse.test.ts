import { describe, expect, it } from 'bun:test'
import { parseUsageLine } from './parse'

const ASSISTANT =
  '{"type":"assistant","uuid":"u-1","requestId":"req-1","timestamp":"2026-06-12T09:04:59.662Z","sessionId":"sess-1","cwd":"/home/u/code/tokoshi","gitBranch":"main","message":{"model":"claude-opus-4-8","usage":{"input_tokens":7706,"output_tokens":369,"cache_read_input_tokens":0,"cache_creation_input_tokens":24291,"cache_creation":{"ephemeral_1h_input_tokens":24291,"ephemeral_5m_input_tokens":0},"server_tool_use":{"web_search_requests":2,"web_fetch_requests":0},"service_tier":"standard"}}}'

describe('parseUsageLine', () => {
  it('parses an assistant usage line into a normalized event', () => {
    const e = parseUsageLine(ASSISTANT, '/proj')!
    expect(e.requestId).toBe('req-1')
    expect(e.lineUuid).toBe('u-1')
    expect(e.model).toBe('claude-opus-4-8')
    expect(e.inputTokens).toBe(7706)
    expect(e.outputTokens).toBe(369)
    expect(e.cacheCreate1hTokens).toBe(24291)
    expect(e.cacheCreate5mTokens).toBe(0)
    expect(e.webSearchCount).toBe(2)
    expect(e.gitBranch).toBe('main')
    expect(e.projectPath).toBe('/home/u/code/tokoshi') // prefers cwd over arg
    expect(e.costUsd).toBeGreaterThan(0)
    expect(e.ts.toISOString()).toBe('2026-06-12T09:04:59.662Z')
  })

  it('returns null for a user line (no usage)', () => {
    expect(
      parseUsageLine('{"type":"user","uuid":"u-2","message":{"role":"user"}}', '/p'),
    ).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseUsageLine('{not json', '/p')).toBeNull()
  })

  it('falls back to projectPath arg when cwd absent', () => {
    const line =
      '{"type":"assistant","uuid":"u-3","requestId":"r3","timestamp":"2026-06-12T00:00:00.000Z","sessionId":"s","message":{"model":"claude-haiku-4-5","usage":{"input_tokens":1,"output_tokens":1}}}'
    expect(parseUsageLine(line, '/fallback')!.projectPath).toBe('/fallback')
  })
})
