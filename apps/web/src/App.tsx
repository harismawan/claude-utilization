import { Badge } from '@harismawan/stamp-ui'
import { useEffect } from 'react'
import styled from 'styled-components'
import { Breakdown } from './sections/Breakdown'
import { Overview } from './sections/Overview'
import { QuotaHistory } from './sections/QuotaHistory'
import { Sessions } from './sections/Sessions'
import { UsageGraph } from './sections/UsageGraph'
import { startPolling, useDashboard } from './store'

const Shell = styled.div`
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem;
`
const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
`
const Brand = styled.h1`
  font-size: 1.25rem;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  &::before {
    content: '';
    width: 14px;
    height: 14px;
    border-radius: 4px;
    background: #ffde15;
  }
`
const Right = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
`
const Dot = styled.span<{ $stale: boolean }>`
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: ${(p) => (p.$stale ? '#FF9F43' : '#1FAB6E')};
  display: inline-block;
`
const RangeBtns = styled.div`
  display: flex;
  gap: 0.25rem;
`
const RangeBtn = styled.button<{ $active: boolean }>`
  background: ${(p) => (p.$active ? '#FFDE15' : 'transparent')};
  color: ${(p) => (p.$active ? '#111' : p.theme.colors.text)};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: 6px;
  padding: 0.25rem 0.6rem;
  cursor: pointer;
`

const RANGES = ['today', '7d', '30d', 'all'] as const

export function App() {
  const range = useDashboard((s) => s.range)
  const setRange = useDashboard((s) => s.setRange)
  const quota = useDashboard((s) => s.quota)
  const error = useDashboard((s) => s.error)
  useEffect(() => startPolling(), [])

  const connected = quota?.connected === true
  const stale = connected ? quota.stale : false
  const tier = connected ? quota.subscriptionType : null

  return (
    <Shell>
      <Header>
        <Brand>Claude Utilization</Brand>
        <Right>
          {tier ? <Badge>{tier.toUpperCase()}</Badge> : null}
          <RangeBtns>
            {RANGES.map((r) => (
              <RangeBtn key={r} $active={range === r} onClick={() => setRange(r)}>
                {r}
              </RangeBtn>
            ))}
          </RangeBtns>
          <span>
            <Dot $stale={stale} /> {connected ? (stale ? 'stale' : 'live') : 'no quota'}
          </span>
        </Right>
      </Header>
      {error ? <div style={{ color: '#FF6B6B', marginBottom: '1rem' }}>API error: {error}</div> : null}
      <Overview />
      <UsageGraph />
      <Breakdown />
      <QuotaHistory />
      <Sessions />
    </Shell>
  )
}
