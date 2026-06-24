import { createReadStream, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { cursorRepo, usageRepo } from 'claude-util-api/repositories'
import { type ParsedUsageEvent, parseUsageLine } from 'claude-util-shared'

async function findJsonl(root: string): Promise<string[]> {
  const out: string[] = []
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    const full = join(root, ent.name)
    if (ent.isDirectory()) out.push(...(await findJsonl(full)))
    else if (ent.isFile() && ent.name.endsWith('.jsonl')) out.push(full)
  }
  return out
}

async function readFrom(
  filePath: string,
  startByte: number,
  projectPath: string,
): Promise<{ events: ParsedUsageEvent[]; bytesRead: number; lastUuid: string | null }> {
  const stat = statSync(filePath)
  if (stat.size <= startByte) return { events: [], bytesRead: stat.size, lastUuid: null }
  const stream = createReadStream(filePath, { start: startByte, encoding: 'utf8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  const events: ParsedUsageEvent[] = []
  let lastUuid: string | null = null
  for await (const line of rl) {
    if (!line.trim()) continue
    const ev = parseUsageLine(line, projectPath)
    if (ev) {
      events.push(ev)
      lastUuid = ev.lineUuid
    }
  }
  return { events, bytesRead: stat.size, lastUuid }
}

export async function ingestOnce(claudeDir: string): Promise<{ files: number; events: number }> {
  const projectsRoot = join(claudeDir, 'projects')
  const files = await findJsonl(projectsRoot)
  let total = 0
  for (const file of files) {
    const cursor = await cursorRepo.get(file)
    const start = cursor ? Number(cursor.bytesRead) : 0
    const inode = String(statSync(file).ino)
    // If the file shrank or inode changed (rotation), re-read from 0.
    const safeStart = cursor && cursor.inode === inode ? start : 0
    const { events, bytesRead, lastUuid } = await readFrom(file, safeStart, file)
    if (events.length) total += await usageRepo.upsertEvents(events)
    await cursorRepo.save(file, inode, bytesRead, lastUuid ?? cursor?.lastUuid ?? null)
  }
  return { files: files.length, events: total }
}
