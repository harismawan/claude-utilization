import { Card } from '@harismawan/stamp-ui'
import { QuotaHistoryChart } from '../components/QuotaHistoryChart'
import { Section, SectionTitle } from '../components/Section'
import { useDashboard } from '../store'

export function QuotaHistory() {
  const rows = useDashboard((s) => s.quotaHistory)
  const range = useDashboard((s) => s.range)
  if (rows.length === 0) return null
  return (
    <Section>
      <SectionTitle>Quota history</SectionTitle>
      <Card>
        <QuotaHistoryChart rows={rows} range={range} />
      </Card>
    </Section>
  )
}
