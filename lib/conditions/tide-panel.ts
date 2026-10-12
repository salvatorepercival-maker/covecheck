import type { DayFacts } from '../facts'
import { formatClockTime } from '../format'

/**
 * The tide panel's readings: the day's highs and lows named the way mixed tides
 * need (higher/lower high, higher/lower low), where each sits relative to now
 * and to daylight, the low/high bands, and the week's daylight lows.
 *
 * Honolulu's tides are mixed semi-diurnal: two unequal highs and two unequal
 * lows a day, so "the low tide" is ambiguous — which one, and is it in daylight?
 */

export type Extreme = { timestamp: string; heightFt: number; kind: 'high' | 'low' }
/** Minutes past local midnight. */
export const minutesOf = (ts: string) => Number(ts.slice(11, 13)) * 60 + Number(ts.slice(14, 16))

export type NamedExtreme = Extreme & {
  name: 'Higher high' | 'Lower high' | 'Higher low' | 'Lower low' | 'High' | 'Low'
  /** Relative to now and daylight. */
  when: 'earlier' | 'next' | 'later' | 'after dark'
  minutesAway: number | null
}

export function namedExtremes(
  day: DayFacts,
  nowMinutes: number | null,
): NamedExtreme[] {
  const ex = [...day.tideExtremes].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const highs = ex.filter((e) => e.kind === 'high')
  const lows = ex.filter((e) => e.kind === 'low')
  const name = (e: Extreme): NamedExtreme['name'] => {
    const same = e.kind === 'high' ? highs : lows
    if (same.length < 2) return e.kind === 'high' ? 'High' : 'Low'
    const top = same.reduce((a, b) => (b.heightFt > a.heightFt ? b : a))
    if (e.kind === 'high') return e === top ? 'Higher high' : 'Lower high'
    return e === top ? 'Higher low' : 'Lower low'
  }
  const firstAhead = nowMinutes === null ? null : ex.find((e) => minutesOf(e.timestamp) > nowMinutes) ?? null
  return ex.map((e) => {
    const m = minutesOf(e.timestamp)
    const dark = (day.sunrise !== null && m < day.sunrise) || (day.sunset !== null && m > day.sunset)
    let when: NamedExtreme['when']
    if (nowMinutes !== null && m <= nowMinutes) when = 'earlier'
    else if (e === firstAhead) when = 'next'
    else if (dark) when = 'after dark'
    else when = 'later'
    return { ...e, name: name(e), when, minutesAway: nowMinutes !== null && m > nowMinutes ? m - nowMinutes : null }
  })
}

export const durationText = (min: number) => (min < 60 ? `${min} m` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} m`)

export type Bands = { lowFt: number; highFt: number }
export const bandOfTide = (ft: number, b: Bands): 'Low band' | 'Mid' | 'High band' => (ft <= b.lowFt ? 'Low band' : ft >= b.highFt ? 'High band' : 'Mid')

/** The lowest daylight low each day, for the week strip. */
export function daylightLows(days: readonly DayFacts[]): { date: string; time: string | null; heightFt: number | null }[] {
  return days.map((d) => {
    const lows = d.tideExtremes.filter((e) => {
      if (e.kind !== 'low') return false
      const m = minutesOf(e.timestamp)
      return (d.sunrise === null || m >= d.sunrise) && (d.sunset === null || m <= d.sunset)
    })
    if (!lows.length) return { date: d.date, time: null, heightFt: null }
    const low = lows.reduce((a, b) => (b.heightFt < a.heightFt ? b : a))
    return { date: d.date, time: formatClockTime(low.timestamp), heightFt: low.heightFt }
  })
}

/** One plain sentence about the day's mixed tide. */
export function mixedTideNote(day: DayFacts, isToday: boolean): string {
  const lows = day.tideExtremes.filter((e) => e.kind === 'low')
  const base = 'Honolulu has mixed tides: two unequal highs and lows a day.'
  if (lows.length < 2) return base
  const lower = lows.reduce((a, b) => (b.heightFt < a.heightFt ? b : a))
  const other = lows.find((l) => l !== lower)!
  const inDaylight = (e: Extreme) => {
    const m = minutesOf(e.timestamp)
    return (day.sunrise === null || m >= day.sunrise) && (day.sunset === null || m <= day.sunset)
  }
  const part = (e: Extreme) => {
    const h = Number(e.timestamp.slice(11, 13))
    return h < 11 ? 'morning' : h < 14 ? 'midday' : 'afternoon'
  }
  const which = isToday ? (Number(lower.timestamp.slice(11, 13)) >= 18 ? 'Tonight’s' : 'Today’s') : 'The day’s'
  if (!inDaylight(lower) && inDaylight(other)) {
    return `${base} ${which} lower low is after dark, so the ${part(other)} low is the one that counts.`
  }
  if (inDaylight(lower)) return `${base} The lower low comes in daylight, at ${formatClockTime(lower.timestamp)}.`
  return `${base} Both lows fall outside daylight.`
}
