import { oauthRepo, quotaRepo } from 'claude-util-api/repositories'
import {
  fetchUsage,
  needsRefresh,
  readCredentials,
  refreshAccessToken,
} from './oauth'

export interface PollDeps {
  fetchImpl?: typeof fetch
}

export async function pollQuotaOnce(
  claudeDir: string,
  deps: PollDeps = {},
): Promise<'ok' | 'stale' | 'no-creds'> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const creds = readCredentials(claudeDir)
  if (!creds) return 'no-creds'

  // Prefer the fresher of file vs cached DB token.
  const cached = await oauthRepo.get()
  let accessToken = creds.accessToken
  let expiresAt = creds.expiresAt
  if (cached && Number(cached.expiresAt) > expiresAt) {
    accessToken = cached.accessToken
    expiresAt = Number(cached.expiresAt)
  }

  if (needsRefresh(expiresAt, Date.now())) {
    try {
      const refreshed = await refreshAccessToken(creds.refreshToken, fetchImpl)
      accessToken = refreshed.accessToken
      await oauthRepo.set(refreshed.accessToken, refreshed.expiresAt)
    } catch {
      // fall through with the (possibly expired) token; fetch will 401 → stale
    }
  }

  const res = await fetchUsage(accessToken, fetchImpl)
  if (!res.ok) {
    const last = await quotaRepo.latest()
    // Re-append last good values flagged stale so the UI can show staleness.
    await quotaRepo.append(
      {
        fiveHourUsed: last?.fiveHourUsed ?? 0,
        fiveHourLimit: last?.fiveHourLimit ?? 0,
        fiveHourResetsAt: last?.fiveHourResetsAt ?? null,
        weeklyUsed: last?.weeklyUsed ?? 0,
        weeklyLimit: last?.weeklyLimit ?? 0,
        weeklyResetsAt: last?.weeklyResetsAt ?? null,
        extraCredits: last?.extraCredits ?? 0,
        subscriptionType: creds.subscriptionType,
        rateLimitTier: creds.rateLimitTier,
      },
      { error: res.status },
      true,
    )
    return 'stale'
  }

  await quotaRepo.append(
    {
      ...res.quota,
      subscriptionType: res.quota.subscriptionType ?? creds.subscriptionType,
      rateLimitTier: res.quota.rateLimitTier ?? creds.rateLimitTier,
    },
    res.raw,
    false,
  )
  return 'ok'
}
