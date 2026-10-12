import type { ShoreAspect, SurfZoneForecast } from '../types'

/**
 * Which hours each NWS Surf Zone Forecast column covers (DECISIONS #23).
 *
 * The SRF table is labelled by period, not by clock: "Tonight PM", "Tonight AM",
 * "Monday AM", "Monday PM", relative to when it was issued. Each column bounds
 * only its own hours. Hours no column covers get no NWS bound at all — the
 * cove-filtered swell energy judges them alone. Applying the worst column to the
 * whole week (the old day-level bound, #6) walled off days the NWS never forecast.
 */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const DAY_MS = 86_400_000

/** "2026-10-12" for a UTC instant, in Hawaiʻi time. */
const hstDate = (utcMs: number) => new Date(utcMs - 10 * 3_600_000).toISOString().slice(0, 10)
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

/** Local [start, end) hour window a column covers, as "YYYY-MM-DDTHH" bounds, or null if unrecognised. */
export function columnWindow(column: string, issuedUtc: string): { start: string; end: string } | null {
  const m = /^(.+?)\s+(AM|PM)$/i.exec(column.trim())
  if (!m) return null
  const day = m[1].trim().toLowerCase()
  const half = m[2].toUpperCase()
  const issued = hstDate(Date.parse(issuedUtc))
  const at = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}`

  if (day === 'tonight') {
    // Tonight PM = this evening; Tonight AM = the small hours after midnight.
    return half === 'PM' ? { start: at(issued, 18), end: at(addDays(issued, 1), 0) } : { start: at(addDays(issued, 1), 0), end: at(addDays(issued, 1), 6) }
  }
  let date: string | null = null
  if (day === 'today' || day === 'this afternoon' || day === 'rest of today') date = issued
  else {
    const target = WEEKDAYS.indexOf(day)
    if (target < 0) return null
    // The issue day is labelled by name too when issued overnight; same weekday = issue date.
    date = addDays(issued, (target - weekdayOf(issued) + 7) % 7)
  }
  return half === 'AM' ? { start: at(date, 0), end: at(date, 12) } : { start: at(date, 12), end: at(addDays(date, 1), 0) }
}

/**
 * A lookup from a local hour timestamp ("2026-10-12T09:00") to the NWS surf-face
 * maximum for this shore at that hour, or null when no column covers it.
 */
export function srfBoundAt(forecast: SurfZoneForecast | null | undefined, shore: ShoreAspect): ((localTimestamp: string) => number | null) | null {
  if (!forecast) return null
  const windows = forecast.bands
    .filter((b) => b.shore === shore)
    .map((b) => ({ maxFt: b.maxFt, window: columnWindow(b.column, forecast.issuedUtc) }))
    .filter((w): w is { maxFt: number; window: { start: string; end: string } } => w.window !== null)
  if (windows.length === 0) return null
  return (ts: string) => {
    const hour = ts.slice(0, 13)
    const covering = windows.filter((w) => hour >= w.window.start && hour < w.window.end)
    return covering.length ? Math.max(...covering.map((w) => w.maxFt)) : null
  }
}
