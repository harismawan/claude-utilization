import cors from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { Elysia } from 'elysia'
import pino from 'pino'
import { buildApp } from './routes'

const log = pino({ transport: { target: 'pino-pretty' } })
const port = Number(process.env.API_PORT) || 8787

new Elysia()
  .use(cors({ origin: ['http://localhost:5173'] }))
  .use(swagger({ path: '/swagger' }))
  .use(buildApp())
  .onError(({ error, code }) => {
    log.error({ err: error, code }, 'request error')
    return { error: 'internal' }
  })
  .listen({ hostname: '127.0.0.1', port })

log.info({ port }, 'api listening on http://127.0.0.1')
