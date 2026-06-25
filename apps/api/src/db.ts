import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/client/index.js'

const rawUrl = process.env.DATABASE_URL
if (!rawUrl) throw new Error('DATABASE_URL is not set')

// Pick the driver from the URL scheme: file:/sqlite: → SQLite (libsql; works
// under Bun, unlike the native better-sqlite3 addon), otherwise Postgres.
// Generate the client for the matching provider (DATABASE_URL drives
// prisma.config.ts too), e.g. `DATABASE_URL=file:./data/app.db bun db:generate`.
export const dialect: 'sqlite' | 'postgres' =
  rawUrl.startsWith('file:') || rawUrl.startsWith('sqlite:') ? 'sqlite' : 'postgres'

// Repo root: this file lives at apps/api/src/db.ts. Relative SQLite paths are
// anchored here (matching prisma.config.ts) so the file is the same regardless
// of which process opens it.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

function resolveSqliteUrl(url: string): string {
  const p = url.replace(/^file:/, '').replace(/^sqlite:/, '')
  if (p === '' || p.startsWith(':') || isAbsolute(p)) return `file:${p}`
  const abs = resolve(repoRoot, p)
  mkdirSync(dirname(abs), { recursive: true })
  return `file:${abs}`
}

const adapter =
  dialect === 'sqlite'
    ? new PrismaLibSql({ url: resolveSqliteUrl(rawUrl) })
    : new PrismaPg({ connectionString: rawUrl })

export const db = new PrismaClient({ adapter })
