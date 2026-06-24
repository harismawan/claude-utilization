import { computeEventCostUsd } from './pricing'

export interface ParsedUsageEvent {
  requestId: string
  lineUuid: string
  ts: Date
  sessionId: string
  projectPath: string
  gitBranch: string | null
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreate1hTokens: number
  cacheCreate5mTokens: number
  cacheReadTokens: number
  webSearchCount: number
  webFetchCount: number
  serviceTier: string | null
  costUsd: number
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function parseUsageLine(raw: string, projectPath: string): ParsedUsageEvent | null {
  let d: any
  try {
    d = JSON.parse(raw)
  } catch {
    return null
  }
  if (!d || d.type !== 'assistant') return null
  const msg = d.message
  const usage = msg?.usage
  if (!usage || typeof msg.model !== 'string') return null
  const uuid = d.uuid
  if (typeof uuid !== 'string') return null

  const inputTokens = num(usage.input_tokens)
  const outputTokens = num(usage.output_tokens)
  const cacheReadTokens = num(usage.cache_read_input_tokens)
  const cacheCreate1hTokens = num(usage.cache_creation?.ephemeral_1h_input_tokens)
  const cacheCreate5mTokens = num(usage.cache_creation?.ephemeral_5m_input_tokens)
  // If split not present, attribute the lump sum to 5m bucket.
  const lumpCreate = num(usage.cache_creation_input_tokens)
  const create5m =
    cacheCreate1hTokens + cacheCreate5mTokens === 0 ? lumpCreate : cacheCreate5mTokens
  const webSearchCount = num(usage.server_tool_use?.web_search_requests)
  const webFetchCount = num(usage.server_tool_use?.web_fetch_requests)
  const model = msg.model

  const costUsd = computeEventCostUsd({
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreate1hTokens,
    cacheCreate5mTokens: create5m,
    webSearchCount,
    webFetchCount,
  })

  return {
    requestId: typeof d.requestId === 'string' ? d.requestId : uuid,
    lineUuid: uuid,
    ts: new Date(d.timestamp),
    sessionId: typeof d.sessionId === 'string' ? d.sessionId : 'unknown',
    projectPath: typeof d.cwd === 'string' ? d.cwd : projectPath,
    gitBranch: typeof d.gitBranch === 'string' ? d.gitBranch : null,
    model,
    inputTokens,
    outputTokens,
    cacheCreate1hTokens,
    cacheCreate5mTokens: create5m,
    cacheReadTokens,
    webSearchCount,
    webFetchCount,
    serviceTier: typeof usage.service_tier === 'string' ? usage.service_tier : null,
    costUsd,
  }
}
