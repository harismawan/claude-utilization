export interface ModelRate {
  input: number // USD per 1M input tokens
  output: number // USD per 1M output tokens
}

export const MODEL_RATES: Record<string, ModelRate> = {
  'claude-fable-5': { input: 10, output: 50 },
  'claude-mythos-5': { input: 10, output: 50 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}

export const CACHE_READ_MULT = 0.1
export const CACHE_WRITE_5M_MULT = 1.25
export const CACHE_WRITE_1H_MULT = 2
export const WEB_SEARCH_COST = 0.01
export const WEB_FETCH_COST = 0

export interface CostInput {
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreate5mTokens: number
  cacheCreate1hTokens: number
  cacheReadTokens: number
  webSearchCount?: number
  webFetchCount?: number
}

const PER_TOKEN = 1 / 1_000_000

export function computeEventCostUsd(e: CostInput): number {
  const rate = MODEL_RATES[e.model]
  if (!rate) return 0
  const tokenCost =
    e.inputTokens * rate.input * PER_TOKEN +
    e.outputTokens * rate.output * PER_TOKEN +
    e.cacheReadTokens * rate.input * CACHE_READ_MULT * PER_TOKEN +
    e.cacheCreate5mTokens * rate.input * CACHE_WRITE_5M_MULT * PER_TOKEN +
    e.cacheCreate1hTokens * rate.input * CACHE_WRITE_1H_MULT * PER_TOKEN
  const toolCost =
    (e.webSearchCount ?? 0) * WEB_SEARCH_COST + (e.webFetchCount ?? 0) * WEB_FETCH_COST
  return tokenCost + toolCost
}
