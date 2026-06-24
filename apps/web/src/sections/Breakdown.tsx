import { Card, DataTable } from '@harismawan/stamp-ui'
import { CostDonut } from '../components/CostDonut'
import { fmtTokens, fmtUsd } from '../format'
import { Section, SectionTitle, TwoCol } from '../components/Section'
import { useDashboard } from '../store'

export function Breakdown() {
  const models = useDashboard((s) => s.models)
  const projects = useDashboard((s) => s.projects)

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
              { key: 'costUsd', header: 'Value', render: (r: (typeof models)[number]) => fmtUsd(r.costUsd) },
              { key: 'totalTokens', header: 'Tokens', render: (r: (typeof models)[number]) => fmtTokens(r.totalTokens) },
              { key: 'requests', header: 'Reqs' },
            ]}
          />
        </Card>
      </TwoCol>
      <Card>
        <DataTable
          data={projects}
          rowKey={(r) => r.projectPath}
          columns={[
            { key: 'projectPath', header: 'Project' },
            { key: 'costUsd', header: 'Value', render: (r: (typeof projects)[number]) => fmtUsd(r.costUsd) },
            { key: 'totalTokens', header: 'Tokens', render: (r: (typeof projects)[number]) => fmtTokens(r.totalTokens) },
            { key: 'requests', header: 'Reqs' },
          ]}
        />
      </Card>
    </Section>
  )
}
