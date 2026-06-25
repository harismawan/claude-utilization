import { StampProvider } from '@harismawan/stamp-ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* No `mode` prop → follows the persisted useThemeStore (toggled in the header). */}
    <StampProvider>
      <App />
    </StampProvider>
  </StrictMode>,
)
