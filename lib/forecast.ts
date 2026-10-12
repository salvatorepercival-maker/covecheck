import { cache } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { connection } from 'next/server'
import { evaluateForecast, type ForecastEvaluation } from './engine'
import { normalizeConditions, type ProviderSlice } from './normalize'
import { fetchAlerts } from './providers/alerts'
import { fetchBuoy, type BuoyObservation } from './providers/buoy'
import { fetchWaterQuality, type WaterQualityReport } from './providers/doh'
import {
  fetchMarine,
  fetchRainHistory,
  fetchWeather,
  type MarineResponse,
  type RainHistoryResponse,
  type WeatherResponse,
} from './providers/open-meteo'
import { fetchSurfZoneForecast } from './providers/srf'
import { fetchTideExtremes, fetchTideHourly, type TideExtreme, type TidePrediction } from './providers/tides'
import { honoluluDateOf, utcToHonoluluLocal } from './time'
import type { BeachHazard, BeachProfile, HourlyBeachConditions, SurfZoneForecast } from './types'

/**
 * Request-time forecast assembly.
 *
 * Split deliberately in two:
 *
 *   `getForecastBundle` is cached — it is the expensive part (six network calls)
 *   and its result depends only on the beach and the date range.
 *
 *   `getBeachReport` is dynamic — it reads the clock, so freshness, staleness and
 *   "which hour is now" are evaluated per request rather than frozen into a cache
 *   entry. The engine is pure and cheap, so re-running it every request is free.
 *
 * Anything reading the clock inside the cached function would freeze a timestamp
 * into the cache and make the freshness display lie.
 */

type Slice<T> = { status: 'ok'; data: T; fetchedAtUtc: string } | { status: 'failed'; fetchedAtUtc: string; error: string }

/** Serializable across the cache boundary — no class instances, no Dates. */
export type ForecastBundle = {
  marine: Slice<MarineResponse>
  weather: Slice<WeatherResponse>
  tideHourly: Slice<{ predictions: TidePrediction[] }>
  tideExtremes: Slice<{ extremes: TideExtreme[] }>
  alerts: Slice<{ hazards: BeachHazard[] }>
  surfZoneForecast: SurfZoneForecast | null
  srfWarnings: string[]
  /** Last 48 h of rain. Lens and clarity input only — never reaches the engine. */
  rainHistory: Slice<RainHistoryResponse>
  /** Health Dept. water-quality advisories near the beach. Lens input only. */
  waterQuality: Slice<WaterQualityReport>
  /** Latest real-time buoy observation (NDBC 51211). Corrects near-term swell in the facts layer only. */
  buoy: Slice<BuoyObservation>
}

const toSlice = <T,>(
  result:
    | { ok: true; data: T; fetchedAtUtc: string }
    | { ok: false; error: { kind: string; message: string }; fetchedAtUtc: string },
): Slice<T> =>
  result.ok
    ? { status: 'ok', data: result.data, fetchedAtUtc: result.fetchedAtUtc }
    : {
        status: 'failed',
        fetchedAtUtc: result.fetchedAtUtc,
        error: `${result.error.kind}: ${result.error.message}`,
      }

/**
 * Fetch every provider for one beach and date range.
 *
 * Cache lifetime is bounded by the *tightest* staleness limit in
 * `STALENESS_LIMITS_SECONDS` — currently alerts, at 30 minutes. Serving a cache
 * entry older than that would make the engine correctly report its own data as
 * stale and refuse to give a verdict, so `expire` must not exceed it.
 */
async function getForecastBundle(
  profile: BeachProfile,
  beginDate: string,
  endDate: string,
): Promise<ForecastBundle> {
  'use cache'
  cacheLife({
    stale: 300, // 5 min of instant client-side reuse
    revalidate: 900, // refresh in the background every 15 min
    expire: 1800, // never serve anything older than the alerts staleness limit
  })
  cacheTag(`forecast:${profile.id}`)

  const [marine, weather, tideHourly, tideExtremes, alerts, srf, rainHistory, waterQuality, buoy] = await Promise.all([
    fetchMarine(profile.cells.marine, profile.timezone),
    fetchWeather(profile.cells.weather, profile.timezone),
    fetchTideHourly(profile.tideStationId, beginDate, endDate),
    fetchTideExtremes(profile.tideStationId, beginDate, endDate),
    // The alerts query uses the beach's own coordinates, not a model cell.
    fetchAlerts(profile.latitude, profile.longitude),
    fetchSurfZoneForecast(profile.srfIsland),
    fetchRainHistory(profile.cells.weather, profile.timezone),
    fetchWaterQuality({ latitude: profile.latitude, longitude: profile.longitude }),
    fetchBuoy(),
  ])

  return {
    marine: toSlice(marine),
    weather: toSlice(weather),
    tideHourly: toSlice(tideHourly),
    tideExtremes: toSlice(tideExtremes),
    alerts: toSlice(alerts),
    surfZoneForecast: srf.ok ? srf.data.forecast : null,
    srfWarnings: srf.ok ? srf.data.warnings : [`srf unavailable: ${srf.error.kind}`],
    rainHistory: toSlice(rainHistory),
    waterQuality: toSlice(waterQuality),
    buoy: toSlice(buoy),
  }
}

export type BeachReport = {
  evaluation: ForecastEvaluation
  /** The normalized inputs behind the verdicts, keyed by local timestamp. */
  conditionsByTimestamp: Record<string, HourlyBeachConditions>
  /**
   * Tide highs and lows grouped by Honolulu-local date.
   *
   * Already fetched for the tide-stage calculation (`interval=hilo`) — this just
   * surfaces the same events for display. Hawaiʻi tides are mixed semi-diurnal,
   * so a date can hold up to four events and the count varies day to day.
   */
  tideExtremesByDate: Record<string, TideExtreme[]>
  /** Every extreme in the fetched range, chronological — the chart needs to cross midnight. */
  tideExtremes: TideExtreme[]
  /** Newest provider fetch time across the bundle, for "updated at". */
  updatedAtUtc: string
  /**
   * When the NWS issued the surf forecast, or null when unavailable.
   *
   * Reported instead of a fetch time because this product is issued roughly twice
   * a day — how recently CoveCheck downloaded it says much less than when the
   * Weather Service wrote it.
   */
  surfZoneIssuedUtc: string | null
  /** Provider and normalization problems, for the technical detail panel. */
  warnings: string[]
  /** Providers that failed outright. */
  failures: { provider: string; error: string }[]
  /** Hourly rain, last 48 h, keyed by local timestamp. Empty when the fetch failed. */
  rainHistoryByTimestamp: Record<string, number>
  /**
   * Health Dept. advisories near the beach, or the failure. A failure is never
   * shown as "no advisories".
   */
  waterQuality: { status: 'ok'; data: WaterQualityReport; fetchedAtUtc: string } | { status: 'failed'; error: string; fetchedAtUtc: string }
  /** Latest buoy observation, or the failure. */
  buoy: { status: 'ok'; data: BuoyObservation; fetchedAtUtc: string } | { status: 'failed'; error: string; fetchedAtUtc: string }
  /** Per-provider fetch status, for the "Where this data comes from" panel. */
  sourceStatus: { id: string; name: string; status: 'ok' | 'failed'; fetchedAtUtc: string }[]
}

/** Group extremes by the local calendar day they fall on, each sorted by time. */
function groupExtremesByDate(extremes: readonly TideExtreme[]): Record<string, TideExtreme[]> {
  const byDate: Record<string, TideExtreme[]> = {}
  for (const extreme of extremes) {
    let date: string
    try {
      date = honoluluDateOf(extreme.timestamp)
    } catch {
      continue
    }
    ;(byDate[date] ??= []).push(extreme)
  }
  for (const list of Object.values(byDate)) {
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }
  return byDate
}

const asProviderSlice = <T,>(slice: Slice<T>): ProviderSlice<T> =>
  slice.status === 'ok'
    ? { status: 'ok', data: slice.data, fetchedAtUtc: slice.fetchedAtUtc }
    : { status: 'failed', fetchedAtUtc: slice.fetchedAtUtc }

/**
 * Assemble the full report for a beach at the current moment.
 *
 * Wrapped in React's `cache` so several components in one render share a single
 * result. The header's freshness indicator and the report body both need it, and
 * without this they would each re-run normalization and the engine — and, worse,
 * could disagree about what "now" is by a few milliseconds.
 */
export const getBeachReport = cache(async function getBeachReport(
  profile: BeachProfile,
): Promise<BeachReport> {
  // Defer to request time before reading the clock, so the timestamps below are
  // this request's and not a cached entry's.
  await connection()

  const nowUtc = new Date()
  const beginDate = honoluluDateOf(utcToHonoluluLocal(nowUtc))
  const endDate = honoluluDateOf(utcToHonoluluLocal(new Date(nowUtc.getTime() + 6 * 86_400_000)))

  // Passing the whole profile makes it part of the cache key, so editing a
  // threshold or exposure window correctly produces a new entry.
  const bundle = await getForecastBundle(profile, beginDate, endDate)

  const { hours, warnings: normalizeWarnings } = normalizeConditions({
    profile,
    marine: asProviderSlice(bundle.marine),
    weather: asProviderSlice(bundle.weather),
    tideHourly: asProviderSlice(bundle.tideHourly),
    tideExtremes: asProviderSlice(bundle.tideExtremes),
    alerts: asProviderSlice(bundle.alerts),
    nowUtc,
  })

  const evaluation = evaluateForecast({
    profile,
    hours,
    surfZoneForecast: bundle.surfZoneForecast,
    nowUtc,
  })

  const slices = [
    ['marine', bundle.marine],
    ['weather', bundle.weather],
    ['tides (hourly)', bundle.tideHourly],
    ['tides (high/low)', bundle.tideExtremes],
    ['advisories', bundle.alerts],
    ['rain history', bundle.rainHistory],
    ['water quality', bundle.waterQuality],
  ] as const

  const fetchTimes = slices.map(([, slice]) => slice.fetchedAtUtc).sort()

  return {
    evaluation,
    conditionsByTimestamp: Object.fromEntries(hours.map((hour) => [hour.timestamp, hour])),
    tideExtremesByDate: groupExtremesByDate(
      bundle.tideExtremes.status === 'ok' ? bundle.tideExtremes.data.extremes : [],
    ),
    tideExtremes:
      bundle.tideExtremes.status === 'ok'
        ? [...bundle.tideExtremes.data.extremes].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        : [],
    updatedAtUtc: fetchTimes[fetchTimes.length - 1] ?? nowUtc.toISOString(),
    surfZoneIssuedUtc: bundle.surfZoneForecast?.issuedUtc ?? null,
    warnings: [...normalizeWarnings, ...evaluation.warnings, ...bundle.srfWarnings],
    rainHistoryByTimestamp:
      bundle.rainHistory.status === 'ok'
        ? Object.fromEntries(
            bundle.rainHistory.data.hourly.time
              .map((time, index) => [time, bundle.rainHistory.status === 'ok' ? bundle.rainHistory.data.hourly.precipitation[index] : null] as const)
              .filter((entry): entry is readonly [string, number] => entry[1] !== null),
          )
        : {},
    waterQuality: bundle.waterQuality,
    buoy: bundle.buoy,
    sourceStatus: [
      ['marine', 'Open-Meteo Marine (swell)', bundle.marine],
      ['weather', 'Open-Meteo (wind, sky, UV, rain)', bundle.weather],
      ['rain', 'Open-Meteo (last 48 h rain)', bundle.rainHistory],
      ['tides', 'NOAA tides, Honolulu 1612340', bundle.tideHourly],
      ['alerts', 'National Weather Service alerts', bundle.alerts],
      ['doh', 'Hawaiʻi Dept. of Health water quality', bundle.waterQuality],
      ['buoy', 'Buoy: Pearl Harbor Entrance (NDBC 51211)', bundle.buoy],
    ].map(([id, name, slice]) => {
      const s = slice as Slice<unknown>
      return { id: id as string, name: name as string, status: s.status, fetchedAtUtc: s.fetchedAtUtc }
    }),
    failures: slices
      .filter(([, slice]) => slice.status === 'failed')
      .map(([provider, slice]) => ({
        provider,
        error: slice.status === 'failed' ? slice.error : '',
      })),
  }
})
