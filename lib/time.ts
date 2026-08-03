/**
 * Time handling for CoveCheck.
 *
 * Hawaiʻi observes Hawaiʻi-Aleutian Standard Time (UTC-10) year round and does
 * not use daylight saving. That makes the offset a constant, which is why these
 * helpers can be pure string math instead of pulling in a timezone library.
 * If CoveCheck ever supports a beach outside Hawaiʻi this file must be revisited
 * — see DECISIONS.md.
 */

export const HAWAII_UTC_OFFSET_HOURS = -10
const HAWAII_OFFSET_SUFFIX = '-10:00'

/** Matches Open-Meteo's local ISO form `2026-08-02T07:00` (no offset, no seconds). */
const OPEN_METEO_LOCAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/
/** Matches NOAA CO-OPS `lst_ldt` form `2026-08-02 07:00`. */
const NOAA_LOCAL = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/

/**
 * Normalize a provider's local timestamp into a canonical `YYYY-MM-DDTHH:mm`
 * Honolulu-local string. Throws on unrecognized shapes rather than guessing,
 * because a silently mis-parsed timestamp would misalign every data source.
 */
export function toHonoluluLocal(raw: string): string {
  const openMeteo = OPEN_METEO_LOCAL.exec(raw)
  if (openMeteo) return `${openMeteo[1]}T${openMeteo[2]}`

  const noaa = NOAA_LOCAL.exec(raw)
  if (noaa) return `${noaa[1]}T${noaa[2]}`

  throw new Error(`Unrecognized local timestamp format: ${JSON.stringify(raw)}`)
}

/** Convert a Honolulu-local timestamp to a UTC instant. */
export function honoluluLocalToUtc(local: string): Date {
  const canonical = toHonoluluLocal(local)
  return new Date(`${canonical}:00${HAWAII_OFFSET_SUFFIX}`)
}

/** Canonical Honolulu-local string for a UTC instant. */
export function utcToHonoluluLocal(instant: Date): string {
  const shifted = new Date(instant.getTime() + HAWAII_UTC_OFFSET_HOURS * 3600_000)
  return shifted.toISOString().slice(0, 16)
}

/** Calendar date (`YYYY-MM-DD`) a Honolulu-local timestamp falls on. */
export function honoluluDateOf(local: string): string {
  return toHonoluluLocal(local).slice(0, 10)
}

/** Hour-of-day 0-23 for a Honolulu-local timestamp. */
export function honoluluHourOf(local: string): number {
  return Number.parseInt(toHonoluluLocal(local).slice(11, 13), 10)
}
