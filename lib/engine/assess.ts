import { isDirectionInAnyRange } from '../geo'
import type { BeachProfile, HourlyBeachConditions, ProviderId, SourceStatus } from '../types'
import {
  reason,
  type Confidence,
  type Reason,
  type ReasonSeverity,
  type Verdict,
} from './reasons'

/**
 * Deterministic per-hour assessment.
 *
 * No LLM, no randomness, no clock reads: the same inputs always produce the same
 * verdict, reason codes and confidence. Every decision here is a threshold
 * comparison against versioned beach configuration.
 */

/** Hours of precipitation summed when judging runoff. */
export const RAIN_LOOKBACK_HOURS = 12

/**
 * Percentile bounds used to judge wind while calibration is unresolved.
 *
 * These are positions within the forecast period's own wind distribution, not
 * absolute speeds. An unknown bias in the provider cell shifts every hour
 * together, so the *ordering* survives even though the magnitudes do not. See
 * `windUncalibrated` below and DECISIONS.md #2.
 */
export const CALM_WIND_PERCENTILE = 0.25

export type HourMetrics = {
  exposedSwellHeightFt: number | null
  windSpeedMph: number | null
  windGustMph: number | null
  /** Position in the period's wind distribution, 0 = calmest hour. */
  windPercentile: number | null
  tideRangeFraction: number | null
  recentRainIn: number | null
  srfSouthFacingMaxFt: number | null
}

export type HourAssessment = {
  timestamp: string
  timestampUtc: string
  verdict: Verdict
  confidence: Confidence
  reasons: Reason[]
  metrics: HourMetrics
  /** Beach configuration that produced this verdict, for traceability. */
  configVersion: string
}

export type EngineContext = {
  profile: BeachProfile
  /**
   * Worst south-facing surf-face bound from the NWS Surf Zone Forecast, or null
   * when unavailable. Day-level and deliberately conservative — see DECISIONS.md #6.
   */
  srfSouthFacingMaxFt: number | null
  /**
   * True when the beach has an unresolved wind calibration gap. While true, the
   * engine must not compare raw provider wind against the shoreline-referenced
   * thresholds; it judges wind relatively instead.
   */
  windUncalibrated: boolean
  /** Sorted non-null wind speeds across the period, for percentile lookup. */
  windDistribution: readonly number[]
}

/** Does this beach have an unresolved calibration gap affecting wind thresholds? */
export function hasUnresolvedWindCalibration(profile: BeachProfile): boolean {
  return profile.calibration.some(
    (gap) =>
      gap.status === 'unresolved' &&
      gap.affectedThresholds.some((threshold) => threshold.includes('wind')),
  )
}

export function buildContext(
  profile: BeachProfile,
  hours: readonly HourlyBeachConditions[],
  srfSouthFacingMaxFt: number | null,
): EngineContext {
  const windDistribution = hours
    .map((h) => h.windSpeedMph)
    .filter((w): w is number => w !== null)
    .sort((a, b) => a - b)

  return {
    profile,
    srfSouthFacingMaxFt,
    windUncalibrated: hasUnresolvedWindCalibration(profile),
    windDistribution,
  }
}

/**
 * Midrank percentile of `value` within `sorted`. Null when there is nothing to
 * compare against.
 *
 * Ties count as half, which is what makes a flat distribution land at 0.5 rather
 * than 1.0. A uniformly calm forecast must not read as "windiest hour" for every
 * one of its hours.
 */
export function percentileOf(value: number | null, sorted: readonly number[]): number | null {
  if (value === null || sorted.length === 0) return null

  let below = 0
  let equal = 0
  for (const entry of sorted) {
    if (entry < value) below += 1
    else if (entry === value) equal += 1
    else break
  }

  return (below + equal / 2) / sorted.length
}

/** Precipitation over the preceding `RAIN_LOOKBACK_HOURS`, inclusive of this hour. */
export function recentRainInches(
  hours: readonly HourlyBeachConditions[],
  index: number,
): number | null {
  const start = Math.max(0, index - RAIN_LOOKBACK_HOURS + 1)
  const slice = hours.slice(start, index + 1).map((h) => h.precipitationIn)

  // All-null means we cannot say anything about runoff, which is not the same as
  // "it did not rain".
  if (slice.every((value) => value === null)) return null
  return slice.reduce<number>((sum, value) => sum + (value ?? 0), 0)
}

function statusOf(hour: HourlyBeachConditions, provider: ProviderId): SourceStatus {
  return hour.sourceFreshness[provider]?.status ?? 'missing'
}

const has = (reasons: readonly Reason[], severity: ReasonSeverity) =>
  reasons.some((r) => r.severity === severity)

function resolveVerdict(reasons: readonly Reason[]): Verdict {
  // A blocker outranks everything, including missing data: an active High Surf
  // Advisory is definitive regardless of how fresh the wave model is.
  if (has(reasons, 'blocker')) return 'not_recommended'
  if (has(reasons, 'disqualifying')) return 'insufficient_data'
  if (has(reasons, 'negative')) return 'caution'
  return 'great'
}

/**
 * Confidence in the verdict, which is separate from the verdict itself.
 *
 * Note that the three metrics below each also emit `MISSING_CRITICAL_DATA`, so a
 * gap in any of them already forces `insufficient_data`. The count is kept as a
 * guard, not as the main path — `medium` is reached through the softer signals:
 * an unresolved calibration gap, or a secondary value we simply do not have.
 */
function resolveConfidence(
  verdict: Verdict,
  reasons: readonly Reason[],
  metrics: HourMetrics,
  windUncalibrated: boolean,
): Confidence {
  if (verdict === 'insufficient_data') return 'low'

  const missingCritical = [
    metrics.exposedSwellHeightFt,
    metrics.windSpeedMph,
    metrics.tideRangeFraction,
  ].filter((value) => value === null).length

  if (missingCritical >= 2) return 'low'
  if (missingCritical >= 1) return 'medium'

  // The verdict stands, but a primary factor is not yet trustworthy in absolute
  // terms, so CoveCheck should not present it as settled.
  if (windUncalibrated) return 'medium'

  // A secondary value is missing, or something flagged itself as a caveat.
  if (metrics.windGustMph === null || has(reasons, 'caveat')) return 'medium'

  return 'high'
}

export function assessHour(
  hours: readonly HourlyBeachConditions[],
  index: number,
  context: EngineContext,
): HourAssessment {
  const hour = hours[index]
  const { thresholds } = context.profile
  const reasons: Reason[] = []

  // --- Hazards. Evaluated first because they are definitive. ---
  const blocking = hour.activeHazards.filter((hazard) => hazard.isBlocking)
  if (blocking.length > 0) {
    reasons.push(
      reason('ACTIVE_BEACH_HAZARD', blocking.map((hazard) => hazard.event).join(', ')),
    )
  }

  const alertsStatus = statusOf(hour, 'alerts')
  if (alertsStatus === 'failed' || alertsStatus === 'missing') {
    // Distinct from "no hazards": an unknown hazard state cannot support a green.
    reasons.push(reason('HAZARD_STATE_UNKNOWN'))
  } else if (alertsStatus === 'stale') {
    reasons.push(reason('STALE_DATA', 'advisory check is older than 30 minutes'))
  }

  // --- Wave energy. Judged on direction-filtered height, never raw model height. ---
  const marineStatus = statusOf(hour, 'marine')
  const exposed = hour.exposedSwellHeightFt

  if (marineStatus === 'stale') {
    reasons.push(reason('STALE_DATA', 'wave forecast is older than 2 hours'))
  }

  if (exposed === null) {
    reasons.push(reason('MISSING_CRITICAL_DATA', 'no usable wave data for this hour'))
  } else if (exposed > thresholds.exposedSwellFt.caution) {
    reasons.push(
      reason('EXCESSIVE_SWELL', `${exposed.toFixed(1)} ft of swell reaching this beach`),
    )
  } else if (exposed > thresholds.exposedSwellFt.great) {
    reasons.push(reason('MARGINAL_SWELL', `${exposed.toFixed(1)} ft reaching this beach`))
  } else {
    reasons.push(reason('LOW_WAVE_ENERGY', `${exposed.toFixed(1)} ft reaching this beach`))
  }

  // Directional explanation for why the swell counts, when it is consequential.
  if (
    exposed !== null &&
    exposed > thresholds.exposedSwellFt.great &&
    hour.exposedPartitions.length > 0
  ) {
    reasons.push(
      reason(
        'DIRECT_SOUTH_SWELL',
        hour.exposedPartitions.map((p) => `${p.heightFt.toFixed(1)} ft from ${p.directionDeg}°`).join(', '),
      ),
    )
  }

  // --- NWS surf-face bound. Bounds magnitude; the model bounds shape. ---
  if (context.srfSouthFacingMaxFt !== null) {
    if (context.srfSouthFacingMaxFt > thresholds.srfSurfFaceFt.caution) {
      reasons.push(
        reason(
          'SRF_EXCEEDS_THRESHOLD',
          `National Weather Service surf up to ${context.srfSouthFacingMaxFt} ft on south-facing shores`,
        ),
      )
    } else if (context.srfSouthFacingMaxFt > thresholds.srfSurfFaceFt.great) {
      reasons.push(
        reason('SRF_MARGINAL_SURF', `up to ${context.srfSouthFacingMaxFt} ft on ${context.profile.shoreAspect}-facing shores`),
      )
    }
  }

  // --- Wind. Direction is bias-free and gates normally; magnitude may not. ---
  if (hour.windDirectionDeg !== null) {
    if (isDirectionInAnyRange(hour.windDirectionDeg, context.profile.favorableWindDirections)) {
      reasons.push(reason('FAVORABLE_WIND_DIRECTION', `from ${hour.windDirectionDeg}°`))
    } else if (
      isDirectionInAnyRange(hour.windDirectionDeg, context.profile.exposedSwellDirections)
    ) {
      // Blowing in off the water this beach faces.
      reasons.push(reason('ONSHORE_WIND', `from ${hour.windDirectionDeg}°`))
    }
  }

  const windPercentile = percentileOf(hour.windSpeedMph, context.windDistribution)

  if (hour.windSpeedMph === null) {
    reasons.push(reason('MISSING_CRITICAL_DATA', 'no wind data for this hour'))
  } else if (context.windUncalibrated) {
    reasons.push(reason('WIND_NOT_CALIBRATED', `${hour.windSpeedMph.toFixed(0)} mph at the model cell`))

    // Relative position is still reportable, and still ranks windows. It is
    // deliberately never used to *downgrade*: on a uniformly calm morning the
    // top quartile is still calm, and calling it gusty would be false.
    if (windPercentile !== null && windPercentile <= CALM_WIND_PERCENTILE) {
      reasons.push(reason('CALM_WIND', 'among the calmest hours in this forecast'))
    }
  } else {
    // Calibrated: absolute thresholds are meaningful.
    if (hour.windSpeedMph <= thresholds.windSpeedMph.great) {
      reasons.push(reason('CALM_WIND', `${hour.windSpeedMph.toFixed(0)} mph`))
    } else if (hour.windSpeedMph > thresholds.windSpeedMph.caution) {
      reasons.push(reason('STRONG_GUSTS', `${hour.windSpeedMph.toFixed(0)} mph sustained`))
    }

    if (hour.windGustMph !== null && hour.windGustMph > thresholds.windGustMph.caution) {
      reasons.push(reason('STRONG_GUSTS', `gusts to ${hour.windGustMph.toFixed(0)} mph`))
    }
  }

  // --- Tide over the reef. Expressed as a fraction of the local day's range. ---
  if (hour.tideRangeFraction === null) {
    // The profile calls out a shallow reef shelf, so water depth is critical here.
    reasons.push(reason('MISSING_CRITICAL_DATA', 'no usable tide data for this hour'))
  } else if (hour.tideRangeFraction >= thresholds.minTideRangeFraction) {
    reasons.push(
      reason('FAVORABLE_TIDE', `${Math.round(hour.tideRangeFraction * 100)}% of today's tide range`),
    )
  } else {
    reasons.push(
      reason(
        'LOW_TIDE_OVER_REEF',
        `${Math.round(hour.tideRangeFraction * 100)}% of today's tide range`,
      ),
    )
  }

  // --- Runoff. ---
  const recentRainIn = recentRainInches(hours, index)
  if (recentRainIn !== null && recentRainIn > thresholds.recentRainInchesBlocking) {
    reasons.push(
      reason('RECENT_HEAVY_RAIN', `${recentRainIn.toFixed(2)} in over the last ${RAIN_LOOKBACK_HOURS} h`),
    )
  }

  const metrics: HourMetrics = {
    exposedSwellHeightFt: exposed,
    windSpeedMph: hour.windSpeedMph,
    windGustMph: hour.windGustMph,
    windPercentile,
    tideRangeFraction: hour.tideRangeFraction,
    recentRainIn,
    srfSouthFacingMaxFt: context.srfSouthFacingMaxFt,
  }

  const verdict = resolveVerdict(reasons)

  return {
    timestamp: hour.timestamp,
    timestampUtc: hour.timestampUtc,
    verdict,
    confidence: resolveConfidence(verdict, reasons, metrics, context.windUncalibrated),
    reasons,
    metrics,
    configVersion: context.profile.configVersion,
  }
}
