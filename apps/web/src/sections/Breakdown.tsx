import { Card, DataTable } from '@harismawan/stamp-ui'
import { CostDonut } from '../components/CostDonut'
import { Section, SectionTitle, TwoCol } from '../components/Section'
import { fmtTokens, fmtUsd } from '../format'
import { useDashboard } from '../store'

export function Breakdown() {
  const models = useDashboard((s) => s.models)

  return (
    <Section>
      <SectionTitle>Breakdown</SectionTitle>
      <TwoCol>
        <Card>
          <CostDonut models={models} />
        </Card>
        <Card>
          <DataTable
            data={models}
            rowKey={(r) => r.model}
            columns={[
              { key: 'model', header: 'Model' },
              {
                key: 'costUsd',
                header: 'Value',
                render: (r: (typeof models)[number]) => fmtUsd(r.costUsd),
              },
              {
                key: 'totalTokens',
                header: 'Tokens',
                render: (r: (typeof models)[number]) => fmtTokens(r.totalTokens),
              },
              { key: 'requests', header: 'Reqs' },
            ]}
          />
        </Card>
      </TwoCol>
    </Section>
  )
}
