/**
 * Tide dynamics: which way, how fast, when it turns, and whether it is a spring
 * or neap stretch. All from NOAA's hourly predictions and high/low times.
 *
 * "Mid-change" marks the hours when the tide is moving fastest between turns —
 * when water over the reef and channel current change most. It is a tag, and it
 * affects a lens's fit only through the `tideFlow` rule, which is off by default.
 */

/** An hour counts as mid-change when its rate is at least this share of the fastest rate between the same two turns. */
export const MID_CHANGE_SHARE = 0.7

export type TideDynamics = {
  direction: 'rising' | 'falling' | 'slack' | null
  /** ft per hour, signed (+ rising). */
  rateFtPerHr: number | null
  nextTurn: { kind: 'high' | 'low'; timestamp: string; minutesAway: number } | null
  midChange: boolean
}

type Extreme = { timestamp: string; heightFt: number; kind: 'high' | 'low' }
const ms = (local: string) => Date.parse(`${local.replace(' ', 'T').slice(0, 16)}:00-10:00`)

/** Rate at each hour from the neighbouring hours (central difference). */
export function hourlyRates(heights: readonly { timestamp: string; ft: number | null }[]): (number | null)[] {
  return heights.map((h, i) => {
    const prev = heights[i - 1]?.ft
    const next = heights[i + 1]?.ft
    if (h.ft === null) return null
    if (prev != null && next != null) return (next - prev) / 2
    if (next != null) return next - h.ft
    if (prev != null) return h.ft - prev
    return null
  })
}

export function tideDynamics(
  heights: readonly { timestamp: string; ft: number | null }[],
  extremes: readonly Extreme[],
): TideDynamics[] {
  const rates = hourlyRates(heights)
  const turns = [...extremes].sort((a, b) => ms(a.timestamp) - ms(b.timestamp))
  return heights.map((h, i) => {
    const t = ms(h.timestamp)
    const rate = rates[i]
    const next = turns.find((e) => ms(e.timestamp) > t) ?? null
    const prev = [...turns].reverse().find((e) => ms(e.timestamp) <= t) ?? null
    // Fastest rate between the surrounding turns, to judge "mid-change".
    let peak = 0
    if (prev && next) {
      heights.forEach((x, j) => {
        const xm = ms(x.timestamp)
        if (xm > ms(prev.timestamp) && xm < ms(next.timestamp) && rates[j] !== null) peak = Math.max(peak, Math.abs(rates[j]!))
      })
    }
    return {
      direction: rate === null ? null : Math.abs(rate) < 0.03 ? 'slack' : rate > 0 ? 'rising' : 'falling',
      rateFtPerHr: rate === null ? null : Math.round(rate * 100) / 100,
      nextTurn: next ? { kind: next.kind, timestamp: next.timestamp, minutesAway: Math.round((ms(next.timestamp) - t) / 60_000) } : null,
      midChange: rate !== null && peak > 0 && Math.abs(rate) >= MID_CHANGE_SHARE * peak,
    }
  })
}

/**
 * Spring / neap from the moon: springs within ~2 days of new or full moon,
 * neaps within ~2 days of a quarter. Ranges in Honolulu are small (~1-2.5 ft),
 * so the daily range from NOAA's highs and lows is shown alongside.
 */
const SYNODIC_DAYS = 29.530588853
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14)

export function springNeap(date: string): 'spring' | 'neap' | null {
  const [y, m, d] = date.split('-').map(Number)
  const noonHst = Date.UTC(y, m - 1, d, 22)
  const age = (((noonHst - NEW_MOON_MS) / 86_400_000) % SYNODIC_DAYS + SYNODIC_DAYS) % SYNODIC_DAYS
  const toSyzygy = Math.min(age, Math.abs(age - SYNODIC_DAYS / 2), SYNODIC_DAYS - age)
  const toQuarter = Math.min(Math.abs(age - SYNODIC_DAYS / 4), Math.abs(age - (3 * SYNODIC_DAYS) / 4))
  if (toSyzygy <= 2) return 'spring'
  if (toQuarter <= 2) return 'neap'
  return null
}

export function dailyRangeFt(extremes: readonly Extreme[]): number | null {
  if (extremes.length < 2) return null
  const hs = extremes.map((e) => e.heightFt)
  return Math.round((Math.max(...hs) - Math.min(...hs)) * 10) / 10
}
