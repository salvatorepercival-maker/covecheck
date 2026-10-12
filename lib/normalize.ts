import { combineWaveHeightsFt, isDirectionInAnyRange } from './geo'
import { honoluluLocalToUtc, toHonoluluLocal } from './time'
import { tideRangeFractionAt, tideStageAt } from './tide'
import type {
  BeachHazard,
  BeachProfile,
  ExposedPartition,
  HourlyBeachConditions,
  ProviderId,
  SourceFreshness,
  SourceStatus,
  SwellPartitionName,
} from './types'
import type { MarineResponse, WeatherResponse } from './providers/open-meteo'
import type { TideExtreme, TidePrediction } from './providers/tides'

/**
 * Fuse the provider payloads into one hourly series.
 *
 * The load-bearing step here is `exposedSwellHeightFt`: the wave partitions are
 * filtered by direction against the beach's exposure window before anything
 * downstream sees a single number. Skipping that filter is what makes the raw
 * feed report 4.5 ft on a 1-3 ft south-shore morning.
 */

/** How old a source may be before it is considered stale, per provider. */
export const STALENESS_LIMITS_SECONDS: Record<ProviderId, number> = {
  // Open-Meteo refreshes hourly; two hours old is tolerable, beyond that suspect.
  marine: 2 * 3600,
  weather: 2 * 3600,
  // Tide predictions are astronomical and effectively never go stale within a run.
  tides: 24 * 3600,
  // Hazards are the one input where being behind is dangerous.
  alerts: 30 * 60,
  // The SRF is issued roughly twice a day.
  srf: 14 * 3600,
  // Health Dept. water-quality advisories: posted within hours of heavy rain or a spill.
  doh: 30 * 60,
  // The buoy reports every 30 min; 90 min means transmissions have dropped.
  buoy: 90 * 60,
}

export type ProviderSlice<T> =
  | { status: 'ok'; data: T; fetchedAtUtc: string; observedAtUtc?: string | null }
  | { status: 'failed' | 'missing'; fetchedAtUtc: string }

export type NormalizeInput = {
  profile: BeachProfile
  marine: ProviderSlice<MarineResponse>
  weather: ProviderSlice<WeatherResponse>
  tideHourly: ProviderSlice<{ predictions: TidePrediction[] }>
  tideExtremes: ProviderSlice<{ extremes: TideExtreme[] }>
  alerts: ProviderSlice<{ hazards: BeachHazard[] }>
  /** Evaluation time, injected so normalization is deterministic under test. */
  nowUtc: Date
}

export type NormalizeResult = {
  hours: HourlyBeachConditions[]
  /** Non-fatal problems worth logging: dropped hours, misaligned grids, drifted cells. */
  warnings: string[]
}

function statusFor(
  slice: { status: 'ok' | 'failed' | 'missing'; fetchedAtUtc: string },
  provider: ProviderId,
  nowUtc: Date,
): { status: SourceStatus; ageSeconds: number | null } {
  if (slice.status !== 'ok') return { status: slice.status, ageSeconds: null }

  const ageSeconds = Math.max(
    0,
    Math.round((nowUtc.getTime() - new Date(slice.fetchedAtUtc).getTime()) / 1000),
  )
  const limit = STALENESS_LIMITS_SECONDS[provider]
  return { status: ageSeconds > limit ? 'stale' : 'ok', ageSeconds }
}

function freshnessFor(input: NormalizeInput): SourceFreshness {
  const entries: SourceFreshness = {}

  const slices: [ProviderId, ProviderSlice<unknown>][] = [
    ['marine', input.marine],
    ['weather', input.weather],
    ['tides', input.tideHourly],
    ['alerts', input.alerts],
  ]

  for (const [provider, slice] of slices) {
    const { status, ageSeconds } = statusFor(slice, provider, input.nowUtc)
    entries[provider] = {
      fetchedAtUtc: slice.fetchedAtUtc,
      observedAtUtc: slice.status === 'ok' ? (slice.observedAtUtc ?? null) : null,
      status,
      ageSeconds,
    }
  }

  return entries
}

/**
 * Combine only the wave partitions that can actually reach this beach.
 *
 * Each partition is admitted on its own direction. A 4 ft E windswell and a 1 ft
 * S swell arriving together yield 1 ft of exposed energy at a south-facing cove,
 * not 4.1 ft.
 *
 * Returns null when no partition has both a height and a direction — that is
 * missing data, not calm water, and must not become 0.
 */
export type ExposedSwell = {
  /** Unchanged: quadrature height of every exposed partition, wind waves included. */
  heightFt: number | null
  counted: ExposedPartition[]
  /** Σ H²T over exposed swell partitions (not wind waves), ft²·s. */
  energy: number | null
  /** Period of the most energetic exposed swell partition. */
  periodSec: number | null
  /** Exposed wind-wave height, ft. */
  chopFt: number | null
}

export function exposedSwell(
  partitions: readonly {
    partition: SwellPartitionName
    heightFt: number | null
    directionDeg: number | null
    periodSec?: number | null
  }[],
  profile: BeachProfile,
): ExposedSwell {
  const usable = partitions.filter(
    (p): p is { partition: SwellPartitionName; heightFt: number; directionDeg: number; periodSec?: number | null } =>
      p.heightFt !== null && p.directionDeg !== null,
  )

  if (usable.length === 0) return { heightFt: null, counted: [], energy: null, periodSec: null, chopFt: null }

  const counted = usable
    .filter((p) => isDirectionInAnyRange(p.directionDeg, profile.exposedSwellDirections))
    .map((p) => ({
      partition: p.partition,
      heightFt: p.heightFt,
      directionDeg: p.directionDeg,
      periodSec: p.periodSec ?? null,
    }))

  const windWaveMeasured = usable.some((p) => p.partition === 'wind_wave')
  const chop = counted.find((p) => p.partition === 'wind_wave')
  const chopFt = chop ? chop.heightFt : windWaveMeasured ? 0 : null

  // Every partition was measured and every one points away from this beach:
  // genuinely 0 ft and zero energy, which is a real answer.
  if (counted.length === 0) return { heightFt: 0, counted: [], energy: 0, periodSec: null, chopFt }

  const swells = counted.filter((p) => p.partition !== 'wind_wave')
  const withPeriod = swells.filter((p): p is ExposedPartition & { periodSec: number } => p.periodSec !== null)
  // Energy needs every exposed swell's period; a partial sum would read low.
  const energy =
    swells.length === 0 ? 0 : withPeriod.length === swells.length ? swellEnergy(withPeriod) : null
  const strongest = [...withPeriod].sort((a, b) => b.heightFt ** 2 * b.periodSec - a.heightFt ** 2 * a.periodSec)[0]

  return {
    heightFt: combineWaveHeightsFt(...counted.map((p) => p.heightFt)),
    counted,
    energy,
    periodSec: strongest?.periodSec ?? null,
    chopFt,
  }
}

/** Σ H² × T, rounded to 0.1. Proportional to deep-water wave energy flux. */
export function swellEnergy(parts: readonly { heightFt: number; periodSec: number }[]): number {
  return Math.round(parts.reduce((sum, p) => sum + p.heightFt ** 2 * p.periodSec, 0) * 10) / 10
}

/** Index an Open-Meteo hourly block by canonical local timestamp. */
function indexByTimestamp(times: readonly string[]): Map<string, number> {
  const index = new Map<string, number>()
  times.forEach((raw, position) => {
    try {
      index.set(toHonoluluLocal(raw), position)
    } catch {
      // Unparseable timestamps are dropped rather than guessed at; the caller
      // reports the count as a warning.
    }
  })
  return index
}

const at = (values: readonly (number | null)[], index: number | undefined): number | null =>
  index === undefined ? null : (values[index] ?? null)

export function normalizeConditions(input: NormalizeInput): NormalizeResult {
  const warnings: string[] = []
  const { profile } = input

  if (input.marine.status !== 'ok') {
    warnings.push(`marine data unavailable (${input.marine.status}); wave fields will be null`)
  }
  if (input.weather.status !== 'ok') {
    warnings.push(`weather data unavailable (${input.weather.status}); wind fields will be null`)
  }

  // The marine grid defines the hourly spine when present, since waves are the
  // primary signal; weather alone is not enough to evaluate a beach.
  const spine =
    input.marine.status === 'ok'
      ? input.marine.data.hourly.time
      : input.weather.status === 'ok'
        ? input.weather.data.hourly.time
        : []

  if (spine.length === 0) {
    return {
      hours: [],
      warnings: [...warnings, 'no hourly spine available from marine or weather'],
    }
  }

  const marineIndex = input.marine.status === 'ok' ? indexByTimestamp(input.marine.data.hourly.time) : new Map()
  const weatherIndex = input.weather.status === 'ok' ? indexByTimestamp(input.weather.data.hourly.time) : new Map()

  const tideByTimestamp = new Map<string, number | null>()
  if (input.tideHourly.status === 'ok') {
    for (const prediction of input.tideHourly.data.predictions) {
      try {
        tideByTimestamp.set(toHonoluluLocal(prediction.timestamp), prediction.heightFt)
      } catch {
        warnings.push(`unparseable tide timestamp ${JSON.stringify(prediction.timestamp)}`)
      }
    }
  } else {
    warnings.push(`tide heights unavailable (${input.tideHourly.status})`)
  }

  const extremes = input.tideExtremes.status === 'ok' ? input.tideExtremes.data.extremes : []
  if (extremes.length === 0) {
    warnings.push('no tide extremes available; tide stage will be unknown')
  }

  const hazards = input.alerts.status === 'ok' ? input.alerts.data.hazards : []
  if (input.alerts.status !== 'ok') {
    warnings.push(
      `hazard state unknown (${input.alerts.status}); this must block a green verdict, not be read as "no hazards"`,
    )
  }

  if (input.marine.status === 'ok' && input.marine.data.hourly.secondary_swell_wave_height === undefined) {
    warnings.push(
      'marine payload has no secondary swell partition; a south swell sitting beneath the dominant windswell would be invisible and exposed energy under-reported',
    )
  }

  const freshness = freshnessFor(input)
  const marineHourly = input.marine.status === 'ok' ? input.marine.data.hourly : null
  const weatherHourly = input.weather.status === 'ok' ? input.weather.data.hourly : null

  let droppedTimestamps = 0
  const hours: HourlyBeachConditions[] = []

  for (const rawTimestamp of spine) {
    let timestamp: string
    try {
      timestamp = toHonoluluLocal(rawTimestamp)
    } catch {
      droppedTimestamps += 1
      continue
    }

    const m = marineIndex.get(timestamp)
    const w = weatherIndex.get(timestamp)

    const modelSwellHeightFt = marineHourly ? at(marineHourly.swell_wave_height, m) : null
    const modelSwellDirectionDeg = marineHourly ? at(marineHourly.swell_wave_direction, m) : null
    const secondaryHeightFt = marineHourly ? at(marineHourly.secondary_swell_wave_height ?? [], m) : null
    const secondaryDirectionDeg = marineHourly ? at(marineHourly.secondary_swell_wave_direction ?? [], m) : null
    const tertiaryHeightFt = marineHourly ? at(marineHourly.tertiary_swell_wave_height ?? [], m) : null
    const tertiaryDirectionDeg = marineHourly ? at(marineHourly.tertiary_swell_wave_direction ?? [], m) : null
    const modelWindWaveHeightFt = marineHourly ? at(marineHourly.wind_wave_height, m) : null
    const modelWindWaveDirectionDeg = marineHourly ? at(marineHourly.wind_wave_direction, m) : null

    // Every train is offered to the filter, which admits each on its own
    // direction. Passing only the primary swell hid south swell sitting beneath a
    // dominant easterly windswell.
    const exposed = exposedSwell(
      [
        { partition: 'swell', heightFt: modelSwellHeightFt, directionDeg: modelSwellDirectionDeg, periodSec: marineHourly ? at(marineHourly.swell_wave_period, m) : null },
        { partition: 'secondary_swell', heightFt: secondaryHeightFt, directionDeg: secondaryDirectionDeg, periodSec: marineHourly ? at(marineHourly.secondary_swell_wave_period ?? [], m) : null },
        { partition: 'tertiary_swell', heightFt: tertiaryHeightFt, directionDeg: tertiaryDirectionDeg, periodSec: marineHourly ? at(marineHourly.tertiary_swell_wave_period ?? [], m) : null },
        { partition: 'wind_wave', heightFt: modelWindWaveHeightFt, directionDeg: modelWindWaveDirectionDeg, periodSec: marineHourly ? at(marineHourly.wind_wave_period, m) : null },
      ],
      profile,
    )

    const tideHeightFt = tideByTimestamp.get(timestamp) ?? null

    hours.push({
      timestamp,
      timestampUtc: honoluluLocalToUtc(timestamp).toISOString(),

      modelSigWaveHeightFt: marineHourly ? at(marineHourly.wave_height, m) : null,
      modelSigWaveDirectionDeg: marineHourly ? at(marineHourly.wave_direction, m) : null,
      modelSigWavePeriodSec: marineHourly ? at(marineHourly.wave_period, m) : null,
      modelSwellHeightFt,
      modelSwellDirectionDeg,
      modelSwellPeriodSec: marineHourly ? at(marineHourly.swell_wave_period, m) : null,
      modelSecondarySwellHeightFt: secondaryHeightFt,
      modelSecondarySwellDirectionDeg: secondaryDirectionDeg,
      modelSecondarySwellPeriodSec: marineHourly ? at(marineHourly.secondary_swell_wave_period ?? [], m) : null,
      modelTertiarySwellHeightFt: tertiaryHeightFt,
      modelTertiarySwellDirectionDeg: tertiaryDirectionDeg,
      modelTertiarySwellPeriodSec: marineHourly ? at(marineHourly.tertiary_swell_wave_period ?? [], m) : null,
      modelWindWaveHeightFt,
      modelWindWaveDirectionDeg,
      modelWindWavePeriodSec: marineHourly ? at(marineHourly.wind_wave_period, m) : null,

      exposedSwellHeightFt: exposed.heightFt,
      exposedPartitions: exposed.counted,
      exposedSwellEnergy: exposed.energy,
      exposedSwellPeriodSec: exposed.periodSec,
      exposedChopFt: exposed.chopFt,

      seaSurfaceTempF: marineHourly ? at(marineHourly.sea_surface_temperature, m) : null,
      airTempF: weatherHourly ? at(weatherHourly.temperature_2m, w) : null,
      precipProbabilityPct: weatherHourly ? at(weatherHourly.precipitation_probability ?? [], w) : null,
      weatherCode: weatherHourly ? at(weatherHourly.weather_code ?? [], w) : null,
      cloudCoverPct: weatherHourly ? at(weatherHourly.cloud_cover ?? [], w) : null,
      uvIndex: weatherHourly ? at(weatherHourly.uv_index ?? [], w) : null,

      windSpeedMph: weatherHourly ? at(weatherHourly.wind_speed_10m, w) : null,
      windGustMph: weatherHourly ? at(weatherHourly.wind_gusts_10m, w) : null,
      windDirectionDeg: weatherHourly ? at(weatherHourly.wind_direction_10m, w) : null,
      precipitationIn: weatherHourly ? at(weatherHourly.precipitation, w) : null,

      tideHeightFt,
      tideStage: extremes.length > 0 ? tideStageAt(timestamp, extremes) : 'unknown',
      tideRangeFraction: tideRangeFractionAt(timestamp, tideHeightFt, extremes),

      activeHazards: hazards,
      sourceFreshness: freshness,
    })
  }

  if (droppedTimestamps > 0) {
    warnings.push(`dropped ${droppedTimestamps} hour(s) with unparseable timestamps`)
  }

  const missingWeather = hours.filter((h) => h.windSpeedMph === null).length
  if (weatherHourly && missingWeather > 0) {
    warnings.push(
      `${missingWeather} of ${hours.length} hour(s) had no matching weather sample; the marine and weather grids may be misaligned`,
    )
  }

  return { hours, warnings }
}
