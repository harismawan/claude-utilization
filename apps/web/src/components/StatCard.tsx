import { Card } from '@harismawan/stamp-ui'
import styled from 'styled-components'

const Label = styled.div`
  font-size: 0.8rem;
  color: ${(p) => p.theme.colors.textMuted};
`
const Value = styled.div`
  font-size: 1.6rem;
  font-weight: 700;
`
const Sub = styled.div`
  font-size: 0.75rem;
  color: ${(p) => p.theme.colors.textMuted};
`

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <Label>{label}</Label>
      <Value>{value}</Value>
      {sub ? <Sub>{sub}</Sub> : null}
    </Card>
  )
}
