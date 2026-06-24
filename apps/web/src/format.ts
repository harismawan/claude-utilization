export function fmtUsd(n: number): string {
  if (n > 0 && n < 1) return `$${n.toPrecision(3)}`
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function fmtCountdown(target: Date | string | null): string {
  if (!target) return '—'
  const ms = new Date(target).getTime() - Date.now()
  if (ms <= 0) return 'now'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
