import { useEffect } from 'react'
import { startPolling, useDashboard } from './store'

export function App() {
  const summary = useDashboard((s) => s.summary)
  useEffect(() => startPolling(), [])
  return <pre>{JSON.stringify(summary, null, 2)}</pre>
}
