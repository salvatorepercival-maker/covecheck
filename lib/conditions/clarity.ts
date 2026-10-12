import { windExposureFor, type ShoreFacing } from '../geo'

/**
 * Water clarity estimate.
 *
 * There is no live clarity feed for this cove, so this is a model: start from a
 * clear-day visibility and subtract for the three things that stir or cloud the
 * water — swell ENERGY reaching the reef (H²T, so long-period groundswell
 * stirs the bottom more than its height suggests), wind (onshore counts more), and recent rain
 * runoff. Every coefficient is a starting guess, which is why the result is
 * always labelled an estimate and why visit reports store these exact inputs:
 * they are the calibration dataset for every number below.
 */

export const CLARITY_MODEL = {
  version: 'clarity-2026-10-12.1',
  /** Visibility on a flat, still, dry day at a south-shore Oahu reef, ft. */
  clearDayFt: 40,
  /** Swell energy below this (≈ 0.5 ft at 10 s) does not stir the bottom noticeably, ft²·s. */
  swellFreeEnergy: 2.5,
  /**
   * Visibility lost per unit of exposed swell energy above `swellFreeEnergy`.
   * Set so a 3 ft 10 s swell loses the same 17.5 ft the height model took off.
   */
  ftLostPerEnergy: 0.2,
  /** Wind below this does not cloud the water. */
  windFreeMph: 10,
  /** Visibility lost per mph above `windFreeMph`; onshore wind multiplied by `onshoreFactor`. */
  ftLostPerWindMph: 0.6,
  onshoreFactor: 1.5,
  /** Visibility lost per inch of rain in the last 48 h (runoff). */
  ftLostPerRainInch: 15,
  minFt: 5,
  maxFt: 60,
} as const

export type ClarityInputs = {
  /** Σ H²T of exposed swell, ft²·s. */
  swellEnergy: number | null
  windMph: number | null
  windDirectionDeg: number | null
  rain48hIn: number | null
}

export type ClarityEstimate = {
  /** Rounded to the nearest 5 ft — the model is not finer than that. */
  ft: number
  confidence: 'low' | 'medium'
  /** What drove it down most, for the tile's one-line detail. */
  mainCause: 'swell' | 'wind' | 'rain' | null
  inputs: ClarityInputs
  modelVersion: string
}

export function estimateClarity(inputs: ClarityInputs, facing: ShoreFacing): ClarityEstimate | null {
  if (inputs.swellEnergy === null) return null
  const m = CLARITY_MODEL
  const swellLoss = Math.max(0, inputs.swellEnergy - m.swellFreeEnergy) * m.ftLostPerEnergy
  const onshore =
    inputs.windDirectionDeg !== null && windExposureFor(inputs.windDirectionDeg, facing) !== 'offshore'
  const windLoss =
    inputs.windMph === null ? 0 : Math.max(0, inputs.windMph - m.windFreeMph) * m.ftLostPerWindMph * (onshore ? m.onshoreFactor : 1)
  const rainLoss = (inputs.rain48hIn ?? 0) * m.ftLostPerRainInch

  const raw = m.clearDayFt - swellLoss - windLoss - rainLoss
  const ft = Math.round(Math.min(m.maxFt, Math.max(m.minFt, raw)) / 5) * 5

  const losses = [
    ['swell', swellLoss],
    ['wind', windLoss],
    ['rain', rainLoss],
  ] as const
  const [cause, loss] = [...losses].sort((a, b) => b[1] - a[1])[0]

  return {
    ft,
    // Uncalibrated: no visit reports yet. Missing wind or rain lowers nothing
    // further — it is already the floor.
    confidence: 'low',
    mainCause: loss >= 3 ? cause : null,
    inputs,
    modelVersion: m.version,
  }
}
