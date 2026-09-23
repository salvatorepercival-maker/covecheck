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
  | 'SRF_DISAGREES_WITH_MODEL'
  | 'MARGINAL_WIND'
  | 'STRONG_GUSTS'
  | 'ONSHORE_WIND'
  | 'LOW_TIDE_OVER_REEF'
  | 'HIGH_TIDE_LESS_SHALLOW'
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
  | 'TIDE_NOT_CALIBRATED'
  | 'TIDE_BAND_PROVISIONAL'
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
  /**
   * Deliberately makes no magnitude claim.
   *
   * This fires across the entire 0 ft to `exposedSwellFt.great` range — 0-3 ft at
   * Cromwell's — so wording it "little swell energy" overclaimed at the top of
   * that band and directly contradicted the swell card, which called the same
   * 2.2 ft reading "Moderate". Both were faithful to their own scale; only the
   * words disagreed. The card keeps its physical description; this states the
   * engine's judgement instead of competing with it.
   *
   * `reasons.test.ts` guards against a magnitude adjective creeping back in.
   */
  LOW_WAVE_ENERGY: {
    severity: 'positive',
    text: 'Swell energy is within this beach\'s calm range',
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
   * `caveat`, not `negative`, and that distinction is the whole point.
   *
   * The Weather Service forecasts one figure for an entire shore; the model
   * figure is filtered to the swell directions this specific cove is open to. They
   * can legitimately disagree, and when they do the honest response is to say so
   * and be less certain — NOT to let the shore-wide number override the
   * beach-specific one.
   *
   * This previously carried `negative` severity and its own thresholds, which made
   * it an independent veto: it capped all 91 hours of a week at "caution" while the
   * model said the cove was calm. That was a stronger role than "cross-check" ever
   * meant, and it produced the same wall twice as NWS's seasonal band drifted up.
   * See DECISIONS.md #15.
   */
  SRF_DISAGREES_WITH_MODEL: {
    severity: 'caveat',
    text: 'The National Weather Service forecasts more surf for this shore than the swell reaching this cove suggests — worth a look at the water',
  },
  /**
   * `caveat`, and that is the whole of what this code does.
   *
   * Wind between this beach's `great` ceiling and its `caution` ceiling used to
   * emit no reason at all, so the hour resolved to `great` and the reason list
   * carried no wind line — a parent read an offshore 30 mph hour with 39 mph
   * gusts and was told nothing about the wind. This says the number out loud and
   * caps confidence at `medium`; it deliberately does NOT move the verdict, so
   * such an hour still reads `Great window`.
   *
   * That restraint is a choice, not a claim that the band is fine. Whether
   * exceeding the `great` ceiling should cap the verdict is a live calibration
   * question — the ceilings rest on a single in-water observation
   * (`lib/beach/cromwells.ts`), and this project has twice been burned by
   * blanket tightening on thin evidence (DECISIONS.md #15). Fixing the silence
   * is separable from re-opening that line, and only the silence is fixed here.
   */
  MARGINAL_WIND: {
    severity: 'caveat',
    text: 'Wind is above the range this beach reads as calm, though below the level CoveCheck treats as too gusty',
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
    text: 'Low water over a shallow reef — rock and reef start to be exposed',
  },
  /**
   * The high end of the tide is a negative here too, which a "more water is
   * better" scale gets backwards. At a reef-entry cove a high tide can mean
   * stronger current and less shallow standing area for children.
   */
  HIGH_TIDE_LESS_SHALLOW: {
    severity: 'negative',
    text: 'Higher tide — stronger current and less shallow standing area for children',
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

  /**
   * `caveat`, not `negative`: unlike wind, tide is one factor among several and
   * the swell/wind picture is still fully assessable without it. It lowers
   * confidence and is shown to the user, but does not cap the verdict.
   */
  TIDE_NOT_CALIBRATED: {
    severity: 'caveat',
    text: 'The favourable tide range for this beach is not yet set, so tide is not counted in this verdict',
  },

  /**
   * `caveat`: the band now gates the verdict, so this does not change the outcome
   * — but it must always be shown, so a one-observation estimate is never mistaken
   * for a calibrated threshold. Caveats sort ahead of positives in `mergeReasons`,
   * which is what keeps this visible in the verdict bullets on an otherwise
   * all-positive day.
   */
  TIDE_BAND_PROVISIONAL: {
    severity: 'caveat',
    text: 'The favourable tide range here is provisional — a starting estimate from a single session, not a settled calibration',
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
