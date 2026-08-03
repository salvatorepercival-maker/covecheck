import type { TideStage } from './types'
import type { TideExtreme } from './providers/tides'
import { honoluluDateOf, honoluluLocalToUtc } from './time'

/**
 * Tide stage and range position.
 *
 * Honolulu's daily tide range is small — roughly 1.6 ft on 2026-08-02, spanning
 * 0.16 to 1.74 ft MLLW. The spec's "prefer a mid-to-higher or rising tide" cannot
 * be an absolute foot threshold at that range, so position is expressed as a
 * fraction of the local day's own swing. See DECISIONS.md #3.
 */

/** Within this long of a turning point, the tide is effectively slack. */
const NEAR_EXTREME_MINUTES = 60

export type BracketingExtremes = {
  previous: TideExtreme | null
  next: TideExtreme | null
}

/** The extremes immediately before and after a Honolulu-local timestamp. */
export function bracketingExtremes(
  localTimestamp: string,
  extremes: readonly TideExtreme[],
): BracketingExtremes {
  const target = honoluluLocalToUtc(localTimestamp).getTime()

  let previous: TideExtreme | null = null
  let next: TideExtreme | null = null

  for (const extreme of extremes) {
    const at = honoluluLocalToUtc(extreme.timestamp).getTime()
    if (at <= target) {
      if (!previous || at > honoluluLocalToUtc(previous.timestamp).getTime()) previous = extreme
    } else if (!next || at < honoluluLocalToUtc(next.timestamp).getTime()) {
      next = extreme
    }
  }

  return { previous, next }
}

/**
 * Classify tide stage from the surrounding turning points.
 *
 * Direction comes from what the tide is heading toward, not from differencing
 * hourly samples — near a turn, hourly differences are small enough that noise
 * flips the sign.
 */
export function tideStageAt(
  localTimestamp: string,
  extremes: readonly TideExtreme[],
): TideStage {
  if (extremes.length === 0) return 'unknown'

  const { previous, next } = bracketingExtremes(localTimestamp, extremes)
  const target = honoluluLocalToUtc(localTimestamp).getTime()
  const windowMs = NEAR_EXTREME_MINUTES * 60_000

  for (const extreme of [previous, next]) {
    if (!extreme) continue
    const delta = Math.abs(honoluluLocalToUtc(extreme.timestamp).getTime() - target)
    if (delta <= windowMs) return extreme.kind === 'high' ? 'near-high' : 'near-low'
  }

  if (next) return next.kind === 'high' ? 'rising' : 'falling'
  // Past the last known extreme: the tide is moving away from it.
  if (previous) return previous.kind === 'high' ? 'falling' : 'rising'
  return 'unknown'
}

/**
 * Where a height sits within its own calendar day's range, 0 (day's low) to
 * 1 (day's high). Null when the day has no usable extremes, or when the day's
 * range is too small to make the fraction meaningful.
 */
export function tideRangeFractionAt(
  localTimestamp: string,
  heightFt: number | null,
  extremes: readonly TideExtreme[],
): number | null {
  if (heightFt === null) return null

  const day = honoluluDateOf(localTimestamp)
  const heights = extremes
    .filter((e) => honoluluDateOf(e.timestamp) === day)
    .map((e) => e.heightFt)
    .filter((h): h is number => h !== null)

  if (heights.length < 2) return null

  const min = Math.min(...heights)
  const max = Math.max(...heights)
  const range = max - min

  // A degenerate range would make the fraction meaningless and wildly sensitive.
  if (range < 0.1) return null

  const fraction = (heightFt - min) / range
  return Math.min(1, Math.max(0, fraction))
}
