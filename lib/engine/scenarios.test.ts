import { describe, expect, it } from 'vitest'
import { CROMWELLS } from '../beach/cromwells'
import { evaluateForecast, srfBoundFor } from './index'
import type { ReasonCode } from './reasons'
import {
  BORDERLINE_SOUTH_SWELL,
  CROMWELLS_FULLY_CALIBRATED,
  EXCELLENT_CALM_MORNING,
  FAVORABLE_TIDE_EXCESSIVE_SWELL,
  HIGH_SURF_ADVISORY_DAY,
  STALE_MARINE_DATA,
  STRONG_OFFSHORE_WIND,
  WIND_BUILDS_THROUGH_DAY,
} from './fixtures'
import type { HourlyBeachConditions, SurfZoneForecast } from '../types'

const NOW = new Date('2026-08-02T18:00:00.000Z') // 08:00 HST

const evaluate = (hours: readonly HourlyBeachConditions[], profile = CROMWELLS) =>
  evaluateForecast({ profile, hours, nowUtc: NOW })

/** Evaluation with every calibration gap resolved, so tide gates too. */
const evaluateCalibrated = (hours: readonly HourlyBeachConditions[]) =>
  evaluate(hours, CROMWELLS_FULLY_CALIBRATED)

const codesAt = (hours: readonly { reasons: { code: ReasonCode }[] }[], index: number) =>
  hours[index].reasons.map((r) => r.code)

describe('scenario 1 — excellent calm morning', () => {
  it('is great on the real profile, with the provisional tide band flagged', () => {
    const result = evaluate(EXCELLENT_CALM_MORNING)

    // The fixture's 1.2 ft sits inside the provisional 0-1.5 ft band, so tide
    // contributes rather than being skipped — but the thin basis is stated and
    // confidence is held at medium.
    expect(result.hours.every((h) => h.verdict === 'great')).toBe(true)
    const codes = codesAt(result.hours, 0)
    expect(codes).toContain('TIDE_BAND_PROVISIONAL')
    expect(codes).toContain('FAVORABLE_TIDE')
    expect(codes).toContain('LOW_WAVE_ENERGY')
    expect(result.hours[0].confidence).toBe('medium')
  })

  it('reaches high confidence once the tide band is set', () => {
    const result = evaluateCalibrated(EXCELLENT_CALM_MORNING)

    expect(result.hours.every((h) => h.verdict === 'great')).toBe(true)
    expect(result.bestWindow?.verdict).toBe('great')
    expect(result.bestWindow?.lengthHours).toBe(7)
    expect(result.days[0].verdict).toBe('great')
    expect(result.days[0].label).toBe('Great window')
    expect(result.hours[0].confidence).toBe('high')
  })

  it('reports the positive reasons that justify the verdict', () => {
    const result = evaluateCalibrated(EXCELLENT_CALM_MORNING)
    const codes = codesAt(result.hours, 0)
    expect(codes).toContain('CALM_WIND')
    expect(codes).toContain('LOW_WAVE_ENERGY')
    expect(codes).toContain('FAVORABLE_TIDE')
    expect(codes).toContain('FAVORABLE_WIND_DIRECTION')
  })

  it('never rates an hour great without an explanation attached', () => {
    const result = evaluateCalibrated(EXCELLENT_CALM_MORNING)
    for (const hour of result.hours) {
      expect(hour.reasons.length).toBeGreaterThan(0)
    }
  })
})

describe('scenario 2 — borderline south swell', () => {
  const result = evaluateCalibrated(BORDERLINE_SOUTH_SWELL)

  it('is caution, not great, even with calibration resolved', () => {
    expect(result.hours.every((h) => h.verdict === 'caution')).toBe(true)
  })

  it('names the marginal swell and its direction', () => {
    const codes = codesAt(result.hours, 0)
    expect(codes).toContain('MARGINAL_SWELL')
    expect(codes).toContain('DIRECT_SOUTH_SWELL')
  })

  it('attaches the measured swell direction as detail', () => {
    const directional = result.hours[0].reasons.find((r) => r.code === 'DIRECT_SOUTH_SWELL')
    expect(directional?.detail).toMatch(/182°/)
  })
})

describe('scenario 3 — High Surf Advisory', () => {
  const result = evaluateCalibrated(HIGH_SURF_ADVISORY_DAY)

  it('is not recommended despite otherwise ideal conditions', () => {
    expect(result.hours.every((h) => h.verdict === 'not_recommended')).toBe(true)
    expect(result.days[0].verdict).toBe('not_recommended')
  })

  it('names the advisory', () => {
    const hazard = result.hours[0].reasons.find((r) => r.code === 'ACTIVE_BEACH_HAZARD')
    expect(hazard?.detail).toBe('High Surf Advisory')
    expect(hazard?.severity).toBe('blocker')
  })

  it('produces no candidate windows at all', () => {
    // Blocked hours are not eligible for grouping, so there is nothing to rank.
    expect(result.windows).toEqual([])
    expect(result.bestWindow).toBeNull()
  })

  it('overrides the low swell reading rather than averaging with it', () => {
    // The swell was 0.5 ft — favorable. The hazard still wins outright.
    expect(codesAt(result.hours, 0)).toContain('LOW_WAVE_ENERGY')
    expect(result.hours[0].verdict).toBe('not_recommended')
  })
})

describe('scenario 4 — calm weather but stale marine data', () => {
  const result = evaluateCalibrated(STALE_MARINE_DATA)

  it('reports not enough confidence rather than a green verdict', () => {
    expect(result.hours.every((h) => h.verdict === 'insufficient_data')).toBe(true)
    expect(result.days[0].label).toBe('Not enough confidence')
  })

  it('gives low confidence', () => {
    expect(result.hours.every((h) => h.confidence === 'low')).toBe(true)
  })

  it('names staleness as the cause', () => {
    const stale = result.hours[0].reasons.find((r) => r.code === 'STALE_DATA')
    expect(stale?.detail).toMatch(/older than 2 hours/)
  })

  it('produces no windows, since stale hours are not eligible', () => {
    expect(result.windows).toEqual([])
  })
})

describe('scenario 5 — good early window, then strengthening wind', () => {
  const result = evaluateCalibrated(WIND_BUILDS_THROUGH_DAY)

  it('rates the calm early hours great and the windy later ones caution', () => {
    const at = (hour: number) =>
      result.hours.find((h) => h.timestamp.endsWith(`T${String(hour).padStart(2, '0')}:00`))
    expect(at(6)?.verdict).toBe('great')
    expect(at(7)?.verdict).toBe('great')
    expect(at(15)?.verdict).toBe('caution')
    expect(at(16)?.verdict).toBe('caution')
  })

  it('splits into separate windows rather than one blended stretch', () => {
    // A great run and a caution run must not merge, or the recommendation would
    // straddle both and mean neither.
    const verdicts = result.windows.map((w) => w.verdict)
    expect(verdicts).toContain('great')
    expect(verdicts).toContain('caution')
  })

  it('picks the early window as best', () => {
    expect(result.bestWindow?.verdict).toBe('great')
    expect(result.bestWindow?.startTimestamp).toBe('2026-08-02T06:00')
  })

  it('names strong gusts in the later window', () => {
    const later = result.windows.find((w) => w.verdict === 'caution')
    expect(later?.reasons.map((r) => r.code)).toContain('STRONG_GUSTS')
  })
})

describe('scenario 6 — strong wind despite small waves', () => {
  const result = evaluateCalibrated(STRONG_OFFSHORE_WIND)

  it('is caution on wind alone, with the swell still favorable', () => {
    expect(result.hours.every((h) => h.verdict === 'caution')).toBe(true)
    const codes = codesAt(result.hours, 0)
    expect(codes).toContain('STRONG_GUSTS')
    expect(codes).toContain('LOW_WAVE_ENERGY')
  })

  it('does not let a favorable wind direction rescue the verdict', () => {
    // Wind is offshore (350°), which is a positive, but 28 mph is still 28 mph.
    expect(codesAt(result.hours, 0)).toContain('FAVORABLE_WIND_DIRECTION')
    expect(result.hours[0].verdict).toBe('caution')
  })
})

describe('scenario 7 — favorable tide but excessive swell', () => {
  const result = evaluateCalibrated(FAVORABLE_TIDE_EXCESSIVE_SWELL)

  it('is not recommended; the tide does not offset the swell', () => {
    expect(result.hours.every((h) => h.verdict === 'not_recommended')).toBe(true)
    const codes = codesAt(result.hours, 0)
    expect(codes).toContain('EXCESSIVE_SWELL')
    expect(codes).toContain('FAVORABLE_TIDE')
  })

  it('quantifies the swell in the reason detail', () => {
    const excessive = result.hours[0].reasons.find((r) => r.code === 'EXCESSIVE_SWELL')
    expect(excessive?.detail).toMatch(/5\.5 ft/)
  })
})

describe('NWS surf-face bound', () => {
  const forecast = (maxFt: number): SurfZoneForecast => ({
    island: 'Oahu',
    issuedUtc: '2026-08-03T01:55:00.000Z',
    bands: [
      { shore: 'south', column: 'Monday AM', minFt: 1, maxFt },
      // An east-facing band far above threshold must be ignored entirely.
      { shore: 'east', column: 'Monday AM', minFt: 5, maxFt: 12 },
    ],
  })

  it('reads only the beach’s own shore aspect', () => {
    expect(srfBoundFor(forecast(3), 'south')).toBe(3)
    expect(srfBoundFor(forecast(3), 'east')).toBe(12)
    expect(srfBoundFor(null, 'south')).toBeNull()
  })

  it('blocks only at the advisory-adjacent extreme', () => {
    const result = evaluateForecast({
      profile: CROMWELLS_FULLY_CALIBRATED,
      hours: EXCELLENT_CALM_MORNING,
      surfZoneForecast: forecast(6),
      nowUtc: NOW,
    })

    // 6 ft is the one case where no local sheltering argument should survive.
    expect(result.hours.every((h) => h.verdict === 'not_recommended')).toBe(true)
    expect(codesAt(result.hours, 0)).toContain('SRF_EXCEEDS_THRESHOLD')
  })

  /**
   * The structural fix, and the regression that bit twice.
   *
   * A shore-wide surf forecast must not veto the beach-specific number. Chasing
   * the ceiling produced the same wall two ways: 2 ft could never pass NWS's
   * narrowest calm band (1-3 ft), then 3 ft could never pass its very common
   * summer band (2-4 ft). Both capped all 91 hours of a week while the model said
   * the cove was calm.
   */
  it('flags a disagreement without forcing caution', () => {
    const result = evaluateForecast({
      profile: CROMWELLS_FULLY_CALIBRATED,
      hours: EXCELLENT_CALM_MORNING,
      surfZoneForecast: forecast(4),
      nowUtc: NOW,
    })

    // Model says the cove is calm; the shore forecast is elevated. Reported and
    // costed in confidence — not overridden.
    expect(result.hours.every((h) => h.verdict === 'great')).toBe(true)
    const codes = codesAt(result.hours, 0)
    expect(codes).toContain('SRF_DISAGREES_WITH_MODEL')
    expect(codes).toContain('LOW_WAVE_ENERGY')
    expect(result.hours[0].confidence).not.toBe('high')
  })

  it('cannot cap a week on ordinary seasonal band drift', () => {
    // 2-4 and 3-5 are unremarkable summer south-shore bands. Neither may wall off
    // the whole forecast while the cove itself reads calm.
    for (const maxFt of [3, 4, 5]) {
      const result = evaluateForecast({
        profile: CROMWELLS_FULLY_CALIBRATED,
        hours: EXCELLENT_CALM_MORNING,
        surfZoneForecast: forecast(maxFt),
        nowUtc: NOW,
      })
      expect(
        result.hours.filter((h) => h.verdict === 'great').length,
        `a ${maxFt} ft band capped every hour`,
      ).toBeGreaterThan(0)
    }
  })

  it('stays quiet when both agree the shore is calm', () => {
    const result = evaluateForecast({
      profile: CROMWELLS_FULLY_CALIBRATED,
      hours: EXCELLENT_CALM_MORNING,
      surfZoneForecast: forecast(3),
      nowUtc: NOW,
    })
    expect(result.hours.every((h) => h.verdict === 'great')).toBe(true)
    expect(codesAt(result.hours, 0)).not.toContain('SRF_DISAGREES_WITH_MODEL')
  })

  it('does not raise a disagreement when the model is already elevated', () => {
    // Both point the same way, so the model gates on its own and the cross-check
    // has nothing to add. No double-counting of one physical situation.
    const result = evaluateForecast({
      profile: CROMWELLS_FULLY_CALIBRATED,
      hours: BORDERLINE_SOUTH_SWELL,
      surfZoneForecast: forecast(4),
      nowUtc: NOW,
    })
    const codes = codesAt(result.hours, 0)
    expect(codes).toContain('MARGINAL_SWELL')
    expect(codes).not.toContain('SRF_DISAGREES_WITH_MODEL')
  })

  it('allows great when the band agrees the shore is small', () => {
    const result = evaluateForecast({
      profile: CROMWELLS_FULLY_CALIBRATED,
      hours: EXCELLENT_CALM_MORNING,
      surfZoneForecast: forecast(2),
      nowUtc: NOW,
    })
    expect(result.hours.every((h) => h.verdict === 'great')).toBe(true)
    expect(result.warnings.some((w) => /no NWS surf-face bound/.test(w))).toBe(false)
  })

  it('warns when no bound is available', () => {
    const result = evaluateCalibrated(EXCELLENT_CALM_MORNING)
    expect(result.warnings.some((w) => /no NWS surf-face bound/.test(w))).toBe(true)
  })
})

describe('evaluation provenance', () => {
  it('records the engine and beach config versions on every verdict', () => {
    const result = evaluate(EXCELLENT_CALM_MORNING)
    expect(result.engineVersion).toMatch(/^\d{4}-\d{2}-\d{2}/)
    expect(result.configVersion).toBe(CROMWELLS.configVersion)
    expect(result.hours.every((h) => h.configVersion === CROMWELLS.configVersion)).toBe(true)
  })

  it('identifies the current hour from the injected clock', () => {
    // NOW is 08:00 HST.
    const result = evaluate(EXCELLENT_CALM_MORNING)
    expect(result.current?.timestamp).toBe('2026-08-02T08:00')
  })

  it('is deterministic — identical inputs produce identical output', () => {
    const a = evaluate(EXCELLENT_CALM_MORNING)
    const b = evaluate(EXCELLENT_CALM_MORNING)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('handles an empty forecast without throwing', () => {
    const result = evaluate([])
    expect(result.hours).toEqual([])
    expect(result.days).toEqual([])
    expect(result.bestWindow).toBeNull()
    expect(result.current).toBeNull()
    expect(result.warnings).toContain('no hours to evaluate')
  })
})
