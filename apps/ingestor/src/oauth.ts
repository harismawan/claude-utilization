import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type NormalizedQuota, normalizeUsage } from 'claude-util-shared'

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
export const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
// Public Claude Code OAuth client id. VERIFY against a live refresh during Task 9;
// if refresh returns 400/401, re-check this value before debugging anything else.
export const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const OAUTH_BETA = 'oauth-2025-04-20'
const REFRESH_SKEW_MS = 60_000

export interface StoredCreds {
  accessToken: string
  refreshToken: string
  expiresAt: number
  subscriptionType: string | null
  rateLimitTier: string | null
}

export function readCredentials(claudeDir: string): StoredCreds | null {
  try {
    const raw = readFileSync(join(claudeDir, '.credentials.json'), 'utf8')
    const o = JSON.parse(raw)?.claudeAiOauth
    if (!o?.accessToken || !o?.refreshToken) return null
    return {
      accessToken: o.accessToken,
      refreshToken: o.refreshToken,
      expiresAt: Number(o.expiresAt) || 0,
      subscriptionType: o.subscriptionType ?? null,
      rateLimitTier: o.rateLimitTier ?? null,
    }
  } catch {
    return null
  }
}

export function needsRefresh(expiresAt: number, now: number): boolean {
  return expiresAt - now <= REFRESH_SKEW_MS
}

export async function refreshAccessToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresAt: number }> {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: OAUTH_CLIENT_ID,
    }),
  })
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`)
  const j = (await res.json()) as { access_token: string; expires_in?: number }
  return {
    accessToken: j.access_token,
    expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000,
  }
}

export type UsageResult =
  | { ok: true; quota: NormalizedQuota; raw: unknown }
  | { ok: false; status: number }

export async function fetchUsage(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UsageResult> {
  const res = await fetchImpl(USAGE_URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      'anthropic-beta': OAUTH_BETA,
    },
  })
  if (!res.ok) return { ok: false, status: res.status }
  const raw = await res.json()
  return { ok: true, quota: normalizeUsage(raw), raw }
}
