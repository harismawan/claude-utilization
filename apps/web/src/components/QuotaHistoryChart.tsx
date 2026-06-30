import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTheme } from 'styled-components'
import type { QuotaHistoryRow, Range } from '../api'
import { fmtBucket } from '../format'

// Client mirror of the API's sinceFor: lower bound of the selected range, so the
// time axis spans the filtered window even when snapshots are sparse.
function rangeStart(range: Range, now: number): number {
  switch (range) {
    case 'today': {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }
    case '7d':
      return now - 7 * 86_400_000
    case '30d':
      return now - 30 * 86_400_000
    default:
      return 0
  }
}

export function QuotaHistoryChart({ rows, range }: { rows: QuotaHistoryRow[]; range: Range }) {
  const t = useTheme()
  // Snapshots land at irregular times, so the x-axis must be a real time scale —
  // a categorical (index) axis would space points evenly and detach the line from
  // actual dates. Use epoch ms and a domain bounded by the selected range.
  const data = rows.map((r) => ({
    t: new Date(r.capturedAt).getTime(),
    fiveHour: r.fiveHourLimit > 0 ? (r.fiveHourUsed / r.fiveHourLimit) * 100 : 0,
    weekly: r.weeklyLimit > 0 ? (r.weeklyUsed / r.weeklyLimit) * 100 : 0,
  }))
  // Ranges longer than a day (7d/30d/all) label by day; "today" (24h) by hour.
  const gran: 'hour' | 'day' = range === 'today' ? 'hour' : 'day'
  const now = Date.now()
  // "all" has no fixed lower bound; let the data drive the left edge.
  const domainStart: number | string = range === 'all' ? 'dataMin' : rangeStart(range, now)
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={t.colors.borderSoft} vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={[domainStart, now]}
          tickFormatter={(v: number) => fmtBucket(new Date(v).toISOString(), gran)}
          tick={{ fill: t.colors.textMuted, fontSize: 12 }}
          axisLine={{ stroke: t.colors.border, strokeWidth: 2 }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fill: t.colors.textMuted, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip
          contentStyle={{
            background: t.colors.surface,
            border: `2px solid ${t.colors.border}`,
            borderRadius: t.radii.md,
            fontFamily: t.font.body,
            fontWeight: 600,
          }}
          formatter={(v) => `${Number(v).toFixed(0)}%`}
          labelFormatter={(v) => fmtBucket(new Date(Number(v)).toISOString(), gran)}
          cursor={{ stroke: t.colors.border }}
        />
        <Line
          type="monotone"
          dataKey="fiveHour"
          stroke={t.colors.primary}
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 5, fill: t.colors.primary, stroke: t.colors.border, strokeWidth: 2 }}
          name="5-hour %"
        />
        <Line
          type="monotone"
          dataKey="weekly"
          stroke={t.colors.accent}
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 5, fill: t.colors.accent, stroke: t.colors.border, strokeWidth: 2 }}
          name="weekly %"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
