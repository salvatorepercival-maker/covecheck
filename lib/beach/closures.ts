/**
 * Beach closures and shark-sighting closures — entered by hand.
 *
 * There is no permitted machine-readable source for Black Point (checked
 * 2026-10-12): Honolulu Ocean Safety's live feed sits behind safebeachday.com,
 * whose terms allow personal use only, and it has no lifeguard tower at
 * Cromwell's; DLNR's shark page lists confirmed incidents days later, not
 * sightings or closures. So closures are kept here. Add one when you see a
 * posted closure; it shows on the Advisories tile and makes every lens Poor
 * until `endsUtc` (or until you remove it).
 *
 *   { kind: 'shark', title: 'Shark sighting — beach closed', startsUtc: '2026-10-14T18:00:00Z', endsUtc: null, source: 'Posted signs' }
 */

export type Closure = {
  kind: 'closure' | 'shark'
  title: string
  /** When it took effect, UTC ISO. */
  startsUtc: string
  /** When it lifts, UTC ISO; null = until removed. */
  endsUtc: string | null
  /** Where it was seen: "Posted signs", "Ocean Safety on Instagram", … */
  source: string
}

export const CROMWELLS_CLOSURES: readonly Closure[] = []

/**
 * The last date (HST, "YYYY-MM-DD") someone checked for posted closures and
 * updated this file. Null = never. The Advisories tile shows it, so an empty
 * list is never read as "all clear".
 */
export const CLOSURES_LAST_CHECKED: string | null = null

/** Closures in effect at an instant. */
export function closuresAt(closures: readonly Closure[], atMs: number): Closure[] {
  return closures.filter((c) => Date.parse(c.startsUtc) <= atMs && (c.endsUtc === null || Date.parse(c.endsUtc) > atMs))
}
