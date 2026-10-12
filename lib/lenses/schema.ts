/**
 * Activity lens schema.
 *
 * A lens is data, not code: which factors an activity cares about and where each
 * one turns from good to mixed to poor. One evaluator (./evaluate.ts) runs every
 * lens, and a viewer's overrides are just a partial lens merged over the default.
 *
 * Wording rule: lenses speak in FIT — "Good fit / Mixed / Poor fit" — never in
 * safety. Nothing here may claim conditions are safe or unsafe.
 */

export type Fit = 'good' | 'mixed' | 'poor'

/** A factor's judgement for one hour. `off` = not a factor for this lens; `unknown` = no data. */
export type FactorTag = Fit | 'off' | 'unknown'

/** Lower is better: value ≤ good → good, ≤ mixed → mixed, else poor. `mixed: null` → never poor. */
export type CeilingRule = { kind: 'ceiling'; good: number; mixed: number | null }

/** Higher is better: value ≥ good → good, ≥ mixed → mixed, else poor. `mixed: null` → never poor. */
export type FloorRule = { kind: 'floor'; good: number; mixed: number | null }

/** Good inside a band; mixed inside a wider band; poor outside both. Inclusive. */
export type RangeRule = { kind: 'range'; good: [number, number]; mixed: [number, number] }

/**
 * Wind, by direction, because fetch decides what wind does to the water.
 * Offshore wind flattens a lee-side cove; onshore (and cross-shore, treated as
 * onshore) roughens it. Gusts are judged on their own ceilings; the worse wins.
 */
export type WindRule = {
  kind: 'wind'
  offshore: { good: number; mixed: number | null }
  onshore: { good: number; mixed: number | null }
  gustOffshore: { good: number; mixed: number | null }
  gustOnshore: { good: number; mixed: number | null }
}

/** Uses the beach's own calibrated tide band (lib/beach). Out of band gives `outside`. */
export type TideBandRule = { kind: 'tideBand'; outside: Fit }

/** Present → `whenPresent`; absent → good. For advisories, jellyfish, storms. */
export type FlagRule = { kind: 'flag'; whenPresent: Fit }

export type OffRule = { kind: 'off' }

export type FactorRule = CeilingRule | FloorRule | RangeRule | WindRule | TideBandRule | FlagRule | OffRule

/**
 * Every factor a lens can weigh.
 *
 * waves       — swell reaching the beach (ft, direction-filtered), plus NWS extreme surf
 * wind        — sustained and gust mph, by direction
 * tide        — against the beach's tide band
 * clarity     — estimated underwater visibility (ft)
 * uv          — UV index
 * rain        — chance of rain (%)
 * storms      — thunderstorms forecast
 * waterTemp   — sea surface temperature (°F)
 * waterQuality— Health Dept. brown water / bacteria / sewage advisory nearby
 * jellyfish   — box jellyfish window (8-10 days after full moon)
 * advisories  — NWS hazards (high surf etc.)
 */
export type FactorId =
  | 'waves'
  | 'wind'
  | 'tide'
  | 'clarity'
  | 'uv'
  | 'rain'
  | 'storms'
  | 'waterTemp'
  | 'waterQuality'
  | 'jellyfish'
  | 'advisories'

export const FACTOR_IDS: readonly FactorId[] = [
  'waves',
  'wind',
  'tide',
  'clarity',
  'uv',
  'rain',
  'storms',
  'waterTemp',
  'waterQuality',
  'jellyfish',
  'advisories',
]

export type LensId = 'snorkel' | 'dive' | 'surf' | 'beach'

export type Lens = {
  id: LensId
  /** "Snorkel" — the picker label. */
  name: string
  /** "snorkeling" — used in sentences. */
  activity: string
  factors: Record<FactorId, FactorRule>
  /** Consecutive good hours needed before a stretch counts as "best hours". */
  minGoodHours: number
}

/** What a viewer may change: any factor's rule, per lens. */
export type LensOverrides = Partial<Record<FactorId, FactorRule>>
