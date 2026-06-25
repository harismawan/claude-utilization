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

export function QuotaHistoryChart({ rows, range }: { rows: QuotaHistoryRow[]; range: Range }) {
  const t = useTheme()
  const data = rows.map((r) => ({
    t: r.capturedAt,
    fiveHour: r.fiveHourLimit > 0 ? (r.fiveHourUsed / r.fiveHourLimit) * 100 : 0,
    weekly: r.weeklyLimit > 0 ? (r.weeklyUsed / r.weeklyLimit) * 100 : 0,
  }))
  // Ranges longer than a day (7d/30d/all) label by day; "today" (24h) by hour.
  const gran: 'hour' | 'day' = range === 'today' ? 'hour' : 'day'
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={t.colors.borderSoft} vertical={false} />
        <XAxis
          dataKey="t"
          tickFormatter={(v: string) => fmtBucket(v, gran)}
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
          labelFormatter={(v) => fmtBucket(String(v), gran)}
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
