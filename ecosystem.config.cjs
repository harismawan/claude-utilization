// PM2 deployment config for claude-utilization.
//
// Prereqs (run once from repo root):
//   bun install
//   bun --filter claude-util-api db:generate         # prisma client
//   bun --filter claude-util-api db:migrate           # apply schema to remote db
//   bun run --filter claude-util-web build            # produce apps/web/dist
//
// Start / manage:
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2 startup                            # persist across reboot
//   pm2 logs / pm2 restart all / pm2 delete all
//
// Three processes:
//   claude-util-api      Elysia REST API   (bun, reads root .env)
//   claude-util-ingestor log tailer + quota poller (bun, reads root .env)
//   claude-util-web      static dist served by PM2's built-in server (SPA)
const { execSync } = require('node:child_process')

// pm2's daemon may not inherit the interactive shell PATH, so resolve bun absolutely.
function resolveBun() {
  try {
    return execSync('command -v bun', { encoding: 'utf8' }).trim() || 'bun'
  } catch {
    return 'bun'
  }
}

const bun = resolveBun()
const root = __dirname
const webPort = process.env.WEB_PORT || 4173

const bunApp = (name, entry) => ({
  name,
  cwd: root,
  script: bun,
  // bun --env-file loads the root .env into the process (pm2 does not auto-load .env).
  args: ['--env-file=.env', entry],
  interpreter: 'none',
  autorestart: true,
  max_restarts: 10,
  env: { NODE_ENV: 'production' },
  out_file: `logs/${name}.out.log`,
  error_file: `logs/${name}.err.log`,
})

module.exports = {
  apps: [
    bunApp('claude-util-api', 'apps/api/src/index.ts'),
    bunApp('claude-util-ingestor', 'apps/ingestor/src/index.ts'),
    {
      name: 'claude-util-web',
      cwd: root,
      // pm2's integrated static file server (reads the PM2_SERVE_* env vars below).
      script: 'serve',
      env: {
        PM2_SERVE_PATH: 'apps/web/dist',
        PM2_SERVE_PORT: webPort,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html',
      },
      autorestart: true,
      out_file: 'logs/claude-util-web.out.log',
      error_file: 'logs/claude-util-web.err.log',
    },
  ],
}
