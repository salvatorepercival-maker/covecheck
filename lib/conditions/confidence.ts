/**
 * Forecast confidence, computed — never a fixed label.
 *
 * Starts high and steps down for each thing that makes the forecast less
 * trustworthy: stale or missing data, the Weather Service disagreeing with the
 * cove-filtered model, the buoy disagreeing with the model, and lead time.
 * Every step down carries its reason so the chip can say why.
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type Confidence = { level: ConfidenceLevel; reasons: string[] }

const ORDER: ConfidenceLevel[] = ['high', 'medium', 'low']
const lower = (a: ConfidenceLevel, b: ConfidenceLevel) => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b)

export type ConfidenceInputs = {
  dataIssue: 'stale' | 'missing' | null
  /** The engine's SRF_DISAGREES_WITH_MODEL for this hour. */
  nwsDisagrees: boolean
  /** No NWS surf forecast covers this hour. */
  nwsMissing: boolean
  /** The buoy contradicts an extreme NWS figure (DECISIONS #23). */
  nwsContradictedByBuoy?: boolean
  /** Buoy vs model divergence %, when comparable and this hour is within its reach. */
  buoyDivergencePct: number | null
  /** Whole days between today and this hour's date. */
  daysAhead: number
  /** Inputs a fit depends on that couldn't be checked (advisories, water quality). */
  uncheckedSources: string[]
}

export function confidenceFor(i: ConfidenceInputs): Confidence {
  let level: ConfidenceLevel = 'high'
  const reasons: string[] = []
  const step = (to: ConfidenceLevel, why: string) => {
    level = lower(level, to)
    reasons.push(why)
  }
  if (i.dataIssue === 'stale') step('low', 'forecast data is stale')
  if (i.dataIssue === 'missing') step('low', 'some forecast data is missing')
  if (i.uncheckedSources.length) step('medium', `couldn't check ${i.uncheckedSources.join(' or ')}`)
  if (i.nwsDisagrees) step('medium', 'the Weather Service forecasts more surf than the model')
  if (i.nwsMissing) step('medium', 'no Weather Service surf forecast covers this day')
  if (i.nwsContradictedByBuoy) step('medium', 'the buoy contradicts the Weather Service surf forecast')
  if (i.buoyDivergencePct !== null) {
    const off = Math.abs(i.buoyDivergencePct)
    if (off >= 60) step('low', `the buoy reads ${off}% ${i.buoyDivergencePct > 0 ? 'above' : 'below'} the model`)
    else if (off >= 30) step('medium', `the buoy reads ${off}% ${i.buoyDivergencePct > 0 ? 'above' : 'below'} the model`)
  }
  if (i.daysAhead >= 6) step('low', 'six or more days out')
  else if (i.daysAhead >= 3) step('medium', 'three or more days out')
  return { level, reasons }
}

export const CONFIDENCE_WORDS: Record<ConfidenceLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
}
