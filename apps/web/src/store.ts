import { create } from 'zustand'
import {
  api,
  type BlockRow,
  type ModelRow,
  type ProjectRow,
  type Quota,
  type QuotaHistoryRow,
  type Range,
  type SessionRow,
  type Summary,
  type TimePoint,
} from './api'

interface DashState {
  range: Range
  granularity: 'hour' | 'day'
  summary: Summary | null
  timeseries: TimePoint[]
  models: ModelRow[]
  projects: ProjectRow[]
  sessions: SessionRow[]
  blocks: BlockRow[]
  quota: Quota | null
  quotaHistory: QuotaHistoryRow[]
  loading: boolean
  error: string | null
  setRange: (r: Range) => void
  setGranularity: (g: 'hour' | 'day') => void
  refresh: () => Promise<void>
}

export const useDashboard = create<DashState>((set, getState) => ({
  range: '7d',
  granularity: 'day',
  summary: null,
  timeseries: [],
  models: [],
  projects: [],
  sessions: [],
  blocks: [],
  quota: null,
  quotaHistory: [],
  loading: false,
  error: null,
  setRange: (range) => {
    set({ range })
    void getState().refresh()
  },
  setGranularity: (granularity) => {
    set({ granularity })
    void getState().refresh()
  },
  refresh: async () => {
    const { range, granularity } = getState()
    set({ loading: true, error: null })
    try {
      const [summary, timeseries, models, projects, sessions, blocks, quota, quotaHistory] =
        await Promise.all([
          api.summary(range),
          api.timeseries(range, granularity),
          api.models(range),
          api.projects(range),
          api.sessions(),
          api.blocks(range),
          api.quota(),
          api.quotaHistory(range),
        ])
      set({ summary, timeseries, models, projects, sessions, blocks, quota, quotaHistory, loading: false })
    } catch (err) {
      set({ error: String(err), loading: false })
    }
  },
}))

export function startPolling(intervalMs = 20_000): () => void {
  void useDashboard.getState().refresh()
  const id = setInterval(() => void useDashboard.getState().refresh(), intervalMs)
  return () => clearInterval(id)
}
