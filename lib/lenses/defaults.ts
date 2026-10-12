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
      waves: { kind: 'ceiling', good: 3, mixed: 4 },
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
    },
  },

  /** Stricter on clarity and on swell, which is surge at depth. */
  dive: {
    id: 'dive',
    name: 'Dive',
    activity: 'diving',
    minGoodHours: 2,
    factors: {
      waves: { kind: 'ceiling', good: 2, mixed: 3 },
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
    },
  },

  /** Swell is the point: good inside a range from the open window. Light or offshore wind. */
  surf: {
    id: 'surf',
    name: 'Surf',
    activity: 'surfing',
    minGoodHours: 2,
    factors: {
      waves: { kind: 'range', good: [2, 6], mixed: [1, 8] },
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
    },
  },

  /** Shore break and sun matter; what's under the water doesn't. */
  beach: {
    id: 'beach',
    name: 'Beach',
    activity: 'a beach day',
    minGoodHours: 2,
    factors: {
      waves: { kind: 'ceiling', good: 2, mixed: 4 },
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
    },
  },
}

export const LENS_ORDER: readonly LensId[] = ['snorkel', 'dive', 'surf', 'beach']
