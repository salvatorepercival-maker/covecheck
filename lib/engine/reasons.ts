/**
 * Reason codes and their user-facing copy.
 *
 * Explanations are looked up from this table, never generated. Two consequences
 * that matter: the safety language is auditable in one place, and the same
 * conditions always produce the same words.
 *
 * SAFETY LANGUAGE RULE (HANDOFF.md): CoveCheck never asserts that a beach is
 * safe, never guarantees conditions, and never claims an absence of risk. Copy
 * describes the *forecast*, not the water. `reasons.test.ts` enforces this.
 */

export type Verdict = 'great' | 'caution' | 'not_recommended' | 'insufficient_data'

export type Confidence = 'high' | 'medium' | 'low'

export type ReasonCode =
  // Positive contributions
  | 'CALM_WIND'
  | 'LOW_WAVE_ENERGY'
  | 'FAVORABLE_TIDE'
  | 'FAVORABLE_WIND_DIRECTION'
  // Negative contributions
  | 'DIRECT_SOUTH_SWELL'
  | 'MARGINAL_SWELL'
  | 'SRF_MARGINAL_SURF'
  | 'STRONG_GUSTS'
  | 'ONSHORE_WIND'
  | 'LOW_TIDE_OVER_REEF'
  | 'RECENT_HEAVY_RAIN'
  // Hard blockers
  | 'ACTIVE_BEACH_HAZARD'
  | 'EXCESSIVE_SWELL'
  | 'SRF_EXCEEDS_THRESHOLD'
  // Data-quality
  | 'STALE_DATA'
  | 'MISSING_CRITICAL_DATA'
  | 'HAZARD_STATE_UNKNOWN'
  | 'WIND_NOT_CALIBRATED'
  // Windowing
  | 'INSUFFICIENT_WINDOW'

/**
 * How a reason affects the verdict.
 *
 * `blocker`  — forces `not_recommended`
 * `disqualifying` — forces at least `insufficient_data`; never compatible with green
 * `negative` — prevents `great`, allows `caution`
 * `caveat`   — does not change the verdict, but lowers confidence and must be shown
 * `positive` — supports `great`
 */
export type ReasonSeverity = 'blocker' | 'disqualifying' | 'negative' | 'caveat' | 'positive'

export type Reason = {
  code: ReasonCode
  severity: ReasonSeverity
  /** Stable, pre-written copy. Never model-generated. */
  text: string
  /** Optional measured values, for the expandable technical detail. */
  detail?: string
}

const COPY: Record<ReasonCode, { severity: ReasonSeverity; text: string }> = {
  CALM_WIND: {
    severity: 'positive',
    text: 'Wind is among the lightest in this forecast period',
  },
  LOW_WAVE_ENERGY: {
    severity: 'positive',
    text: 'Little swell energy is reaching this beach',
  },
  FAVORABLE_TIDE: {
    severity: 'positive',
    text: 'Enough water over the reef',
  },
  FAVORABLE_WIND_DIRECTION: {
    severity: 'positive',
    text: 'Wind is blowing offshore, which tends to smooth the surface',
  },

  DIRECT_SOUTH_SWELL: {
    severity: 'negative',
    text: 'Swell is arriving from a direction this beach is open to',
  },
  MARGINAL_SWELL: {
    severity: 'negative',
    text: 'Borderline swell energy for a family outing',
  },
  /**
   * Distinct from `MARGINAL_SWELL` on purpose.
   *
   * The two describe different measurements and can legitimately disagree: the
   * model may show almost no swell arriving from a direction this beach is open
   * to, while the Weather Service still forecasts a borderline surf face for the
   * whole shore. Sharing one code produced the contradiction "borderline swell
   * energy" directly above "little swell energy is reaching this beach".
   */
  SRF_MARGINAL_SURF: {
    severity: 'negative',
    text: 'The National Weather Service surf forecast is borderline for this shore',
  },
  STRONG_GUSTS: {
    severity: 'negative',
    text: 'Gusty wind is forecast',
  },
  ONSHORE_WIND: {
    severity: 'negative',
    text: 'Wind is blowing onshore, which tends to roughen the surface',
  },
  LOW_TIDE_OVER_REEF: {
    severity: 'negative',
    text: 'Low water over a shallow reef',
  },
  RECENT_HEAVY_RAIN: {
    severity: 'negative',
    text: 'Recent heavy rain — runoff can reduce water clarity and quality',
  },

  ACTIVE_BEACH_HAZARD: {
    severity: 'blocker',
    text: 'An official advisory or warning is in effect',
  },
  EXCESSIVE_SWELL: {
    severity: 'blocker',
    text: 'Too much swell energy for calm family water activities',
  },
  SRF_EXCEEDS_THRESHOLD: {
    severity: 'blocker',
    text: 'The National Weather Service surf forecast is above the range this beach is suitable in',
  },

  STALE_DATA: {
    severity: 'disqualifying',
    text: 'The forecast data is older than CoveCheck will rely on',
  },
  MISSING_CRITICAL_DATA: {
    severity: 'disqualifying',
    text: 'Some conditions could not be retrieved',
  },
  HAZARD_STATE_UNKNOWN: {
    severity: 'disqualifying',
    text: 'CoveCheck could not confirm whether any advisories are in effect',
  },
  /**
   * `negative`, not `caveat`, and deliberately so.
   *
   * Wind is a primary determinant of calm water. While the provider cell's wind
   * is uncalibrated against shoreline observation, CoveCheck cannot assess it,
   * and HANDOFF.md is explicit that uncertain data must not produce an
   * enthusiastic green recommendation. So every hour is capped at "use caution"
   * until the gap is resolved.
   *
   * This is the conservative reading, and it makes the calibration gap visibly
   * block the product rather than being papered over by a heuristic. Relative
   * wind position still drives window *ranking*, which is valid because an
   * unknown bias shifts every hour together and preserves the ordering.
   */
  WIND_NOT_CALIBRATED: {
    severity: 'negative',
    text: 'Wind strength at this beach is not yet calibrated, so CoveCheck will not call conditions great',
  },

  INSUFFICIENT_WINDOW: {
    severity: 'negative',
    text: 'No stretch of favorable conditions long enough to recommend',
  },
}

export function reason(code: ReasonCode, detail?: string): Reason {
  const entry = COPY[code]
  return { code, severity: entry.severity, text: entry.text, ...(detail ? { detail } : {}) }
}

/** Verdict headline copy. Deliberately avoids asserting safety. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  great: 'Great window',
  caution: 'Possible — use caution',
  not_recommended: 'Not recommended',
  insufficient_data: 'Not enough confidence',
}

/** Shown alongside every verdict. The final call is always made at the water. */
export const SHORELINE_REMINDER =
  'Conditions can change quickly. Look at the water before going in, and follow lifeguards, posted signs, and closures.'

export const ALL_REASON_CODES = Object.keys(COPY) as ReasonCode[]

export function severityOf(code: ReasonCode): ReasonSeverity {
  return COPY[code].severity
}
