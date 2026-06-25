export function fmtUsd(n: number): string {
  if (n > 0 && n < 1) return `$${n.toPrecision(3)}`
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// Compact counts: 1.2K / 3.4M / 5.6B / 7.8T.
const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
export function fmtCompact(n: number): string {
  return compact.format(n ?? 0)
}

// Tokens share the compact scale (now reaches B/T, not just M).
export function fmtTokens(n: number): string {
  return fmtCompact(n)
}

// Compact currency for chart axes (full fmtUsd stays for tooltips/tables).
const usdCompact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 1,
})
export function fmtUsdCompact(n: number): string {
  return usdCompact.format(n ?? 0)
}

// Axis/tooltip time labels, granularity-aware.
const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const hourFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
export function fmtBucket(v: string, granularity: 'hour' | 'day' = 'day'): string {
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return (granularity === 'hour' ? hourFmt : dayFmt).format(d)
}

export function fmtCountdown(target: Date | string | null): string {
  if (!target) return '—'
  const ms = new Date(target).getTime() - Date.now()
  if (ms <= 0) return 'now'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
