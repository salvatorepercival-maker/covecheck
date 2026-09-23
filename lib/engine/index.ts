import { honoluluDateOf } from '../time'
import type { BeachProfile, HourlyBeachConditions, ShoreAspect, SurfZoneForecast } from '../types'
import { assessHour, buildContext, type HourAssessment } from './assess'
import {
  bestSubWindow,
  bestWindowForDate,
  DEFAULT_PREFERRED_WINDOW_HOURS,
  DEFAULT_USABLE_HOURS,
  groupWindows,
  rankWindows,
  type CandidateWindow,
  type UsableHours,
} from './windows'
import { VERDICT_LABEL, type Verdict } from './reasons'

export * from './reasons'
export { assessHour, buildContext, hasUnresolvedWindCalibration } from './assess'
export type { HourAssessment, HourMetrics, EngineContext } from './assess'
export * from './windows'

/**
 * Engine version, recorded on every evaluation.
 *
 * Bump on any change to thresholds interpretation, reason semantics, or ranking.
 * Verdicts carry both this and the beach `configVersion` so a stored verdict can
 * always be traced to the logic that produced it.
 */
export const ENGINE_VERSION = '2026-09-23.1'

export type DaySummary = {
  date: string
  /** Best verdict achieved anywhere in the usable hours of this day. */
  verdict: Verdict
  label: string
  /** The full favorable stretch, which may span most of the day. */
  bestWindow: CandidateWindow | null
  /** The specific slice worth recommending — what the UI should show. */
  recommendedWindow: CandidateWindow | null
  hours: HourAssessment[]
}

export type ForecastEvaluation = {
  beachId: string
  beachName: string
  engineVersion: string
  configVersion: string
  evaluatedAtUtc: string
  hours: HourAssessment[]
  windows: CandidateWindow[]
  days: DaySummary[]
  /** Assessment for the hour containing `nowUtc`, when it is in range. */
  current: HourAssessment | null
  /** Highest-ranked full stretch across the whole period. */
  bestWindow: CandidateWindow | null
  /** `bestWindow` tightened to the slice worth recommending. */
  recommendedWindow: CandidateWindow | null
  warnings: string[]
}

export type EvaluateOptions = {
  profile: BeachProfile
  hours: readonly HourlyBeachConditions[]
  /** Parsed NWS Surf Zone Forecast, when available. Bounds surf magnitude. */
  surfZoneForecast?: SurfZoneForecast | null
  nowUtc: Date
  usableHours?: UsableHours
  /** Target length for a recommendation. Defaults to three hours. */
  preferredWindowHours?: number
}

/**
 * Worst south-facing surf-face bound across the product's columns.
 *
 * Deliberately conservative: the SRF's columns are labelled by day and period
 * ("Monday AM"), and mapping those labels onto calendar hours reliably is a
 * separate problem. Until that mapping exists, the worst band in the product
 * bounds every hour. See DECISIONS.md #6.
 */
export function srfBoundFor(
  forecast: SurfZoneForecast | null | undefined,
  shore: ShoreAspect,
): number | null {
  if (!forecast) return null
  const relevant = forecast.bands.filter((band) => band.shore === shore)
  if (relevant.length === 0) return null
  return Math.max(...relevant.map((band) => band.maxFt))
}

/** Best verdict present among a day's hours. */
function bestVerdictOf(hours: readonly HourAssessment[]): Verdict {
  if (hours.some((h) => h.verdict === 'great')) return 'great'
  if (hours.some((h) => h.verdict === 'caution')) return 'caution'
  // Prefer reporting "not enough confidence" over "not recommended" only when no
  // hour was actually assessable.
  if (hours.every((h) => h.verdict === 'insufficient_data')) return 'insufficient_data'
  return 'not_recommended'
}

/**
 * Run the full evaluation: assess every hour, group windows, rank them, and
 * summarize by day.
 *
 * Deterministic given its inputs — `nowUtc` is passed in rather than read.
 */
export function evaluateForecast(options: EvaluateOptions): ForecastEvaluation {
  const { profile, hours, nowUtc } = options
  const usableHours = options.usableHours ?? DEFAULT_USABLE_HOURS
  const warnings: string[] = []

  const srfBound = srfBoundFor(options.surfZoneForecast, profile.shoreAspect)
  if (srfBound === null) {
    warnings.push(
      'no NWS surf-face bound available; swell magnitude is unbounded by an independent source this run',
    )
  }

  const context = buildContext(profile, hours, srfBound)

  if (context.windUncalibrated) {
    warnings.push(
      'wind calibration is unresolved for this beach; wind is judged relative to the forecast period rather than against absolute thresholds',
    )
  }

  const assessments = hours.map((_, index) => assessHour(hours, index, context))
  const windows = groupWindows(assessments, profile.thresholds.minWindowHours, usableHours)
  const ranked = rankWindows(windows)

  const minWindowHours = profile.thresholds.minWindowHours
  const preferredWindowHours = options.preferredWindowHours ?? DEFAULT_PREFERRED_WINDOW_HOURS
  const tighten = (window: CandidateWindow | null) =>
    window ? bestSubWindow(window, minWindowHours, preferredWindowHours, usableHours) : null

  const dates = [...new Set(assessments.map((a) => honoluluDateOf(a.timestamp)))].sort()
  const days: DaySummary[] = dates.map((date) => {
    const dayHours = assessments.filter((a) => honoluluDateOf(a.timestamp) === date)
    const bestWindow = bestWindowForDate(windows, date)
    // The headline verdict for a day is the best window's verdict when one
    // exists, since that is what the user would act on.
    const verdict = bestWindow?.verdict ?? bestVerdictOf(dayHours)
    return {
      date,
      verdict,
      label: VERDICT_LABEL[verdict],
      bestWindow,
      recommendedWindow: tighten(bestWindow),
      hours: dayHours,
    }
  })

  const nowIso = nowUtc.toISOString()
  const current =
    assessments.find(
      (a, index) =>
        a.timestampUtc <= nowIso &&
        (index === assessments.length - 1 || assessments[index + 1].timestampUtc > nowIso),
    ) ?? null

  if (assessments.length === 0) {
    warnings.push('no hours to evaluate')
  }

  const bestWindow = ranked.find((w) => w.verdict === 'great') ?? ranked[0] ?? null

  return {
    beachId: profile.id,
    beachName: profile.name,
    engineVersion: ENGINE_VERSION,
    configVersion: profile.configVersion,
    evaluatedAtUtc: nowIso,
    hours: assessments,
    windows,
    days,
    current,
    bestWindow,
    recommendedWindow: tighten(bestWindow),
    warnings,
  }
}
