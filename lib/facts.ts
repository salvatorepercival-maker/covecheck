import { compareBuoy, correctionAt, type BuoyComparison } from './conditions/buoy'
import { closuresAt, CROMWELLS_CLOSURES, type Closure } from './beach/closures'
import { estimateClarity, type ClarityEstimate } from './conditions/clarity'
import { dailyRangeFt, springNeap, tideDynamics, type TideDynamics } from './conditions/tide'
import { confidenceFor, type Confidence } from './conditions/confidence'
import { bandOf } from './engine/assess'
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
  /** Buoy multiplier applied to this hour's swell height (energy × its square); null when none. */
  buoyCorrection: number | null
  /** Computed from source agreement, freshness and lead time. */
  confidence: Confidence
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
  /** Direction, rate, next turn and the mid-change flag. */
  tide: TideDynamics
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
  /**
   * Thunder forecast for this hour: NWS grid first; the model's thunderstorm
   * weather code only when NWS is unavailable. `expected: null` = no source.
   */
  thunder: { expected: boolean | null; source: 'nws' | 'model' | null; coverage: string | null }
  /** Closures in effect this hour (entered by hand; see lib/beach/closures.ts). */
  closures: Closure[]
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
  /** NOAA high-to-low range for the day, ft. */
  tideRangeFt: number | null
  /** From the moon: within ~2 days of new/full = spring, of a quarter = neap. */
  springNeap: 'spring' | 'neap' | null
  /** Minutes past local midnight. */
  sunrise: number | null
  sunset: number | null
}

/** Model exposed swell height from the swell partitions only (no wind waves), ft. */
function swellOnlyFt(partitions: readonly { partition: string; heightFt: number }[]): number {
  return Math.sqrt(partitions.filter((p) => p.partition !== 'wind_wave').reduce((s, p) => s + p.heightFt ** 2, 0))
}

/** The buoy against the model at the observation hour, or null without a buoy reading. */
export function buoyComparisonFor(report: BeachReport, profile: BeachProfile): BuoyComparison | null {
  if (report.buoy.status !== 'ok') return null
  const obs = report.buoy.data
  const obsLocalHour = new Date(new Date(obs.observedUtc).getTime() - 10 * 3_600_000).toISOString().slice(0, 13) + ':00'
  const c = report.conditionsByTimestamp[obsLocalHour]
  return compareBuoy(obs, c ? swellOnlyFt(c.exposedPartitions) : null, profile.exposedSwellDirections, new Date(report.evaluation.evaluatedAtUtc))
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

  // Tide dynamics across the whole run, so rates and turns work across midnight.
  const tideSeries = Object.values(conditionsByTimestamp)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((h) => ({ timestamp: h.timestamp, ft: h.tideHeightFt }))
  const tideAll = tideDynamics(
    tideSeries,
    report.tideExtremes
      .filter((e): e is TideExtreme & { heightFt: number } => e.heightFt !== null)
      .map((e) => ({ timestamp: e.timestamp, heightFt: e.heightFt, kind: e.kind })),
  )
  const tideAt = new Map(tideSeries.map((h, i) => [h.timestamp, tideAll[i]]))
  const thunder = report.thunder.status === 'ok' ? report.thunder.data : null
  const buoy = buoyComparisonFor(report, profile)
  const obsMs = buoy ? Math.floor(new Date(buoy.observedUtc).getTime() / 3_600_000) * 3_600_000 : null
  const today = honoluluDateOf(new Date(new Date(report.evaluation.evaluatedAtUtc).getTime() - 10 * 3_600_000).toISOString().slice(0, 16))
  const dayIndex = (date: string) => Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000)
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
      // Near-term buoy correction: full at the observation hour, fading to none over 6 h.
      const hoursAfter = obsMs === null ? -1 : (honoluluLocalToUtc(assessment.timestamp).getTime() - obsMs) / 3_600_000
      const mult = buoy ? correctionAt(buoy.correction, hoursAfter) : 1
      const corrected = mult !== 1
      const modelSwellFt = assessment.metrics.exposedSwellHeightFt
      const swellFt = modelSwellFt === null ? null : corrected ? Math.round(modelSwellFt * mult * 10) / 10 : modelSwellFt
      const modelEnergy = c?.exposedSwellEnergy ?? null
      const swellEnergy = modelEnergy === null ? null : corrected ? Math.round(modelEnergy * mult * mult * 10) / 10 : modelEnergy
      const dataIssue = codes.has('STALE_DATA') ? 'stale' : codes.has('MISSING_CRITICAL_DATA') ? 'missing' : null
      return {
        timestamp: assessment.timestamp,
        date: honoluluDateOf(assessment.timestamp),
        hour: honoluluHourOf(assessment.timestamp),
        swellFt,
        swellEnergy,
        swellPeriodSec: c?.exposedSwellPeriodSec ?? null,
        chopFt: c?.exposedChopFt ?? null,
        buoyCorrection: corrected ? Math.round(mult * 100) / 100 : null,
        confidence: confidenceFor({
          dataIssue,
          // Compared as judgements (calm / marginal / excessive), never as feet —
          // the engine's own rule (DECISIONS #1, #15). Covers the extreme case too.
          nwsDisagrees:
            codes.has('SRF_DISAGREES_WITH_MODEL') ||
            (modelSwellFt !== null &&
              assessment.metrics.srfSouthFacingMaxFt !== null &&
              bandOf(modelSwellFt, profile.thresholds.exposedSwellFt) !==
                bandOf(assessment.metrics.srfSouthFacingMaxFt, profile.thresholds.srfSurfFaceFt)),
          nwsMissing: assessment.metrics.srfSouthFacingMaxFt === null,
          buoyDivergencePct: hoursAfter >= 0 && hoursAfter <= 6 ? (buoy?.divergencePct ?? null) : null,
          daysAhead: dayIndex(honoluluDateOf(assessment.timestamp)),
          uncheckedSources: [
            ...(c?.sourceFreshness.alerts?.status === 'ok' ? [] : ['advisories']),
            ...(water.status === 'unknown' ? ['water quality'] : []),
          ],
        }),
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
          { swellEnergy, windMph: assessment.metrics.windSpeedMph, windDirectionDeg: windFromDeg, rain48hIn },
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
        thunder: (() => {
          const utcHour = honoluluLocalToUtc(assessment.timestamp).toISOString().slice(0, 13)
          if (thunder && thunder.coveredUtcHours.includes(utcHour)) {
            const t = thunder.byUtcHour[utcHour]
            return { expected: Boolean(t), source: 'nws' as const, coverage: t?.coverage ?? null }
          }
          const code = c?.weatherCode ?? null
          return code === null ? { expected: null, source: null, coverage: null } : { expected: code >= 95, source: 'model' as const, coverage: null }
        })(),
        closures: closuresAt(CROMWELLS_CLOSURES, honoluluLocalToUtc(assessment.timestamp).getTime()),
        tide: tideAt.get(assessment.timestamp) ?? { direction: null, rateFtPerHr: null, nextTurn: null, midChange: false },
        waterQuality: water,
        jelly,
        dataIssue,
      }
    })

    const sun = sunFor(day.date)
    return {
      date: day.date,
      hours,
      tideExtremes: (report.tideExtremesByDate[day.date] ?? [])
        .filter((e): e is TideExtreme & { heightFt: number } => e.heightFt !== null)
        .map((e) => ({ timestamp: e.timestamp, heightFt: e.heightFt, kind: e.kind })),
      tideRangeFt: dailyRangeFt(
        (report.tideExtremesByDate[day.date] ?? [])
          .filter((e): e is TideExtreme & { heightFt: number } => e.heightFt !== null)
          .map((e) => ({ timestamp: e.timestamp, heightFt: e.heightFt, kind: e.kind })),
      ),
      springNeap: springNeap(day.date),
      sunrise: sun.sunrise,
      sunset: sun.sunset,
    }
  })
}
