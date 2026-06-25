import { Card, DataTable } from '@harismawan/stamp-ui'
import { Section, SectionTitle } from '../components/Section'
import { fmtTokens, fmtUsd } from '../format'
import { useDashboard } from '../store'

export function Projects() {
  const projects = useDashboard((s) => s.projects)
  return (
    <Section>
      <SectionTitle>Projects</SectionTitle>
      <Card>
        <DataTable
          data={projects}
          pageSize={5}
          rowKey={(r) => r.projectPath}
          columns={[
            { key: 'projectPath', header: 'Project' },
            {
              key: 'costUsd',
              header: 'Value',
              render: (r: (typeof projects)[number]) => fmtUsd(r.costUsd),
            },
            {
              key: 'totalTokens',
              header: 'Tokens',
              render: (r: (typeof projects)[number]) => fmtTokens(r.totalTokens),
            },
            { key: 'requests', header: 'Reqs' },
          ]}
        />
      </Card>
    </Section>
  )
}
