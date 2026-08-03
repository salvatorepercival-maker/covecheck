import { honoluluDateOf, honoluluHourOf, honoluluLocalToUtc } from '../time'
import type { HourAssessment } from './assess'
import { reason, type Confidence, type Reason, type Verdict } from './reasons'

/**
 * Grouping favorable hours into candidate windows, and ranking them.
 *
 * Ranking is a fixed weighted sum with an explicit tie-break, so the ordering is
 * reproducible and reviewable. No scoring happens without a reason attached — a
 * bare number is never shown to the user.
 */

/**
 * Hours a family outing could plausibly happen in, local time.
 *
 * Without this, "favor morning hours" would rank 4 AM as the best window of the
 * day. Not a safety threshold — a usability one. Overridable per evaluation.
 */
export const DEFAULT_USABLE_HOURS = { earliest: 6, latest: 18 } as const

/** A window this long or longer is treated as fully useful. */
const IDEAL_WINDOW_HOURS = 4

const WEIGHTS = {
  swell: 0.3,
  wind: 0.2,
  tide: 0.15,
  morning: 0.15,
  confidence: 0.1,
  length: 0.1,
} as const

export type UsableHours = { earliest: number; latest: number }

export type CandidateWindow = {
  startTimestamp: string
  /** Inclusive timestamp of the final hour in the window. */
  endTimestamp: string
  /** Honolulu-local calendar date the window starts on. */
  date: string
  hours: HourAssessment[]
  lengthHours: number
  verdict: Verdict
  confidence: Confidence
  /** Deduplicated reasons drawn from the constituent hours. */
  reasons: Reason[]
  /** Lower is better. Comparable only within one evaluation. */
  score: number
}

const CONFIDENCE_PENALTY: Record<Confidence, number> = { high: 0, medium: 0.5, low: 1 }

/** Weakest confidence across the window — a single low hour makes the window uncertain. */
function weakestConfidence(hours: readonly HourAssessment[]): Confidence {
  if (hours.some((h) => h.confidence === 'low')) return 'low'
  if (hours.some((h) => h.confidence === 'medium')) return 'medium'
  return 'high'
}

const mean = (values: readonly (number | null)[]): number | null => {
  const present = values.filter((v): v is number => v !== null)
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0) / present.length
}

/** Consecutive in time means exactly one hour apart. */
function isNextHour(previous: HourAssessment, next: HourAssessment): boolean {
  const gap = honoluluLocalToUtc(next.timestamp).getTime() - honoluluLocalToUtc(previous.timestamp).getTime()
  return gap === 3_600_000
}

function isUsableHour(assessment: HourAssessment, usable: UsableHours): boolean {
  const hour = honoluluHourOf(assessment.timestamp)
  return hour >= usable.earliest && hour <= usable.latest
}

/**
 * Collapse the reasons from every hour into one deduplicated list.
 *
 * Keeps the first occurrence of each code so the detail string belongs to a real
 * hour, and orders blockers and negatives ahead of positives — the reason a
 * window is limited matters more than the reasons it is pleasant.
 */
export function mergeReasons(hours: readonly HourAssessment[]): Reason[] {
  const seen = new Map<string, Reason>()
  for (const hour of hours) {
    for (const entry of hour.reasons) {
      if (!seen.has(entry.code)) seen.set(entry.code, entry)
    }
  }

  const order = { blocker: 0, disqualifying: 1, negative: 2, caveat: 3, positive: 4 } as const
  return [...seen.values()].sort((a, b) => order[a.severity] - order[b.severity])
}

/**
 * Group consecutive hours sharing a verdict into candidate windows.
 *
 * A run of `great` hours shorter than `minWindowHours` is downgraded to
 * `caution` and carries `INSUFFICIENT_WINDOW`: a single favorable hour is not
 * enough to send a family to the beach on.
 */
/** Build a window from a run of consecutive, same-verdict hours. */
export function makeWindow(
  hours: readonly HourAssessment[],
  minWindowHours: number,
  usable: UsableHours = DEFAULT_USABLE_HOURS,
): CandidateWindow {
  const tier = hours[0].verdict
  const tooShort = tier === 'great' && hours.length < minWindowHours

  const reasons = mergeReasons(hours)
  if (tooShort) {
    reasons.unshift(
      reason(
        'INSUFFICIENT_WINDOW',
        `only ${hours.length} favorable hour${hours.length === 1 ? '' : 's'} in a row, ${minWindowHours} needed`,
      ),
    )
  }

  const window: CandidateWindow = {
    startTimestamp: hours[0].timestamp,
    endTimestamp: hours[hours.length - 1].timestamp,
    date: honoluluDateOf(hours[0].timestamp),
    hours: [...hours],
    lengthHours: hours.length,
    verdict: tooShort ? 'caution' : tier,
    confidence: weakestConfidence(hours),
    reasons,
    score: Number.POSITIVE_INFINITY,
  }

  return { ...window, score: scoreWindow(window, usable) }
}

export function groupWindows(
  assessments: readonly HourAssessment[],
  minWindowHours: number,
  usable: UsableHours = DEFAULT_USABLE_HOURS,
): CandidateWindow[] {
  const windows: CandidateWindow[] = []
  let run: HourAssessment[] = []

  const flush = () => {
    if (run.length === 0) return
    const hours = run
    run = []
    windows.push(makeWindow(hours, minWindowHours, usable))
  }

  for (const assessment of assessments) {
    const eligible =
      (assessment.verdict === 'great' || assessment.verdict === 'caution') &&
      isUsableHour(assessment, usable)

    if (!eligible) {
      flush()
      continue
    }

    const previous = run[run.length - 1]
    if (previous && (previous.verdict !== assessment.verdict || !isNextHour(previous, assessment))) {
      flush()
    }
    run.push(assessment)
  }
  flush()

  return windows
}

/** Hours to aim for in a recommendation. HANDOFF.md asks for a two- or three-hour window. */
export const DEFAULT_PREFERRED_WINDOW_HOURS = 3

/**
 * Tighten a long favorable stretch into the specific slice worth recommending.
 *
 * A whole-day run is not a recommendation. This matters most when conditions
 * barely vary — for instance while uncalibrated wind caps every hour at the same
 * verdict, every usable hour merges into one 13-hour block. Sliding a
 * fixed-length frame across the run and scoring each position recovers a
 * genuinely useful "come at this time" answer, using the same weights as the
 * top-level ranking so the two cannot disagree.
 *
 * Returns the window unchanged when it is already at or under the target length.
 */
export function bestSubWindow(
  window: CandidateWindow,
  minWindowHours: number,
  preferredHours = DEFAULT_PREFERRED_WINDOW_HOURS,
  usable: UsableHours = DEFAULT_USABLE_HOURS,
): CandidateWindow {
  const target = Math.max(minWindowHours, preferredHours)
  if (window.lengthHours <= target) return window

  let best: CandidateWindow | null = null
  for (let start = 0; start + target <= window.lengthHours; start += 1) {
    const candidate = makeWindow(window.hours.slice(start, start + target), minWindowHours, usable)
    // Ties resolve to the earlier slice, matching the morning preference.
    if (best === null || candidate.score < best.score) best = candidate
  }

  return best ?? window
}

/**
 * Score a window. Lower is better.
 *
 * Every term is normalized to 0-1 so the weights are directly comparable, and a
 * term with no data contributes its neutral midpoint rather than being skipped —
 * missing information should not look like an advantage.
 */
export function scoreWindow(
  window: CandidateWindow,
  usable: UsableHours = DEFAULT_USABLE_HOURS,
): number {
  const hours = window.hours

  // Swell, relative to the point where this beach stops being suitable.
  const meanSwell = mean(hours.map((h) => h.metrics.exposedSwellHeightFt))
  const swellCeiling = Math.max(
    0.5,
    ...hours.map((h) => h.metrics.exposedSwellHeightFt ?? 0),
    3,
  )
  const swellTerm = meanSwell === null ? 0.5 : Math.min(1, meanSwell / swellCeiling)

  // Wind by percentile: bias-invariant, so it is valid even uncalibrated.
  const meanWindPercentile = mean(hours.map((h) => h.metrics.windPercentile))
  const windTerm = meanWindPercentile ?? 0.5

  // Tide: closeness to this beach's favourable band, inverted so lower is better.
  // Not depth — at a reef cove a near-high tide is not the best tide.
  const meanTide = mean(hours.map((h) => h.metrics.tideFavorability))
  const tideTerm = meanTide === null ? 0.5 : 1 - meanTide

  // Morning preference, measured across the usable part of the day.
  const startHour = honoluluHourOf(window.startTimestamp)
  const span = Math.max(1, usable.latest - usable.earliest)
  const morningTerm = Math.min(1, Math.max(0, (startHour - usable.earliest) / span))

  const confidenceTerm = CONFIDENCE_PENALTY[window.confidence]

  const lengthTerm = 1 - Math.min(1, window.lengthHours / IDEAL_WINDOW_HOURS)

  return (
    WEIGHTS.swell * swellTerm +
    WEIGHTS.wind * windTerm +
    WEIGHTS.tide * tideTerm +
    WEIGHTS.morning * morningTerm +
    WEIGHTS.confidence * confidenceTerm +
    WEIGHTS.length * lengthTerm
  )
}

const VERDICT_RANK: Record<Verdict, number> = {
  great: 0,
  caution: 1,
  not_recommended: 2,
  insufficient_data: 3,
}

/**
 * Best window first.
 *
 * A `great` window always outranks a `caution` one regardless of score — the
 * verdict tier is a floor, not a weighting. Ties break on the earlier start so
 * the ordering is total and reproducible.
 */
export function rankWindows(windows: readonly CandidateWindow[]): CandidateWindow[] {
  return [...windows].sort((a, b) => {
    const tier = VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict]
    if (tier !== 0) return tier
    if (a.score !== b.score) return a.score - b.score
    return a.startTimestamp.localeCompare(b.startTimestamp)
  })
}

/** Best window on a given Honolulu-local date, or null when there is none. */
export function bestWindowForDate(
  windows: readonly CandidateWindow[],
  date: string,
): CandidateWindow | null {
  return rankWindows(windows.filter((w) => w.date === date))[0] ?? null
}
