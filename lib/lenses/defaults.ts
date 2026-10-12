import type { FactorRule, Lens, LensId } from './schema'

/**
 * Default lenses.
 *
 * Snorkel starts from the engine's kid-snorkel thresholds for Cromwell's
 * (lib/beach/cromwells.ts): swell 3 / 4 ft, onshore wind 8 / 12 mph and gusts
 * 12 / 18, the provisional tide band. Offshore and cross-shore wind were set
 * tighter by Sal on 2026-10-11 (see IN_WATER_WIND).
 * Everything else here is a starting point, set 2026-10-11 and listed for
 * review in the PR — none of it is calibrated yet. Visit reports are the
 * calibration dataset.
 */

const off: FactorRule = { kind: 'off' }

/**
 * Swell is judged on energy, Σ H²T (ft²·s). Defaults are v2's height rules
 * converted at T = 10 s — the energy-weighted mean exposed period over
 * 2025-04-14 → 2026-10-11 (lib/backtest/swell-energy.live.ts), where the
 * conversion is balanced: about as many hours judged stricter as looser.
 * A 3 ft swell at 10 s = 90; at 15 s = 135.
 */
const E = (ft: number) => Math.round(ft * ft * 10)

/**
 * In-water wind, set by Sal 2026-10-11. Offshore is held to the cross-shore
 * limits — it flattens the surface but pushes swimmers out to sea. Onshore is
 * the engine's original onshore ceilings.
 */
const IN_WATER_WIND: FactorRule = {
  kind: 'wind',
  offshore: { good: 12, mixed: 18 },
  cross: { good: 12, mixed: 18 },
  onshore: { good: 8, mixed: 12 },
  gustOffshore: { good: 18, mixed: 25 },
  gustCross: { good: 18, mixed: 25 },
  gustOnshore: { good: 12, mixed: 18 },
  offshoreNoLooserThanCross: true,
}

/** NWS: for every lens but surf, an advisory or a warning is poor. */
const HAZARD_POOR: FactorRule = { kind: 'hazard', advisory: 'poor', warning: 'poor' }

/** Not calibrated: tagged on the tile, kept out of the fit (Sal, 2026-10-11). */
const clarity = (good: number, mixed: number): FactorRule => ({ kind: 'floor', good, mixed, affectsFit: false })

export const DEFAULT_LENSES: Record<LensId, Lens> = {
  snorkel: {
    id: 'snorkel',
    name: 'Snorkel',
    activity: 'snorkeling',
    minGoodHours: 2,
    factors: {
      waves: { kind: 'ceiling', good: E(3), mixed: E(4) },
      chop: { kind: 'ceiling', good: 1, mixed: 2 },
      wind: IN_WATER_WIND,
      tide: { kind: 'tideBand', outside: 'mixed' },
      clarity: clarity(15, 10),
      uv: { kind: 'ceiling', good: 8, mixed: null },
      rain: { kind: 'ceiling', good: 40, mixed: 70 },
      storms: { kind: 'flag', whenPresent: 'poor' },
      waterTemp: { kind: 'floor', good: 74, mixed: 68 },
      waterQuality: { kind: 'flag', whenPresent: 'poor' },
      jellyfish: { kind: 'flag', whenPresent: 'mixed' },
      advisories: HAZARD_POOR,
      closures: { kind: 'flag', whenPresent: 'poor' },
      tideFlow: off,
    },
  },

  /** Stricter on clarity and on swell, which is surge at depth. */
  dive: {
    id: 'dive',
    name: 'Dive',
    activity: 'diving',
    minGoodHours: 2,
    factors: {
      waves: { kind: 'ceiling', good: E(2), mixed: E(3) },
      chop: { kind: 'ceiling', good: 1, mixed: 2 },
      wind: IN_WATER_WIND,
      tide: { kind: 'tideBand', outside: 'mixed' },
      clarity: clarity(25, 15),
      uv: off,
      rain: { kind: 'ceiling', good: 50, mixed: 80 },
      storms: { kind: 'flag', whenPresent: 'poor' },
      waterTemp: off,
      waterQuality: { kind: 'flag', whenPresent: 'poor' },
      jellyfish: { kind: 'flag', whenPresent: 'mixed' },
      advisories: HAZARD_POOR,
      closures: { kind: 'flag', whenPresent: 'poor' },
      tideFlow: off,
    },
  },

  /** Swell is the point: good inside a range from the open window. Light or offshore wind. */
  surf: {
    id: 'surf',
    name: 'Surf',
    activity: 'surfing',
    minGoodHours: 2,
    factors: {
      waves: { kind: 'range', good: [E(2), E(6)], mixed: [E(1), E(8)] },
      chop: { kind: 'ceiling', good: 1.5, mixed: 3 },
      // Unchanged from v2's first cut; cross-shore takes the old onshore
      // limits, which is what cross-shore was judged on before.
      wind: {
        kind: 'wind',
        offshore: { good: 15, mixed: 25 },
        cross: { good: 6, mixed: 12 },
        onshore: { good: 6, mixed: 12 },
        gustOffshore: { good: 25, mixed: 35 },
        gustCross: { good: 10, mixed: 18 },
        gustOnshore: { good: 10, mixed: 18 },
        offshoreNoLooserThanCross: false,
      },
      tide: off,
      clarity: off,
      uv: off,
      rain: { kind: 'ceiling', good: 60, mixed: null },
      storms: { kind: 'flag', whenPresent: 'poor' },
      waterTemp: off,
      waterQuality: { kind: 'flag', whenPresent: 'poor' },
      jellyfish: off,
      // A High Surf Advisory is a big day, not an empty one; a warning is not.
      advisories: { kind: 'hazard', advisory: 'mixed', warning: 'poor' },
      closures: { kind: 'flag', whenPresent: 'poor' },
      tideFlow: off,
    },
  },

  /** Shore break and sun matter; what's under the water doesn't. */
  beach: {
    id: 'beach',
    name: 'Beach',
    activity: 'a beach day',
    minGoodHours: 2,
    factors: {
      waves: { kind: 'ceiling', good: E(2), mixed: E(4) },
      chop: { kind: 'ceiling', good: 2, mixed: 3 },
      // Sustained limits set by Sal 2026-10-11. Gusts are a starting guess,
      // kept offshore ≤ cross-shore like the sustained limits.
      wind: {
        kind: 'wind',
        offshore: { good: 15, mixed: 22 },
        cross: { good: 18, mixed: 25 },
        onshore: { good: 15, mixed: 25 },
        gustOffshore: { good: 22, mixed: 30 },
        gustCross: { good: 25, mixed: 35 },
        gustOnshore: { good: 25, mixed: 35 },
        offshoreNoLooserThanCross: true,
      },
      tide: off,
      clarity: off,
      uv: { kind: 'ceiling', good: 7, mixed: null },
      rain: { kind: 'ceiling', good: 30, mixed: 60 },
      storms: { kind: 'flag', whenPresent: 'poor' },
      waterTemp: off,
      waterQuality: { kind: 'flag', whenPresent: 'poor' },
      jellyfish: { kind: 'flag', whenPresent: 'mixed' },
      advisories: HAZARD_POOR,
      closures: { kind: 'flag', whenPresent: 'poor' },
      tideFlow: off,
    },
  },
}

export const LENS_ORDER: readonly LensId[] = ['snorkel', 'dive', 'surf', 'beach']

/**
 * The rule a factor gets when a viewer turns it on from "not a factor" in the
 * settings editor. Only tideFlow is off everywhere by default; the rest are
 * here so any off factor can be turned on.
 */
export const ENABLE_TEMPLATES: Partial<Record<import('./schema').FactorId, FactorRule>> = {
  tideFlow: { kind: 'flag', whenPresent: 'mixed' },
  tide: { kind: 'tideBand', outside: 'mixed' },
  clarity: { kind: 'floor', good: 15, mixed: 10, affectsFit: false },
  uv: { kind: 'ceiling', good: 8, mixed: null },
  waterTemp: { kind: 'floor', good: 74, mixed: 68 },
  jellyfish: { kind: 'flag', whenPresent: 'mixed' },
}
