import { db } from '../db'

export const oauthRepo = {
  get() {
    return db.oAuthState.findUnique({ where: { id: 1 } })
  },
  set(accessToken: string, expiresAt: number) {
    return db.oAuthState.upsert({
      where: { id: 1 },
      create: { id: 1, accessToken, expiresAt: BigInt(expiresAt) },
      update: { accessToken, expiresAt: BigInt(expiresAt) },
    })
  },
}
