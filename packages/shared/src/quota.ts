export interface NormalizedQuota {
  fiveHourUsed: number
  fiveHourLimit: number
  fiveHourResetsAt: Date | null
  weeklyUsed: number
  weeklyLimit: number
  weeklyResetsAt: Date | null
  extraCredits: number
  subscriptionType: string | null
  rateLimitTier: string | null
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
function date(v: unknown): Date | null {
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
function pick(obj: any, keys: string[]): unknown {
  for (const k of keys) if (obj && obj[k] != null) return obj[k]
  return undefined
}

interface Window {
  used: number
  limit: number
  resetsAt: Date | null
}
function window(w: any): Window {
  if (!w || typeof w !== 'object') return { used: 0, limit: 0, resetsAt: null }
  const used = pick(w, ['used', 'usage'])
  const limit = pick(w, ['limit', 'cap'])
  if (used != null && limit != null) {
    return {
      used: num(used),
      limit: num(limit),
      resetsAt: date(pick(w, ['resets_at', 'resetsAt'])),
    }
  }
  // utilization: API may return a fraction (0.0–1.0) or a percentage (0–100).
  // If the value is > 1 it's already a percentage; otherwise scale it.
  const util = num(pick(w, ['utilization', 'used_fraction']))
  const utilUsed = util > 1 ? util : util * 100
  return { used: utilUsed, limit: 100, resetsAt: date(pick(w, ['resets_at', 'resetsAt'])) }
}

export function normalizeUsage(raw: unknown): NormalizedQuota {
  const r: any = raw ?? {}
  const five = window(pick(r, ['five_hour', 'fiveHour', 'session', 'rolling']))
  const week = window(pick(r, ['seven_day', 'sevenDay', 'weekly', 'week']))
  return {
    fiveHourUsed: five.used,
    fiveHourLimit: five.limit,
    fiveHourResetsAt: five.resetsAt,
    weeklyUsed: week.used,
    weeklyLimit: week.limit,
    weeklyResetsAt: week.resetsAt,
    extraCredits: num(pick(r, ['extra_credits', 'extra_usage_credits', 'credits'])),
    subscriptionType:
      (pick(r, ['subscription_type', 'subscriptionType']) as string | undefined) ?? null,
    rateLimitTier: (pick(r, ['rate_limit_tier', 'rateLimitTier']) as string | undefined) ?? null,
  }
}
