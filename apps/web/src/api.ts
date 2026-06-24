const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export type Range = 'today' | '7d' | '30d' | 'all'

export interface Summary {
  costUsd: number; inputTokens: number; outputTokens: number;
  cacheReadTokens: number; cacheCreateTokens: number; requests: number; sessions: number
}
export interface TimePoint { bucket: string; model: string; costUsd: number; totalTokens: number }
export interface ModelRow { model: string; costUsd: number; totalTokens: number; requests: number }
export interface ProjectRow { projectPath: string; costUsd: number; totalTokens: number; requests: number }
export interface SessionRow {
  sessionId: string; projectPath: string; lastTs: string; requests: number; costUsd: number; totalTokens: number
}
export interface QuotaWindow { used: number; limit: number; resetsAt: string | null }
export type Quota =
  | { connected: false }
  | {
      connected: true; capturedAt: string; stale: boolean
      fiveHour: QuotaWindow; weekly: QuotaWindow
      extraCredits: number; subscriptionType: string | null; rateLimitTier: string | null
    }
export interface QuotaHistoryRow {
  capturedAt: string; fiveHourUsed: number; fiveHourLimit: number; weeklyUsed: number; weeklyLimit: number
}
export interface BlockRow {
  startTs: string; endTs: string; events: number; totalTokens: number; costUsd: number; active: boolean
}

export const api = {
  summary: (r: Range) => get<Summary>(`/summary?range=${r}`),
  timeseries: (r: Range, g: 'hour' | 'day') => get<TimePoint[]>(`/usage/timeseries?range=${r}&granularity=${g}`),
  models: (r: Range) => get<ModelRow[]>(`/models?range=${r}`),
  projects: (r: Range) => get<ProjectRow[]>(`/projects?range=${r}`),
  sessions: () => get<SessionRow[]>(`/sessions`),
  blocks: (r: Range) => get<BlockRow[]>(`/blocks?range=${r}`),
  quota: () => get<Quota>(`/quota`),
  quotaHistory: (r: Range) => get<QuotaHistoryRow[]>(`/quota/history?range=${r}`),
}
