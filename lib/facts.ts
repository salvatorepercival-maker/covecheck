import { estimateClarity, type ClarityEstimate } from './conditions/clarity'
import { jellyOutlook, type JellyWindow } from './conditions/jellyfish'
import { skyOf, type SkyKind } from './conditions/sky'
import type { BeachReport } from './forecast'
import { hazardLevel, windClassFor, type WindClass } from './conditions/wind'
import type { TideExtreme } from './providers/tides'
import { honoluluDateOf, honoluluHourOf, honoluluLocalToUtc } from './time'
import type { BeachProfile } from './types'

/**
 * One hour, as plain facts.
 *
 * The bridge between the engine and the activity lenses. Every number here is a
 * reading of data the engine already produced or a provider already returned —
 * nothing is judged. Lenses (lib/lenses) judge; the neutral view only describes.
 *
 * Serializable on purpose: it crosses from the server to the browser, where the
 * lenses run against each viewer's own threshold overrides.
 */
export type HourFacts = {
  timestamp: string
  date: string
  hour: number

  /** Direction-filtered swell reaching this beach (the engine's figure). The readable label. */
  swellFt: number | null
  /** Σ H²T of the exposed swell partitions, ft²·s — what lenses judge swell on. */
  swellEnergy: number | null
  /** Period of the most energetic exposed swell, s. */
  swellPeriodSec: number | null
  /** Exposed wind-wave (chop) height, ft. */
  chopFt: number | null
  swellFromDeg: number | null
  /** NWS surf-face bound for this shore, day-level. */
  nwsSurfMaxFt: number | null

  windMph: number | null
  gustMph: number | null
  windFromDeg: number | null
  /** Three-way class from the beach config, for the lenses. */
  windClass: WindClass | null

  tideFt: number | null
  tideStage: 'rising' | 'falling' | 'near-high' | 'near-low' | 'unknown'
  /** Where the tide sits against this beach's band. Null while the band is unset. */
  tideVsBand: 'in' | 'low' | 'high' | null

  clarity: ClarityEstimate | null

  airF: number | null
  seaF: number | null
  sky: SkyKind | null
  rainPct: number | null
  rain48hIn: number | null
  uv: number | null

  nwsHazards: { event: string; blocking: boolean; level: 'warning' | 'advisory' }[]
  nwsHazardsKnown: boolean

  /** Same for every hour of a day; carried per hour so a lens needs one input. */
  waterQuality: WaterQualityFact
  jelly: { expected: boolean; window: JellyWindow | null }

  /**
   * Set when the engine could not trust this hour's data. Lenses must report
   * "not enough data" rather than a fit.
   */
  dataIssue: 'stale' | 'missing' | null
}

export type WaterQualityFact =
  | { status: 'clear'; radiusKm: number }
  | {
      status: 'advisory'
      radiusKm: number
      advisories: { kind: string; type: string; title: string; distanceKm: number; url: string; postedUtc: string | null }[]
    }
  | { status: 'unknown' }

export type DayFacts = {
  date: string
  hours: HourFacts[]
  tideExtremes: { timestamp: string; heightFt: number; kind: 'high' | 'low' }[]
  /** Minutes past local midnight. */
  sunrise: number | null
  sunset: number | null
}

/** Rain in the 48 h before `timestamp`, from history plus forecast hours. */
function rain48hBefore(timestamp: string, rainByTimestamp: Map<string, number>): number | null {
  const endMs = honoluluLocalToUtc(timestamp).getTime()
  let total = 0
  let seen = 0
  for (const [ts, inches] of rainByTimestamp) {
    const ms = honoluluLocalToUtc(ts).getTime()
    if (ms < endMs && ms >= endMs - 48 * 3_600_000) {
      total += inches
      seen += 1
    }
  }
  // Fewer than a day of hours seen means the history fetch failed; say unknown.
  return seen >= 24 ? Math.round(total * 100) / 100 : null
}

export function waterQualityFact(report: Pick<BeachReport, 'waterQuality'>): WaterQualityFact {
  const wq = report.waterQuality
  if (wq.status !== 'ok') return { status: 'unknown' }
  if (wq.data.nearby.length === 0) return { status: 'clear', radiusKm: wq.data.radiusKm }
  return { status: 'advisory', radiusKm: wq.data.radiusKm, advisories: wq.data.nearby }
}

export function buildDayFacts(
  report: BeachReport,
  profile: BeachProfile,
  sunFor: (date: string) => { sunrise: number | null; sunset: number | null },
): DayFacts[] {
  const { evaluation, conditionsByTimestamp } = report

  const rain = new Map<string, number>()
  for (const [ts, inches] of Object.entries(report.rainHistoryByTimestamp)) rain.set(ts, inches)
  for (const hour of Object.values(conditionsByTimestamp)) {
    if (hour.precipitationIn !== null && !rain.has(hour.timestamp)) rain.set(hour.timestamp, hour.precipitationIn)
  }

  const water = waterQualityFact(report)
  const band = profile.thresholds.favorableTideFt
  const bandUnset = profile.calibration.some(
    (gap) => gap.status === 'unresolved' && gap.affectedThresholds.some((t) => t.toLowerCase().includes('tide')),
  )

  return evaluation.days.map((day) => {
    const jelly = jellyOutlook(day.date)
    const hours: HourFacts[] = day.hours.map((assessment) => {
      const c = conditionsByTimestamp[assessment.timestamp]
      const codes = new Set(assessment.reasons.map((r) => r.code))
      const windFromDeg = c?.windDirectionDeg ?? null
      const tideFt = assessment.metrics.tideHeightFt
      const rain48hIn = rain48hBefore(assessment.timestamp, rain)
      const swellFt = assessment.metrics.exposedSwellHeightFt
      return {
        timestamp: assessment.timestamp,
        date: honoluluDateOf(assessment.timestamp),
        hour: honoluluHourOf(assessment.timestamp),
        swellFt,
        swellEnergy: c?.exposedSwellEnergy ?? null,
        swellPeriodSec: c?.exposedSwellPeriodSec ?? null,
        chopFt: c?.exposedChopFt ?? null,
        swellFromDeg: c?.exposedPartitions[0]?.directionDeg ?? null,
        nwsSurfMaxFt: assessment.metrics.srfSouthFacingMaxFt,
        windMph: assessment.metrics.windSpeedMph,
        gustMph: assessment.metrics.windGustMph,
        windFromDeg,
        windClass: windFromDeg === null ? null : windClassFor(windFromDeg, profile.shoreAspect, profile.windClasses),
        tideFt,
        tideStage: c?.tideStage ?? 'unknown',
        tideVsBand:
          bandUnset || tideFt === null ? null : tideFt < band.minFt ? 'low' : tideFt > band.maxFt ? 'high' : 'in',
        clarity: estimateClarity(
          { swellEnergy: c?.exposedSwellEnergy ?? null, windMph: assessment.metrics.windSpeedMph, windDirectionDeg: windFromDeg, rain48hIn },
          profile.shoreAspect,
        ),
        airF: c?.airTempF ?? null,
        seaF: c?.seaSurfaceTempF ?? null,
        sky: skyOf(c?.weatherCode ?? null, c?.cloudCoverPct ?? null),
        rainPct: c?.precipProbabilityPct ?? null,
        rain48hIn,
        uv: c?.uvIndex ?? null,
        nwsHazards: (c?.activeHazards ?? []).map((h) => ({ event: h.event, blocking: h.isBlocking, level: hazardLevel(h.event) })),
        nwsHazardsKnown: c?.sourceFreshness.alerts?.status === 'ok',
        waterQuality: water,
        jelly,
        dataIssue: codes.has('STALE_DATA') ? 'stale' : codes.has('MISSING_CRITICAL_DATA') ? 'missing' : null,
      }
    })

    const sun = sunFor(day.date)
    return {
      date: day.date,
      hours,
      tideExtremes: (report.tideExtremesByDate[day.date] ?? [])
        .filter((e): e is TideExtreme & { heightFt: number } => e.heightFt !== null)
        .map((e) => ({ timestamp: e.timestamp, heightFt: e.heightFt, kind: e.kind })),
      sunrise: sun.sunrise,
      sunset: sun.sunset,
    }
  })
}
