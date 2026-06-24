import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { QuotaHistoryRow } from '../api'

export function QuotaHistoryChart({ rows }: { rows: QuotaHistoryRow[] }) {
  const data = rows.map((r) => ({
    t: r.capturedAt.slice(5, 16),
    fiveHour: r.fiveHourLimit > 0 ? (r.fiveHourUsed / r.fiveHourLimit) * 100 : 0,
    weekly: r.weeklyLimit > 0 ? (r.weeklyUsed / r.weeklyLimit) * 100 : 0,
  }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeOpacity={0.1} />
        <XAxis dataKey="t" fontSize={11} />
        <YAxis domain={[0, 100]} fontSize={11} unit="%" />
        <Tooltip />
        <Line type="monotone" dataKey="fiveHour" stroke="#FFDE15" dot={false} name="5-hour %" />
        <Line type="monotone" dataKey="weekly" stroke="#28A6E0" dot={false} name="weekly %" />
      </LineChart>
    </ResponsiveContainer>
  )
}
