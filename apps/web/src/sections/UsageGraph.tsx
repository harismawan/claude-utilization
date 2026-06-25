import { Card, SegmentedControl } from '@harismawan/stamp-ui'
import { useState } from 'react'
import { Section, SectionTitle } from '../components/Section'
import { UsageAreaChart } from '../components/UsageAreaChart'
import { useDashboard } from '../store'

export function UsageGraph() {
  const points = useDashboard((s) => s.timeseries)
  const granularity = useDashboard((s) => s.granularity)
  const setGranularity = useDashboard((s) => s.setGranularity)
  const [metric, setMetric] = useState<'costUsd' | 'totalTokens'>('costUsd')

  return (
    <Section>
      <SectionTitle>Usage over time</SectionTitle>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <SegmentedControl
          value={metric}
          onChange={(v: string) => setMetric(v as 'costUsd' | 'totalTokens')}
          options={[
            { label: 'Value', value: 'costUsd' },
            { label: 'Tokens', value: 'totalTokens' },
          ]}
        />
        <SegmentedControl
          value={granularity}
          onChange={(v: string) => setGranularity(v as 'hour' | 'day')}
          options={[
            { label: 'Hourly', value: 'hour' },
            { label: 'Daily', value: 'day' },
          ]}
        />
      </div>
      <Card>
        <UsageAreaChart points={points} metric={metric} granularity={granularity} />
      </Card>
    </Section>
  )
}
