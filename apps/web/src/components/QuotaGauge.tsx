import { Progress } from '@harismawan/stamp-ui'
import { BRAND } from 'claude-util-shared'
import styled from 'styled-components'
import { fmtCountdown } from '../format'

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`
const Row = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
`
const Pct = styled.span<{ $danger: boolean }>`
  font-weight: 700;
  color: ${(p) => (p.$danger ? '#FF6B6B' : BRAND)};
`

export function QuotaGauge({
  title,
  used,
  limit,
  resetsAt,
}: {
  title: string
  used: number
  limit: number
  resetsAt: string | null
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  return (
    <Wrap>
      <Row>
        <span>{title}</span>
        <Pct $danger={pct >= 90}>{pct.toFixed(0)}%</Pct>
      </Row>
      <Progress value={pct} max={100} />
      <Row>
        <span>{limit > 0 ? `${used.toFixed(0)} / ${limit.toFixed(0)}` : 'no limit data'}</span>
        <span>resets {fmtCountdown(resetsAt)}</span>
      </Row>
    </Wrap>
  )
}
