import { colorForModel } from 'claude-util-shared'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TimePoint } from '../api'

type Row = { bucket: string } & Record<string, number | string>

function pivot(points: TimePoint[], metric: 'costUsd' | 'totalTokens') {
  const byBucket = new Map<string, Row>()
  const models = new Set<string>()
  for (const p of points) {
    models.add(p.model)
    const row = byBucket.get(p.bucket) ?? { bucket: p.bucket }
    row[p.model] = ((row[p.model] as number) ?? 0) + p[metric]
    byBucket.set(p.bucket, row)
  }
  return { rows: [...byBucket.values()], models: [...models] }
}

export function UsageAreaChart({
  points,
  metric,
}: {
  points: TimePoint[]
  metric: 'costUsd' | 'totalTokens'
}) {
  const { rows, models } = pivot(points, metric)
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={rows}>
        <CartesianGrid strokeOpacity={0.1} />
        <XAxis dataKey="bucket" tickFormatter={(v: string) => v.slice(5, 16)} fontSize={11} />
        <YAxis fontSize={11} />
        <Tooltip />
        <Legend />
        {models.map((m) => (
          <Area
            key={m}
            type="monotone"
            dataKey={m}
            stackId="1"
            stroke={colorForModel(m)}
            fill={colorForModel(m)}
            fillOpacity={0.5}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
