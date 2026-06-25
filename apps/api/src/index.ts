import cors from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { Elysia } from 'elysia'
import pino from 'pino'
import { buildApp } from './routes'

const log = pino({ transport: { target: 'pino-pretty' } })
const port = Number(process.env.API_PORT) || 8787
const hostname = process.env.API_HOST || '127.0.0.1'
const origin = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

new Elysia()
  .use(cors({ origin }))
  .use(swagger({ path: '/swagger' }))
  .use(buildApp())
  .onError(({ error, code }) => {
    log.error({ err: error, code }, 'request error')
    return { error: 'internal' }
  })
  .listen({ hostname, port })

log.info({ port, hostname }, 'api listening')
