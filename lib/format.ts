import { honoluluDateOf, honoluluHourOf } from './time'

/**
 * Display formatting.
 *
 * Kept separate from the engine so wording changes never touch verdict logic.
 * Everything here is pure and takes its "now" as an argument.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** `2026-08-02` → weekday index, computed from the date parts to avoid timezone drift. */
function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** "7 AM", "12 PM", "6 PM". Hours are whole in this product; minutes are never shown. */
export function formatHour(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24
  const suffix = normalized < 12 ? 'AM' : 'PM'
  const twelve = normalized % 12 === 0 ? 12 : normalized % 12
  return `${twelve} ${suffix}`
}

/**
 * A window's wall-clock span.
 *
 * `endTimestamp` is the *start* of the window's final hour, so the span runs an
 * hour past it: hours 6, 7 and 8 read as "6 – 9 AM".
 */
export function formatWindowRange(startTimestamp: string, endTimestamp: string): string {
  const start = honoluluHourOf(startTimestamp)
  const end = honoluluHourOf(endTimestamp) + 1

  const startSuffix = start < 12 ? 'AM' : 'PM'
  const endSuffix = end % 24 < 12 ? 'AM' : 'PM'
  const startTwelve = start % 12 === 0 ? 12 : start % 12

  // Drop the repeated meridiem within the same half of the day: "6 – 9 AM".
  if (startSuffix === endSuffix) return `${startTwelve} – ${formatHour(end)}`
  return `${formatHour(start)} – ${formatHour(end)}`
}

/** "Today", "Tomorrow", then "Mon 4". */
export function formatDayLabel(date: string, todayDate: string): string {
  if (date === todayDate) return 'Today'

  const [year, month, day] = date.split('-').map(Number)
  const asUtc = Date.UTC(year, month - 1, day)
  const [ty, tm, td] = todayDate.split('-').map(Number)
  const todayUtc = Date.UTC(ty, tm - 1, td)

  if (asUtc - todayUtc === 86_400_000) return 'Tomorrow'
  return `${WEEKDAYS[weekdayOf(date)]} ${day}`
}

/** Compact day-strip label: "Today" or "Mon". */
export function formatDayShort(date: string, todayDate: string): string {
  if (date === todayDate) return 'Today'
  return WEEKDAYS[weekdayOf(date)]
}

/** "2 Aug" — used in the expandable detail. */
export function formatDayDate(date: string): string {
  const [, month, day] = date.split('-').map(Number)
  return `${day} ${MONTHS[month - 1]}`
}

/**
 * "just now", "4 minutes ago", "2 hours ago".
 *
 * Freshness is load-bearing for trust, so this never rounds a stale figure down
 * to something reassuring — anything past a day reports the date instead.
 */
export function formatUpdatedAgo(updatedAtUtc: string, nowUtc: Date): string {
  const elapsedMs = nowUtc.getTime() - new Date(updatedAtUtc).getTime()
  const minutes = Math.floor(elapsedMs / 60_000)

  if (minutes < 0) return 'just now'
  if (minutes < 1) return 'just now'
  if (minutes === 1) return '1 minute ago'
  if (minutes < 60) return `${minutes} minutes ago`

  const hours = Math.floor(minutes / 60)
  if (hours === 1) return '1 hour ago'
  if (hours < 24) return `${hours} hours ago`

  const local = honoluluDateOf(
    new Date(new Date(updatedAtUtc).getTime() - 10 * 3_600_000).toISOString().slice(0, 16),
  )
  return `on ${formatDayDate(local)}`
}

/** Feet, to one decimal, or an em dash when absent. Never renders a missing value as 0. */
export function formatFeet(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} ft`
}

/** Whole miles per hour, or an em dash. */
export function formatMph(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)} mph`
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const

/** 182° → "S". Plain-language direction for people who do not read bearings. */
export function formatCompass(deg: number | null): string {
  if (deg === null) return '—'
  const index = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16
  return COMPASS[index]
}

const TIDE_STAGE_COPY: Record<string, string> = {
  rising: 'Rising',
  falling: 'Falling',
  'near-high': 'Near high',
  'near-low': 'Near low',
  unknown: 'Unknown',
}

export function formatTideStage(stage: string): string {
  return TIDE_STAGE_COPY[stage] ?? 'Unknown'
}
