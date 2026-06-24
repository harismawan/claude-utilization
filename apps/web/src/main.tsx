import { StampProvider } from '@harismawan/stamp-ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StampProvider mode="dark">
      <App />
    </StampProvider>
  </StrictMode>,
)
