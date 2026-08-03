/**
 * Compass-direction helpers.
 *
 * Every range here is inclusive and expressed in degrees-from-true-north, the
 * convention every provider we use reports in. Ranges may wrap through 0°/360°
 * (e.g. a north-facing shore exposed from 315° to 45°), which is the case that
 * naive `from <= x && x <= to` comparisons get wrong.
 */

export type DirectionRange = {
  /** Inclusive start of the arc, sweeping clockwise toward `toDeg`. */
  fromDeg: number
  /** Inclusive end of the arc. May be numerically less than `fromDeg` when the arc wraps through north. */
  toDeg: number
}

/** Fold any degree value into [0, 360). */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** True when `deg` falls inside the arc, handling arcs that wrap through north. */
export function isDirectionInRange(deg: number, range: DirectionRange): boolean {
  const d = normalizeDeg(deg)
  const from = normalizeDeg(range.fromDeg)
  const to = normalizeDeg(range.toDeg)

  // Non-wrapping arc: 135° -> 225°
  if (from <= to) return d >= from && d <= to

  // Wrapping arc: 315° -> 45° means [315, 360) plus [0, 45]
  return d >= from || d <= to
}

/** True when `deg` falls inside any of the arcs. */
export function isDirectionInAnyRange(deg: number, ranges: readonly DirectionRange[]): boolean {
  return ranges.some((r) => isDirectionInRange(deg, r))
}

/**
 * Smallest absolute angular separation between two bearings, in degrees [0, 180].
 * Used for "how far off-window is this swell" reporting, not for gating.
 */
export function angularDistanceDeg(a: number, b: number): number {
  const diff = Math.abs(normalizeDeg(a) - normalizeDeg(b))
  return diff > 180 ? 360 - diff : diff
}

/** Compass bearing a shore faces out to sea. */
export const SEAWARD_BEARING = { north: 0, east: 90, south: 180, west: 270 } as const

export type ShoreFacing = keyof typeof SEAWARD_BEARING

/**
 * Whether the wind blows land-to-sea, sea-to-land, or across the shore.
 *
 * This is derived geometrically rather than hand-listed per beach, because it is
 * pure geometry: wind directions are reported as the bearing the wind comes
 * *from*, so it travels toward `origin + 180`. Projected onto the shore's seaward
 * normal, a positive component means it is heading out to sea.
 *
 * It matters because fetch does. Offshore wind has no open water upwind to build
 * chop on, so it flattens the surface; onshore wind arrives with the whole ocean
 * behind it. At a south-facing Oahu cove the ENE trades therefore come over the
 * land and leave the water smooth, which is exactly why the south shores are the
 * swimmable ones in trade season while the east shores are rough.
 */
export type WindExposure = 'offshore' | 'onshore' | 'cross'

/** Below this |component| the wind is essentially alongshore. */
const CROSS_SHORE_DEADBAND = 0.25

export function windExposureFor(originDeg: number, facing: ShoreFacing): WindExposure {
  const travellingToward = normalizeDeg(originDeg + 180)
  const seaward = SEAWARD_BEARING[facing]
  const component = Math.cos(((travellingToward - seaward) * Math.PI) / 180)

  if (component > CROSS_SHORE_DEADBAND) return 'offshore'
  if (component < -CROSS_SHORE_DEADBAND) return 'onshore'
  return 'cross'
}

/**
 * Combine independent wave partitions into a single significant height.
 *
 * Significant wave heights are proportional to the square root of energy, so
 * partitions add in quadrature rather than linearly. Two 2 ft swells make a
 * 2.8 ft sea, not a 4 ft one.
 */
export function combineWaveHeightsFt(...heightsFt: readonly (number | null)[]): number | null {
  const present = heightsFt.filter((h): h is number => h !== null && Number.isFinite(h))
  if (present.length === 0) return null
  return Math.sqrt(present.reduce((sum, h) => sum + h * h, 0))
}
