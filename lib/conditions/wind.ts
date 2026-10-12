import { SEAWARD_BEARING, type ShoreFacing } from '../geo'

export type WindClass = 'offshore' | 'cross' | 'onshore'

/** Smallest angle between two bearings, 0-180. */
const angleBetween = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360)
  return d > 180 ? 360 - d : d
}

/**
 * Three-way wind class for a beach, from the direction the wind blows FROM.
 * Offshore wind comes from the land side (seaward bearing + 180°); onshore wind
 * comes from the sea (the seaward bearing itself).
 */
export function windClassFor(
  fromDeg: number,
  facing: ShoreFacing,
  classes: { offshoreHalfArcDeg: number; onshoreHalfArcDeg: number },
): WindClass {
  const seaward = SEAWARD_BEARING[facing]
  if (angleBetween(fromDeg, (seaward + 180) % 360) <= classes.offshoreHalfArcDeg) return 'offshore'
  if (angleBetween(fromDeg, seaward) <= classes.onshoreHalfArcDeg) return 'onshore'
  return 'cross'
}

export const WIND_CLASS_WORDS: Record<WindClass, string> = {
  offshore: 'offshore',
  cross: 'cross-shore',
  onshore: 'onshore',
}

/** NWS products: anything named a Warning is the stronger class; everything else is advisory-level. */
export function hazardLevel(event: string): 'warning' | 'advisory' {
  return /\bwarning\b/i.test(event) ? 'warning' : 'advisory'
}
