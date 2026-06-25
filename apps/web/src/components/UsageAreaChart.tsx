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
import { useTheme } from 'styled-components'
import type { TimePoint } from '../api'
import { fmtBucket, fmtCompact, fmtUsd, fmtUsdCompact } from '../format'

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
  granularity,
}: {
  points: TimePoint[]
  metric: 'costUsd' | 'totalTokens'
  granularity: 'hour' | 'day'
}) {
  const t = useTheme()
  const { rows, models } = pivot(points, metric)
  const axisFmt = metric === 'costUsd' ? fmtUsdCompact : fmtCompact
  const valueFmt = metric === 'costUsd' ? fmtUsd : fmtCompact

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={rows} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={t.colors.borderSoft} vertical={false} />
        <XAxis
          dataKey="bucket"
          tickFormatter={(v: string) => fmtBucket(v, granularity)}
          tick={{ fill: t.colors.textMuted, fontSize: 12 }}
          axisLine={{ stroke: t.colors.border, strokeWidth: 2 }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => axisFmt(v)}
          tick={{ fill: t.colors.textMuted, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          contentStyle={{
            background: t.colors.surface,
            border: `2px solid ${t.colors.border}`,
            borderRadius: t.radii.md,
            fontFamily: t.font.body,
            fontWeight: 600,
          }}
          formatter={(v) => valueFmt(Number(v))}
          labelFormatter={(v) => fmtBucket(String(v), granularity)}
          cursor={{ fill: t.colors.surfaceMuted }}
        />
        <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
        {models.map((m) => (
          <Area
            key={m}
            type="monotone"
            dataKey={m}
            stackId="1"
            stroke={colorForModel(m)}
            strokeWidth={2}
            fill={colorForModel(m)}
            fillOpacity={0.5}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
