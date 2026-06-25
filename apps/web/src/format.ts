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

// Relative time: "just now", "5m ago", "3h ago", "2d ago".
const relTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })
const REL_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]
export function fmtRelative(target: Date | string | null): string {
  if (!target) return '—'
  const ms = new Date(target).getTime() - Date.now()
  if (Math.abs(ms) < 60_000) return 'just now'
  for (const [unit, step] of REL_STEPS) {
    if (Math.abs(ms) >= step) return relTime.format(Math.round(ms / step), unit)
  }
  return relTime.format(Math.round(ms / 60_000), 'minute')
}

export function fmtCountdown(target: Date | string | null): string {
  if (!target) return '—'
  const ms = new Date(target).getTime() - Date.now()
  if (ms <= 0) return 'now'
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (d > 0) return `${d}d ${h}h`
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
