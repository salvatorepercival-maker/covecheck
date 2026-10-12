/**
 * Box jellyfish calendar.
 *
 * On Oahu's south and leeward shores, box jellyfish (Alatina) come ashore about
 * 8-10 days after each full moon — the pattern the Waikīkī Aquarium and Honolulu
 * Ocean Safety publish their calendars from. This computes those days from the
 * moon; it is a calendar prediction, not an observation, and is labelled so.
 */

/** Mean synodic month, days. */
const SYNODIC_DAYS = 29.530588853
/** A known full moon: 2000-01-21 04:40 UTC. */
const REFERENCE_FULL_MOON_MS = Date.UTC(2000, 0, 21, 4, 40)
const DAY_MS = 86_400_000

/** Days after a full moon that box jellyfish are expected. */
export const JELLY_DAYS_AFTER_FULL_MOON = { first: 8, last: 10 } as const

/**
 * Full moons whose UTC instant falls within [fromMs, toMs].
 *
 * Mean-phase arithmetic drifts from the true full moon by up to ~14 hours, which
 * can move the calendar date by one. The window is already a ±1-day estimate, so
 * that error is inside its own tolerance.
 */
export function fullMoonsBetween(fromMs: number, toMs: number): number[] {
  const period = SYNODIC_DAYS * DAY_MS
  const first = Math.ceil((fromMs - REFERENCE_FULL_MOON_MS) / period)
  const out: number[] = []
  for (let k = first; REFERENCE_FULL_MOON_MS + k * period <= toMs; k++) out.push(REFERENCE_FULL_MOON_MS + k * period)
  return out
}

/** "2026-10-26" for an instant, in Hawaiʻi time. */
const hstDate = (ms: number) => new Date(ms - 10 * 3_600_000).toISOString().slice(0, 10)

const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export type JellyWindow = { start: string; end: string }

/** Jellyfish windows that end on or after `date`, soonest first. */
export function jellyWindowsFrom(date: string, count = 2): JellyWindow[] {
  const [y, m, d] = date.split('-').map(Number)
  const fromMs = Date.UTC(y, m - 1, d) - 12 * DAY_MS
  const moons = fullMoonsBetween(fromMs, fromMs + (count + 1) * SYNODIC_DAYS * DAY_MS)
  return moons
    .map((ms) => {
      const fullDate = hstDate(ms)
      return {
        start: addDays(fullDate, JELLY_DAYS_AFTER_FULL_MOON.first),
        end: addDays(fullDate, JELLY_DAYS_AFTER_FULL_MOON.last),
      }
    })
    .filter((window) => window.end >= date)
    .slice(0, count)
}

export type JellyOutlook = {
  expected: boolean
  /** The current window when expected, otherwise the next one. */
  window: JellyWindow | null
}

export function jellyOutlook(date: string): JellyOutlook {
  const [current] = jellyWindowsFrom(date, 1)
  if (!current) return { expected: false, window: null }
  return { expected: date >= current.start && date <= current.end, window: current }
}
