export type RangeKey = 'today' | '7d' | '30d' | 'all'

export function sinceFor(range: RangeKey, now = new Date()): Date {
  switch (range) {
    case 'today': {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case '7d':
      return new Date(now.getTime() - 7 * 86_400_000)
    case '30d':
      return new Date(now.getTime() - 30 * 86_400_000)
    default:
      return new Date(0)
  }
}
