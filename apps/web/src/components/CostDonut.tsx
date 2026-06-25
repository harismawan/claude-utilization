import { colorForModel } from 'claude-util-shared'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useTheme } from 'styled-components'
import type { ModelRow } from '../api'
import { fmtUsd } from '../format'

export function CostDonut({ models }: { models: ModelRow[] }) {
  const t = useTheme()
  const data = models.map((m) => ({ name: m.model, value: m.costUsd }))
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          stroke={t.colors.border}
          strokeWidth={2}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={colorForModel(d.name)} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: t.colors.surface,
            border: `2px solid ${t.colors.border}`,
            borderRadius: t.radii.md,
            fontFamily: t.font.body,
            fontWeight: 600,
          }}
          formatter={(v, name) => [fmtUsd(Number(v)), name]}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          wrapperStyle={{ fontSize: 12, fontWeight: 600 }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
