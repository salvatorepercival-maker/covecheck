import { windExposureFor, type WindExposure } from '../geo'
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
  tideHeightFt: number | null
  /**
   * How well the tide sits inside this beach's favourable band: 1 inside it,
   * falling toward 0 as it moves away from either edge. Null while the band is
   * uncalibrated.
   *
   * Deliberately not "fraction of the day's range" — that ranked a near-high tide
   * as best, which is wrong at a reef-entry cove where both ends are worse than
   * the middle.
   */
  tideFavorability: number | null
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
  /**
   * True when the beach's favourable tide band is not yet established. While
   * true the engine does not gate on tide at all — a guessed band would be worse
   * than none, because at a reef cove both ends of the tide are unfavourable.
   */
  tideUncalibrated: boolean
  /**
   * True when the tide band is set but provisional. Tide DOES gate the verdict,
   * and the caveat plus the confidence cap keep the thin basis visible.
   */
  tideProvisional: boolean
  /** Sorted non-null wind speeds across the period, for percentile lookup. */
  windDistribution: readonly number[]
}

/** Is there an unresolved calibration gap affecting thresholds matching `needle`? */
export function hasUnresolvedCalibration(profile: BeachProfile, needle: string): boolean {
  return profile.calibration.some(
    (gap) =>
      gap.status === 'unresolved' &&
      gap.affectedThresholds.some((threshold) => threshold.toLowerCase().includes(needle)),
  )
}

export const hasUnresolvedWindCalibration = (profile: BeachProfile) =>
  hasUnresolvedCalibration(profile, 'wind')

export const hasUnresolvedTideCalibration = (profile: BeachProfile) =>
  hasUnresolvedCalibration(profile, 'tide')

/** Is the tide band set, but from evidence too thin to call calibrated? */
export function hasProvisionalTideCalibration(profile: BeachProfile): boolean {
  return profile.calibration.some(
    (gap) =>
      gap.status === 'provisional' &&
      gap.affectedThresholds.some((threshold) => threshold.toLowerCase().includes('tide')),
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
    tideUncalibrated: hasUnresolvedTideCalibration(profile),
    tideProvisional: hasProvisionalTideCalibration(profile),
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

/**
 * 1 inside the favourable band, tapering to 0 over `TIDE_TAPER_FT` beyond either
 * edge. Symmetric, because too much water is as unhelpful as too little here.
 */
const TIDE_TAPER_FT = 0.8

export function tideFavorabilityOf(
  heightFt: number | null,
  band: { minFt: number; maxFt: number },
): number | null {
  if (heightFt === null) return null
  if (heightFt >= band.minFt && heightFt <= band.maxFt) return 1

  const distance = heightFt < band.minFt ? band.minFt - heightFt : heightFt - band.maxFt
  return Math.max(0, 1 - distance / TIDE_TAPER_FT)
}

/**
 * Place a height in a beach's three-way judgement.
 *
 * Used to compare the surf forecast against the model without ever subtracting
 * one from the other, since they measure different things.
 */
export function bandOf(
  value: number,
  thresholds: { great: number; caution: number },
): 'calm' | 'marginal' | 'excessive' {
  if (value > thresholds.caution) return 'excessive'
  if (value > thresholds.great) return 'marginal'
  return 'calm'
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
  tideProvisional: boolean,
): Confidence {
  if (verdict === 'insufficient_data') return 'low'

  const missingCritical = [
    metrics.exposedSwellHeightFt,
    metrics.windSpeedMph,
    metrics.tideHeightFt,
  ].filter((value) => value === null).length

  if (missingCritical >= 2) return 'low'
  if (missingCritical >= 1) return 'medium'

  // The verdict stands, but a primary factor is not yet trustworthy in absolute
  // terms, so CoveCheck should not present it as settled.
  if (windUncalibrated) return 'medium'

  // A provisional band is gating the verdict on a single observation. That is
  // enough to act on, not enough to be confident about.
  if (tideProvisional) return 'medium'

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

  // --- NWS surf forecast: a cross-check on the model, plus an extreme backstop. ---
  //
  // Deliberately NOT an independent gate. The Weather Service publishes one figure
  // for a whole shore; `exposedSwellHeightFt` is filtered to the directions this
  // cove is actually open to. Letting the shore-wide number veto the beach-specific
  // one inverts which is more relevant, and capped entire weeks at caution twice.
  const srfMax = context.srfSouthFacingMaxFt
  if (srfMax !== null) {
    if (srfMax >= thresholds.srfExtremeSurfFaceFt) {
      // The one unilateral case: no local sheltering argument should survive this.
      reasons.push(
        reason(
          'SRF_EXCEEDS_THRESHOLD',
          `National Weather Service surf up to ${srfMax} ft on ${context.profile.shoreAspect}-facing shores`,
        ),
      )
    } else if (exposed !== null) {
      // Compare the two as JUDGEMENTS, never as feet: a surf-face height and an
      // offshore height are different measurements (DECISIONS.md #1), so the only
      // sound comparison is which band each lands in.
      const modelBand = bandOf(exposed, thresholds.exposedSwellFt)
      const srfBand = bandOf(srfMax, thresholds.srfSurfFaceFt)

      if (srfBand !== 'calm' && modelBand === 'calm') {
        reasons.push(
          reason(
            'SRF_DISAGREES_WITH_MODEL',
            `Weather Service up to ${srfMax} ft on ${context.profile.shoreAspect}-facing shores, model ${exposed.toFixed(1)} ft reaching this cove`,
          ),
        )
      }
    }
  }

  // --- Wind. Direction decides which speed limits apply, because fetch does. ---
  const exposure: WindExposure | null =
    hour.windDirectionDeg === null
      ? null
      : windExposureFor(hour.windDirectionDeg, context.profile.shoreAspect)

  if (exposure === 'offshore') {
    reasons.push(reason('FAVORABLE_WIND_DIRECTION', `from ${hour.windDirectionDeg}°`))
  } else if (exposure === 'onshore') {
    reasons.push(reason('ONSHORE_WIND', `from ${hour.windDirectionDeg}°`))
  }

  // Cross-shore is treated as onshore: alongshore fetch can still build chop.
  const windLimits =
    exposure === 'offshore' ? thresholds.windSpeedMph.offshore : thresholds.windSpeedMph.onshore
  const gustLimits =
    exposure === 'offshore' ? thresholds.windGustMph.offshore : thresholds.windGustMph.onshore

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
    // Each measure lands in one of three bands. The middle one — over `great`,
    // under `caution` — emitted nothing at all, on either measure, so the hour
    // resolved to `great` with no wind line anywhere in its reasons. Swell
    // (MARGINAL_SWELL, above) and tide both speak in their middle band; wind was
    // the only silent one.
    //
    // MARGINAL_WIND is a `caveat`: it is shown, and it caps confidence at
    // medium, and `resolveVerdict` does not read caveats — so the verdict is
    // untouched by design. The two measures collapse into one reason rather than
    // two, because they are one fact about the same wind and the copy would
    // otherwise repeat verbatim within a single hour.
    //
    // The two measures are banded INDEPENDENTLY, so one can be over `caution`
    // while the other is still mid-band. That hour is a genuine wind hazard, and
    // the caveat's copy ends "below the level CoveCheck treats as too gusty" —
    // so emitting it there prints a reassurance directly beneath "Gusty wind is
    // forecast" and softens it. `hazardousWind` suppresses the caveat for the
    // whole hour whenever either measure has already raised STRONG_GUSTS: the
    // hazard reason is the stronger and truer statement about that wind, and a
    // caveat can only subtract from it. Found by `reviewer` on PR #20 at 28 mph
    // sustained with 45 mph gusts. `mergeReasons` repeats the rule at window
    // scope, where dedup across hours can reassemble the pair.
    const marginal: string[] = []
    let hazardousWind = false

    if (hour.windSpeedMph <= windLimits.great) {
      reasons.push(reason('CALM_WIND', `${hour.windSpeedMph.toFixed(0)} mph ${exposure ?? 'wind'}`))
    } else if (hour.windSpeedMph > windLimits.caution) {
      reasons.push(reason('STRONG_GUSTS', `${hour.windSpeedMph.toFixed(0)} mph sustained`))
      hazardousWind = true
    } else {
      marginal.push(`${hour.windSpeedMph.toFixed(0)} mph sustained`)
    }

    if (hour.windGustMph !== null && hour.windGustMph > gustLimits.caution) {
      reasons.push(reason('STRONG_GUSTS', `gusts to ${hour.windGustMph.toFixed(0)} mph`))
      hazardousWind = true
    } else if (hour.windGustMph !== null && hour.windGustMph > gustLimits.great) {
      marginal.push(`gusts to ${hour.windGustMph.toFixed(0)} mph`)
    }

    if (marginal.length > 0 && !hazardousWind) {
      reasons.push(reason('MARGINAL_WIND', marginal.join(', ')))
    }
  }

  // --- Tide. A band in feet above MLLW: both ends are unfavourable here. ---
  if (hour.tideHeightFt === null) {
    // The profile calls out a shallow reef shelf, so water depth is critical here.
    reasons.push(reason('MISSING_CRITICAL_DATA', 'no usable tide data for this hour'))
  } else if (context.tideUncalibrated) {
    reasons.push(reason('TIDE_NOT_CALIBRATED', `${hour.tideHeightFt.toFixed(2)} ft above MLLW`))
  } else if (hour.tideHeightFt < thresholds.favorableTideFt.minFt) {
    reasons.push(reason('LOW_TIDE_OVER_REEF', `${hour.tideHeightFt.toFixed(2)} ft above MLLW`))
  } else if (hour.tideHeightFt > thresholds.favorableTideFt.maxFt) {
    reasons.push(reason('HIGH_TIDE_LESS_SHALLOW', `${hour.tideHeightFt.toFixed(2)} ft above MLLW`))
  } else {
    reasons.push(reason('FAVORABLE_TIDE', `${hour.tideHeightFt.toFixed(2)} ft above MLLW`))
  }

  // Shown whenever the band gated anything, so the thin basis travels with the verdict.
  if (hour.tideHeightFt !== null && !context.tideUncalibrated && context.tideProvisional) {
    reasons.push(
      reason(
        'TIDE_BAND_PROVISIONAL',
        `band ${thresholds.favorableTideFt.minFt}-${thresholds.favorableTideFt.maxFt} ft from 1 observation`,
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
    tideHeightFt: hour.tideHeightFt,
    tideFavorability: context.tideUncalibrated
      ? null
      : tideFavorabilityOf(hour.tideHeightFt, thresholds.favorableTideFt),
    recentRainIn,
    srfSouthFacingMaxFt: context.srfSouthFacingMaxFt,
  }

  const verdict = resolveVerdict(reasons)

  return {
    timestamp: hour.timestamp,
    timestampUtc: hour.timestampUtc,
    verdict,
    confidence: resolveConfidence(
      verdict,
      reasons,
      metrics,
      context.windUncalibrated,
      context.tideProvisional,
    ),
    reasons,
    metrics,
    configVersion: context.profile.configVersion,
  }
}
