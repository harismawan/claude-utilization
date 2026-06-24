import { colorForModel } from 'claude-util-shared'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { ModelRow } from '../api'

export function CostDonut({ models }: { models: ModelRow[] }) {
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
        >
          {data.map((d) => (
            <Cell key={d.name} fill={colorForModel(d.name)} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
