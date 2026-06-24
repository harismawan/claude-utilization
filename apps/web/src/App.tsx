import { useEffect } from 'react'
import { startPolling } from './store'
import { Overview } from './sections/Overview'
import { UsageGraph } from './sections/UsageGraph'
import { Breakdown } from './sections/Breakdown'
import { QuotaHistory } from './sections/QuotaHistory'
import { Sessions } from './sections/Sessions'

export function App() {
  useEffect(() => startPolling(), [])
  return (
    <main style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <Overview />
      <UsageGraph />
      <Breakdown />
      <QuotaHistory />
      <Sessions />
    </main>
  )
}
