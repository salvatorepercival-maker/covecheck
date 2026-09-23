import { describe, expect, it } from 'vitest'
import {
  ALL_REASON_CODES,
  reason,
  severityOf,
  SHORELINE_REMINDER,
  VERDICT_LABEL,
  type Verdict,
} from './reasons'

/**
 * These tests police the product's safety language.
 *
 * HANDOFF.md forbids claiming a beach is safe, guaranteeing conditions, or
 * asserting an absence of risk. Copy lives in one table specifically so this can
 * be enforced mechanically rather than by review.
 */

/** Phrases that must never appear in user-facing copy. */
const FORBIDDEN = [
  /\bis safe\b/i,
  /\bsafe (?:to|for)\b/i,
  /\bguarantee/i,
  /\bno risk\b/i,
  /\brisk-free\b/i,
  /\bperfectly\b/i,
  /\btotally fine\b/i,
  /\bdefinitely\b/i,
]

const allCopy = [
  ...ALL_REASON_CODES.map((code) => reason(code).text),
  ...Object.values(VERDICT_LABEL),
  SHORELINE_REMINDER,
]

describe('safety language', () => {
  it('never asserts safety, guarantees, or absence of risk', () => {
    for (const text of allCopy) {
      for (const pattern of FORBIDDEN) {
        expect(text, `copy violates the safety language rule: ${JSON.stringify(text)}`).not.toMatch(
          pattern,
        )
      }
    }
  })

  it('uses the approved verdict wording', () => {
    const expected: Record<Verdict, string> = {
      great: 'Great window',
      caution: 'Possible — use caution',
      not_recommended: 'Not recommended',
      insufficient_data: 'Not enough confidence',
    }
    expect(VERDICT_LABEL).toEqual(expected)
  })

  it('reminds the user that the real decision is made at the water', () => {
    expect(SHORELINE_REMINDER).toMatch(/look at the water/i)
    expect(SHORELINE_REMINDER).toMatch(/lifeguard/i)
    expect(SHORELINE_REMINDER).toMatch(/change/i)
  })
})

describe('reason copy', () => {
  it('provides non-empty copy for every code', () => {
    for (const code of ALL_REASON_CODES) {
      const entry = reason(code)
      expect(entry.text.length, `${code} has no copy`).toBeGreaterThan(0)
      expect(entry.code).toBe(code)
    }
  })

  it('is stable, not generated — the same code always yields the same text', () => {
    expect(reason('CALM_WIND').text).toBe(reason('CALM_WIND').text)
  })

  it('attaches optional detail without altering the base copy', () => {
    const plain = reason('CALM_WIND')
    const detailed = reason('CALM_WIND', '6 mph')
    expect(detailed.text).toBe(plain.text)
    expect(detailed.detail).toBe('6 mph')
    expect(plain.detail).toBeUndefined()
  })

  it('never leaks a raw code into user-facing copy', () => {
    for (const code of ALL_REASON_CODES) {
      expect(reason(code).text).not.toContain(code)
      expect(reason(code).text).not.toMatch(/_[A-Z]/)
    }
  })
})

describe('copy cannot contradict the condition cards', () => {
  it('makes no magnitude claim in the wave-energy reason', () => {
    // The bug: LOW_WAVE_ENERGY fires from 0 ft up to the "great" ceiling (3 ft at
    // Cromwell's), so "little swell energy" contradicted the swell card calling
    // the same 2.2 ft reading "Moderate". The engine judges suitability; the card
    // describes the water. Only one of them may use magnitude adjectives.
    const magnitudeWords = /\b(little|small|moderate|large|tiny|huge|big)\b/i
    expect(reason('LOW_WAVE_ENERGY').text).not.toMatch(magnitudeWords)
  })

  it('still says something substantive rather than going vague', () => {
    expect(reason('LOW_WAVE_ENERGY').text).toMatch(/swell/i)
    expect(reason('LOW_WAVE_ENERGY').text.length).toBeGreaterThan(20)
  })
})

describe('reason severities', () => {
  it('classifies hazards and excessive swell as hard blockers', () => {
    expect(severityOf('ACTIVE_BEACH_HAZARD')).toBe('blocker')
    expect(severityOf('EXCESSIVE_SWELL')).toBe('blocker')
    expect(severityOf('SRF_EXCEEDS_THRESHOLD')).toBe('blocker')
  })

  it('classifies data-quality problems as disqualifying, never merely cosmetic', () => {
    expect(severityOf('STALE_DATA')).toBe('disqualifying')
    expect(severityOf('MISSING_CRITICAL_DATA')).toBe('disqualifying')
    expect(severityOf('HAZARD_STATE_UNKNOWN')).toBe('disqualifying')
  })

  it('treats wind in the marginal band as a caveat, which shows it without moving the verdict', () => {
    // Deliberately `caveat` rather than `negative`: PR #19's option B fixes the
    // silence — an hour over the `great` ceiling emitted no wind reason at all —
    // without re-opening where the green/amber line sits on ceilings that rest
    // on one in-water observation. `negative` here would flip those hours to
    // caution, which is a different option and was not the one chosen.
    expect(severityOf('MARGINAL_WIND')).toBe('caveat')
  })

  it('treats uncalibrated wind as preventing a green verdict', () => {
    // Deliberately `negative` rather than `caveat`: an unassessable primary
    // factor must not yield an enthusiastic recommendation. See DECISIONS.md #7.
    expect(severityOf('WIND_NOT_CALIBRATED')).toBe('negative')
  })
})
