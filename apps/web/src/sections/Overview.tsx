import { Card } from '@harismawan/stamp-ui'
import { QuotaGauge } from '../components/QuotaGauge'
import { Grid, Section, SectionTitle, TwoCol } from '../components/Section'
import { StatCard } from '../components/StatCard'
import { fmtTokens, fmtUsd } from '../format'
import { useDashboard } from '../store'

export function Overview() {
  const summary = useDashboard((s) => s.summary)
  const quota = useDashboard((s) => s.quota)
  const blocks = useDashboard((s) => s.blocks)
  const activeBlock = blocks.find((b) => b.active)

  return (
    <Section>
      <SectionTitle>Overview</SectionTitle>
      <Grid>
        <StatCard
          label="Value (range)"
          value={summary ? fmtUsd(summary.costUsd) : '—'}
          sub="API-equivalent"
        />
        <StatCard
          label="Tokens"
          value={
            summary
              ? fmtTokens(
                  summary.inputTokens +
                    summary.outputTokens +
                    summary.cacheReadTokens +
                    summary.cacheCreateTokens,
                )
              : '—'
          }
        />
        <StatCard label="Requests" value={summary ? String(summary.requests) : '—'} />
        <StatCard label="Sessions" value={summary ? String(summary.sessions) : '—'} />
        <StatCard
          label="Active block burn"
          value={activeBlock ? fmtUsd(activeBlock.costUsd) : '$0.00'}
          sub={activeBlock ? `${activeBlock.events} reqs` : 'idle'}
        />
      </Grid>
      <TwoCol>
        <Card>
          {quota && quota.connected ? (
            <QuotaGauge
              title="5-hour window"
              used={quota.fiveHour.used}
              limit={quota.fiveHour.limit}
              resetsAt={quota.fiveHour.resetsAt}
            />
          ) : (
            <div>Quota not connected — local analytics only.</div>
          )}
        </Card>
        <Card>
          {quota && quota.connected ? (
            <QuotaGauge
              title="Weekly"
              used={quota.weekly.used}
              limit={quota.weekly.limit}
              resetsAt={quota.weekly.resetsAt}
            />
          ) : (
            <div>—</div>
          )}
        </Card>
      </TwoCol>
    </Section>
  )
}
