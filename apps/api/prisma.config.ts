import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'prisma/config'

// Repo root: this file lives at apps/api/prisma.config.ts.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const rawUrl = process.env.DATABASE_URL ?? ''
const isSqlite = rawUrl.startsWith('file:') || rawUrl.startsWith('sqlite:')

// Anchor relative SQLite paths to the repo root so the CLI (cwd apps/api) and
// the runtime (cwd repo root) always open the same file. See src/db.ts.
function resolveSqlite(url: string): string {
  const p = url.replace(/^file:/, '').replace(/^sqlite:/, '')
  if (p === '' || p.startsWith(':') || isAbsolute(p)) return url
  const abs = resolve(repoRoot, p)
  mkdirSync(dirname(abs), { recursive: true })
  return `file:${abs}`
}

const url = isSqlite ? resolveSqlite(rawUrl) : rawUrl

export default defineConfig({
  schema: isSqlite ? 'prisma/schema.sqlite.prisma' : 'prisma/schema.prisma',
  migrations: {
    path: isSqlite ? 'prisma/migrations-sqlite' : 'prisma/migrations',
  },
  datasource: {
    url,
  },
})
