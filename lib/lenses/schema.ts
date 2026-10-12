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

/**
 * Shared by every rule. `affectsFit: false` keeps the factor's tag on its tile
 * but leaves it out of the hour and day fit — for factors not yet trustworthy
 * enough to decide anything (the uncalibrated clarity estimate). Default true.
 */
type RuleBase = { affectsFit?: boolean }

/** Lower is better: value ≤ good → good, ≤ mixed → mixed, else poor. `mixed: null` → never poor. */
export type CeilingRule = RuleBase & { kind: 'ceiling'; good: number; mixed: number | null }

/** Higher is better: value ≥ good → good, ≥ mixed → mixed, else poor. `mixed: null` → never poor. */
export type FloorRule = RuleBase & { kind: 'floor'; good: number; mixed: number | null }

/** Good inside a band; mixed inside a wider band; poor outside both. Inclusive. */
export type RangeRule = RuleBase & { kind: 'range'; good: [number, number]; mixed: [number, number] }

export type Limits = { good: number; mixed: number | null }

/**
 * Wind, by the beach's three direction classes (lib/conditions/wind.ts).
 * Sustained and gusts are judged on their own ceilings; the worse wins.
 *
 * `offshoreNoLooserThanCross`: offshore wind smooths the surface but pushes
 * swimmers and floating gear out to sea, so for in-water lenses the offshore
 * limits are capped at the cross-shore ones — even if an override loosens them.
 */
export type WindRule = RuleBase & {
  kind: 'wind'
  offshore: Limits
  cross: Limits
  onshore: Limits
  gustOffshore: Limits
  gustCross: Limits
  gustOnshore: Limits
  offshoreNoLooserThanCross: boolean
}

/** NWS products, split by severity: anything named a Warning vs everything else. */
export type HazardRule = RuleBase & { kind: 'hazard'; advisory: Fit; warning: Fit }

/** Uses the beach's own calibrated tide band (lib/beach). Out of band gives `outside`. */
export type TideBandRule = RuleBase & { kind: 'tideBand'; outside: Fit }

/** Present → `whenPresent`; absent → good. For advisories, jellyfish, storms. */
export type FlagRule = RuleBase & { kind: 'flag'; whenPresent: Fit }

export type OffRule = { kind: 'off' }

export type FactorRule = CeilingRule | FloorRule | RangeRule | WindRule | HazardRule | TideBandRule | FlagRule | OffRule

export const affectsFit = (rule: FactorRule) => rule.kind !== 'off' && rule.affectsFit !== false

/**
 * Every factor a lens can weigh.
 *
 * waves       — swell ENERGY reaching the beach (Σ H²T, ft²·s, direction-filtered), plus NWS extreme surf
 * chop        — wind waves reaching the beach (ft)
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
  | 'chop'
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
  'chop',
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
