import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Read env (e.g. VITE_API_BASE) from the repo root .env, not just apps/web.
  envDir: '../../',
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8787' } },
})
