import type { FactorRule, Lens, LensId } from './schema'

/**
 * Default lenses.
 *
 * Snorkel starts from the engine's kid-snorkel thresholds for Cromwell's
 * (lib/beach/cromwells.ts): swell 3 / 4 ft, wind 25 / 32 mph offshore and
 * 8 / 12 mph onshore, gusts 31 / 40 and 12 / 18, the provisional tide band.
 * Everything else here is a starting point, set 2026-10-11 and listed for
 * review in the PR — none of it is calibrated yet. Visit reports are the
 * calibration dataset.
 */

const off: FactorRule = { kind: 'off' }

/** The engine's own wind ceilings for this beach. */
const SNORKEL_WIND: FactorRule = {
  kind: 'wind',
  offshore: { good: 25, mixed: 32 },
  onshore: { good: 8, mixed: 12 },
  gustOffshore: { good: 31, mixed: 40 },
  gustOnshore: { good: 12, mixed: 18 },
}

export const DEFAULT_LENSES: Record<LensId, Lens> = {
  snorkel: {
    id: 'snorkel',
    name: 'Snorkel',
    activity: 'snorkeling',
    minGoodHours: 2,
    factors: {
      waves: { kind: 'ceiling', good: 3, mixed: 4 },
      wind: SNORKEL_WIND,
      tide: { kind: 'tideBand', outside: 'mixed' },
      clarity: { kind: 'floor', good: 15, mixed: 10 },
      uv: { kind: 'ceiling', good: 8, mixed: null },
      rain: { kind: 'ceiling', good: 40, mixed: 70 },
      storms: { kind: 'flag', whenPresent: 'poor' },
      waterTemp: { kind: 'floor', good: 74, mixed: 68 },
      waterQuality: { kind: 'flag', whenPresent: 'poor' },
      jellyfish: { kind: 'flag', whenPresent: 'mixed' },
      advisories: { kind: 'flag', whenPresent: 'poor' },
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
      wind: SNORKEL_WIND,
      tide: { kind: 'tideBand', outside: 'mixed' },
      clarity: { kind: 'floor', good: 25, mixed: 15 },
      uv: off,
      rain: { kind: 'ceiling', good: 50, mixed: 80 },
      storms: { kind: 'flag', whenPresent: 'poor' },
      waterTemp: { kind: 'floor', good: 76, mixed: 72 },
      waterQuality: { kind: 'flag', whenPresent: 'poor' },
      jellyfish: { kind: 'flag', whenPresent: 'mixed' },
      advisories: { kind: 'flag', whenPresent: 'poor' },
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
      wind: {
        kind: 'wind',
        offshore: { good: 15, mixed: 25 },
        onshore: { good: 6, mixed: 12 },
        gustOffshore: { good: 25, mixed: 35 },
        gustOnshore: { good: 10, mixed: 18 },
      },
      tide: off,
      clarity: off,
      uv: off,
      rain: { kind: 'ceiling', good: 60, mixed: null },
      storms: { kind: 'flag', whenPresent: 'poor' },
      waterTemp: off,
      waterQuality: { kind: 'flag', whenPresent: 'poor' },
      jellyfish: off,
      // A High Surf Advisory is a big day, not an empty one — experienced only.
      advisories: { kind: 'flag', whenPresent: 'mixed' },
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
      wind: {
        kind: 'wind',
        offshore: { good: 20, mixed: 30 },
        onshore: { good: 15, mixed: 25 },
        gustOffshore: { good: 30, mixed: 40 },
        gustOnshore: { good: 25, mixed: 35 },
      },
      tide: off,
      clarity: off,
      uv: { kind: 'ceiling', good: 7, mixed: 10 },
      rain: { kind: 'ceiling', good: 30, mixed: 60 },
      storms: { kind: 'flag', whenPresent: 'poor' },
      waterTemp: off,
      waterQuality: { kind: 'flag', whenPresent: 'poor' },
      jellyfish: { kind: 'flag', whenPresent: 'mixed' },
      advisories: { kind: 'flag', whenPresent: 'poor' },
    },
  },
}

export const LENS_ORDER: readonly LensId[] = ['snorkel', 'dive', 'surf', 'beach']
