import { isDirectionInAnyRange, type DirectionRange } from '../geo'
import type { BuoyObservation } from '../providers/buoy'
import { BUOY_STALE_MINUTES } from '../providers/buoy'

/**
 * The real-time buoy against the forecast, and the near-term correction.
 *
 * The buoy (NDBC 51211) sits ~17 km west in 35 m of water, so it is a check on
 * the offshore swell, not a reading of the cove. Only swell arriving from inside
 * the cove's window is compared; a west swell the buoy sees but Black Point does
 * not is reported, never used. See DECISIONS #18.
 */

/** Hours over which the buoy's correction fades back to the model. */
export const CORRECTION_HOURS = 6
/** Never scale the model by more than this, either way: a bad buoy row must not rewrite the day. */
export const MAX_CORRECTION = 2

export type BuoyComparison = {
  observedUtc: string
  ageMinutes: number
  stale: boolean
  buoySwellFt: number | null
  buoyPeriodSec: number | null
  buoyFromText: string | null
  /** Buoy swell direction inside the cove's exposure window. */
  inWindow: boolean
  /** Model exposed swell (swell partitions only) for the observation hour, ft. */
  forecastSwellFt: number | null
  /** (buoy − forecast) / forecast, %. Null when not comparable. */
  divergencePct: number | null
  /** Ratio applied to the next hours' swell height (1 = none). */
  correction: number
}

export function compareBuoy(
  obs: BuoyObservation,
  forecastSwellFtAtObs: number | null,
  window: readonly DirectionRange[],
  now: Date,
): BuoyComparison {
  const ageMinutes = Math.round((now.getTime() - new Date(obs.observedUtc).getTime()) / 60_000)
  const stale = ageMinutes > BUOY_STALE_MINUTES
  const inWindow = obs.swellFromDeg !== null && isDirectionInAnyRange(obs.swellFromDeg, window)
  const comparable = !stale && inWindow && obs.swellHeightFt !== null && forecastSwellFtAtObs !== null && forecastSwellFtAtObs >= 0.5
  const ratio = comparable ? obs.swellHeightFt! / forecastSwellFtAtObs! : 1
  return {
    observedUtc: obs.observedUtc,
    ageMinutes,
    stale,
    buoySwellFt: obs.swellHeightFt,
    buoyPeriodSec: obs.swellPeriodSec,
    buoyFromText: obs.swellFromText,
    inWindow,
    forecastSwellFt: forecastSwellFtAtObs,
    divergencePct: comparable ? Math.round((ratio - 1) * 100) : null,
    correction: comparable ? Math.min(MAX_CORRECTION, Math.max(1 / MAX_CORRECTION, ratio)) : 1,
  }
}

/** Height multiplier for an hour `hoursAfter` the observation: full at 0, fading to none at CORRECTION_HOURS. */
export function correctionAt(correction: number, hoursAfter: number): number {
  if (hoursAfter < 0 || hoursAfter > CORRECTION_HOURS) return 1
  return 1 + (correction - 1) * (1 - hoursAfter / CORRECTION_HOURS)
}
