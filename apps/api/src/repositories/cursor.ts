import { db } from '../db'

export const cursorRepo = {
  get(filePath: string) {
    return db.ingestCursor.findUnique({ where: { filePath } })
  },
  save(filePath: string, inode: string, bytesRead: number, lastUuid: string | null) {
    return db.ingestCursor.upsert({
      where: { filePath },
      create: { filePath, inode, bytesRead: BigInt(bytesRead), lastUuid },
      update: { inode, bytesRead: BigInt(bytesRead), lastUuid },
    })
  },
}
