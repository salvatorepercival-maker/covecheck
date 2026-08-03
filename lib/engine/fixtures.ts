import { CROMWELLS } from '../beach/cromwells'
import { honoluluLocalToUtc } from '../time'
import type {
  BeachHazard,
  BeachProfile,
  HourlyBeachConditions,
  ProviderId,
  SourceFreshness,
  SourceStatus,
  TideStage,
} from '../types'

/**
 * Synthetic scenario fixtures for the recommendation engine.
 *
 * These consume *normalized* input, so `exposedSwellHeightFt` is set directly
 * rather than derived — engine tests exercise the engine, and normalization has
 * its own tests against real payloads.
 *
 * The seven scenarios are the ones HANDOFF.md asks for.
 */

const DATE = '2026-08-02'
const FETCHED_AT = '2026-08-02T17:00:00.000Z'

export function freshness(
  overrides: Partial<Record<ProviderId, SourceStatus>> = {},
  fetchedAtUtc = FETCHED_AT,
): SourceFreshness {
  const providers: ProviderId[] = ['marine', 'weather', 'tides', 'alerts']
  const entries: SourceFreshness = {}
  for (const provider of providers) {
    entries[provider] = {
      fetchedAtUtc,
      observedAtUtc: null,
      status: overrides[provider] ?? 'ok',
      ageSeconds: 300,
    }
  }
  return entries
}

export const HIGH_SURF_ADVISORY: BeachHazard = {
  event: 'High Surf Advisory',
  severity: 'advisory',
  headline: 'High Surf Advisory in effect for south facing shores',
  onsetUtc: '2026-08-02T18:00:00.000Z',
  endsUtc: '2026-08-03T18:00:00.000Z',
  isBlocking: true,
}

export type HourSpec = {
  /** Local hour of day on 2026-08-02. */
  hour: number
  exposedSwellHeightFt?: number | null
  /** Direction of the in-window partition, when one is present. */
  swellDirectionDeg?: number
  windSpeedMph?: number | null
  windGustMph?: number | null
  windDirectionDeg?: number | null
  precipitationIn?: number | null
  tideRangeFraction?: number | null
  tideHeightFt?: number | null
  tideStage?: TideStage
  hazards?: readonly BeachHazard[]
  freshnessOverrides?: Partial<Record<ProviderId, SourceStatus>>
}

/** Baseline: a pleasant, fully-measured hour. Individual specs override fields. */
export function buildHour(spec: HourSpec): HourlyBeachConditions {
  const timestamp = `${DATE}T${String(spec.hour).padStart(2, '0')}:00`
  const exposed = spec.exposedSwellHeightFt === undefined ? 1 : spec.exposedSwellHeightFt
  const swellDirection = spec.swellDirectionDeg ?? 180

  return {
    timestamp,
    timestampUtc: honoluluLocalToUtc(timestamp).toISOString(),

    // Raw model figures reflect the real trade-wind situation: a large easterly
    // sea state that the exposure filter is expected to discard.
    modelSigWaveHeightFt: 4.8,
    modelSigWaveDirectionDeg: 104,
    modelSigWavePeriodSec: 7.5,
    modelSwellHeightFt: exposed === null ? null : Math.max(exposed, 0),
    modelSwellDirectionDeg: exposed === null ? null : swellDirection,
    modelSwellPeriodSec: 12,
    modelSecondarySwellHeightFt: null,
    modelSecondarySwellDirectionDeg: null,
    modelSecondarySwellPeriodSec: null,
    modelTertiarySwellHeightFt: null,
    modelTertiarySwellDirectionDeg: null,
    modelTertiarySwellPeriodSec: null,
    modelWindWaveHeightFt: 4.2,
    modelWindWaveDirectionDeg: 90,
    modelWindWavePeriodSec: 6,

    exposedSwellHeightFt: exposed,
    exposedPartitions:
      exposed === null || exposed === 0
        ? []
        : [{ partition: 'swell', heightFt: exposed, directionDeg: swellDirection }],

    seaSurfaceTempF: 80,
    airTempF: 78,

    windSpeedMph: spec.windSpeedMph === undefined ? 7 : spec.windSpeedMph,
    windGustMph: spec.windGustMph === undefined ? 10 : spec.windGustMph,
    windDirectionDeg: spec.windDirectionDeg === undefined ? 350 : spec.windDirectionDeg,
    precipitationIn: spec.precipitationIn === undefined ? 0 : spec.precipitationIn,

    tideHeightFt: spec.tideHeightFt === undefined ? 1.2 : spec.tideHeightFt,
    tideStage: spec.tideStage ?? 'rising',
    tideRangeFraction: spec.tideRangeFraction === undefined ? 0.7 : spec.tideRangeFraction,

    activeHazards: spec.hazards ?? [],
    sourceFreshness: freshness(spec.freshnessOverrides),
  }
}

export const buildSeries = (specs: readonly HourSpec[]): HourlyBeachConditions[] =>
  specs.map(buildHour)

/** Hours 6-12 inclusive, so windows have room to form. */
const morningHours = [6, 7, 8, 9, 10, 11, 12]

const withMorning = (build: (hour: number) => HourSpec): HourlyBeachConditions[] =>
  buildSeries(morningHours.map(build))

// ---------------------------------------------------------------------------
// The seven scenarios
// ---------------------------------------------------------------------------

/** 1. Excellent calm morning — light wind, negligible swell, good water over the reef. */
export const EXCELLENT_CALM_MORNING = withMorning((hour) => ({
  hour,
  exposedSwellHeightFt: 0.5,
  // Wind rises very slightly so the distribution is not degenerate.
  windSpeedMph: 5 + (hour - 6) * 0.5,
  windGustMph: 8,
  windDirectionDeg: 350,
  tideRangeFraction: 0.75,
}))

/** 2. Borderline south swell — above "great" (3 ft), below "not recommended" (4 ft). */
export const BORDERLINE_SOUTH_SWELL = withMorning((hour) => ({
  hour,
  exposedSwellHeightFt: 3.5,
  swellDirectionDeg: 182,
  windSpeedMph: 6 + (hour - 6) * 0.5,
  tideRangeFraction: 0.7,
}))

/** 3. High Surf Advisory in effect — a hard blocker regardless of everything else. */
export const HIGH_SURF_ADVISORY_DAY = withMorning((hour) => ({
  hour,
  // Otherwise ideal, to prove the hazard overrides rather than merely contributes.
  exposedSwellHeightFt: 0.5,
  windSpeedMph: 5,
  tideRangeFraction: 0.75,
  hazards: [HIGH_SURF_ADVISORY],
}))

/** 4. Calm weather but stale marine data — must not produce a green verdict. */
export const STALE_MARINE_DATA = withMorning((hour) => ({
  hour,
  exposedSwellHeightFt: 0.5,
  windSpeedMph: 5,
  tideRangeFraction: 0.75,
  freshnessOverrides: { marine: 'stale' },
}))

/** 5. Good early window, then strengthening trade wind through the day. */
export const WIND_BUILDS_THROUGH_DAY = buildSeries(
  [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((hour) => ({
    hour,
    exposedSwellHeightFt: 0.6,
    // 5 mph at dawn climbing past the 32 mph offshore ceiling by mid-afternoon.
    windSpeedMph: 5 + Math.max(0, hour - 8) * 4,
    windGustMph: 8 + Math.max(0, hour - 8) * 3,
    windDirectionDeg: hour < 9 ? 350 : 70,
    tideRangeFraction: 0.7,
  })),
)

/** 6. Strong offshore wind despite small waves — wind alone limits the recommendation. */
export const STRONG_OFFSHORE_WIND = withMorning((hour) => ({
  hour,
  exposedSwellHeightFt: 0.4,
  // Uniformly strong, past the 32 mph offshore ceiling — a genuinely rough ENE,
  // not the sheltered 23 mph that observation showed to be calm here.
  windSpeedMph: 34 + (hour - 6) * 0.5,
  windGustMph: 45,
  windDirectionDeg: 350,
  tideRangeFraction: 0.7,
}))

/** 7. Favorable tide but excessive swell — tide must not rescue the verdict. */
export const FAVORABLE_TIDE_EXCESSIVE_SWELL = withMorning((hour) => ({
  hour,
  exposedSwellHeightFt: 5.5,
  swellDirectionDeg: 190,
  windSpeedMph: 6,
  // Squarely inside CROMWELLS_FULLY_CALIBRATED's 0.8-1.6 ft band.
  tideHeightFt: 1.2,
  tideRangeFraction: 0.95,
}))

/**
 * Cromwell's with every calibration gap marked resolved and a concrete tide band.
 *
 * Not a claim that they are resolved — the tide band in particular is still
 * genuinely unknown. This exists so tests can exercise the fully-gating code
 * paths, including tide, which the real profile deliberately skips while its band
 * is unset.
 */
export const CROMWELLS_FULLY_CALIBRATED: BeachProfile = {
  ...CROMWELLS,
  thresholds: {
    ...CROMWELLS.thresholds,
    favorableTideFt: { minFt: 0.8, maxFt: 1.6 },
  },
  calibration: CROMWELLS.calibration.map((gap) => ({ ...gap, status: 'resolved' as const })),
  configVersion: `${CROMWELLS.configVersion}-test-fully-calibrated`,
}

export const SCENARIOS = {
  EXCELLENT_CALM_MORNING,
  BORDERLINE_SOUTH_SWELL,
  HIGH_SURF_ADVISORY_DAY,
  STALE_MARINE_DATA,
  WIND_BUILDS_THROUGH_DAY,
  STRONG_OFFSHORE_WIND,
  FAVORABLE_TIDE_EXCESSIVE_SWELL,
} as const
