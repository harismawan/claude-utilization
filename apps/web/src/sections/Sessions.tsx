import { Card, DataTable } from '@harismawan/stamp-ui'
import { Section, SectionTitle } from '../components/Section'
import { fmtTokens, fmtUsd } from '../format'
import { useDashboard } from '../store'

export function Sessions() {
  const sessions = useDashboard((s) => s.sessions)
  return (
    <Section>
      <SectionTitle>Recent sessions</SectionTitle>
      <Card>
        <DataTable
          data={sessions.map((s) => ({
            ...s,
            value: fmtUsd(s.costUsd),
            tokens: fmtTokens(s.totalTokens),
            when: new Date(s.lastTs).toLocaleString(),
          }))}
          rowKey={(r) => r.sessionId}
          columns={[
            { key: 'projectPath', header: 'Project' },
            { key: 'when', header: 'Last activity' },
            { key: 'requests', header: 'Reqs' },
            { key: 'tokens', header: 'Tokens' },
            { key: 'value', header: 'Value' },
          ]}
        />
      </Card>
    </Section>
  )
}
