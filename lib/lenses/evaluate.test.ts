import { describe, expect, it } from 'vitest'
import { DEFAULT_LENSES, LENS_ORDER } from './defaults'
import { bestRun, evaluateDay, evaluateHour, settingsSummary, tagFactor, withOverrides } from './evaluate'
import { calmDay, dayOf, hourFacts } from './test-facts'

const snorkel = DEFAULT_LENSES.snorkel
const surf = DEFAULT_LENSES.surf

describe('factor tags', () => {
  it('snorkel waves use the engine ceilings: 3 good, 4 mixed', () => {
    expect(tagFactor('waves', snorkel.factors.waves, hourFacts({ swellFt: 3 }))).toBe('good')
    expect(tagFactor('waves', snorkel.factors.waves, hourFacts({ swellFt: 3.5 }))).toBe('mixed')
    expect(tagFactor('waves', snorkel.factors.waves, hourFacts({ swellFt: 4.5 }))).toBe('poor')
  })

  it('extreme NWS surf makes calm-water lenses poor, but not surf', () => {
    const h = hourFacts({ swellFt: 1, nwsSurfMaxFt: 7 })
    expect(tagFactor('waves', snorkel.factors.waves, h)).toBe('poor')
    expect(tagFactor('waves', surf.factors.waves, hourFacts({ swellFt: 3, nwsSurfMaxFt: 7 }))).toBe('good')
  })

  it('surf wants swell inside a range', () => {
    expect(tagFactor('waves', surf.factors.waves, hourFacts({ swellFt: 0.5 }))).toBe('poor')
    expect(tagFactor('waves', surf.factors.waves, hourFacts({ swellFt: 1.5 }))).toBe('mixed')
    expect(tagFactor('waves', surf.factors.waves, hourFacts({ swellFt: 4 }))).toBe('good')
  })

  it('wind limits depend on direction, and cross-shore uses onshore limits', () => {
    const w = snorkel.factors.wind
    expect(tagFactor('wind', w, hourFacts({ windMph: 20, gustMph: 24, windExposure: 'offshore' }))).toBe('good')
    expect(tagFactor('wind', w, hourFacts({ windMph: 10, gustMph: 11, windExposure: 'cross' }))).toBe('mixed')
    expect(tagFactor('wind', w, hourFacts({ windMph: 14, gustMph: 15, windExposure: 'onshore' }))).toBe('poor')
  })

  it('gusts can make the wind worse on their own', () => {
    expect(tagFactor('wind', snorkel.factors.wind, hourFacts({ windMph: 6, gustMph: 20, windExposure: 'onshore' }))).toBe('poor')
  })

  it('off factors stay off, missing values are unknown', () => {
    expect(tagFactor('clarity', surf.factors.clarity, hourFacts())).toBe('off')
    expect(tagFactor('uv', snorkel.factors.uv, hourFacts({ uv: null }))).toBe('unknown')
  })

  it('a Health Dept. advisory is poor for every lens', () => {
    const h = hourFacts({ waterQuality: { status: 'advisory', radiusKm: 5, advisories: [{ kind: 'brown_water', type: 'Brown Water Advisory', title: 'x', distanceKm: 1, url: '', postedUtc: null }] } })
    for (const id of LENS_ORDER) expect(evaluateHour(DEFAULT_LENSES[id], h).fit).toBe('poor')
  })
})

describe('hour fit', () => {
  it('worst factor wins', () => {
    expect(evaluateHour(snorkel, hourFacts()).fit).toBe('good')
    expect(evaluateHour(snorkel, hourFacts({ jelly: { expected: true, window: null } })).fit).toBe('mixed')
  })

  it("won't call it on stale data or a missing critical input", () => {
    expect(evaluateHour(snorkel, hourFacts({ dataIssue: 'stale' })).fit).toBe('unknown')
    expect(evaluateHour(snorkel, hourFacts({ nwsHazardsKnown: false })).fit).toBe('unknown')
    expect(evaluateHour(snorkel, hourFacts({ waterQuality: { status: 'unknown' } })).fit).toBe('unknown')
  })

  it('a known poor still stands when other data is missing', () => {
    expect(evaluateHour(snorkel, hourFacts({ swellFt: 6, nwsHazardsKnown: false })).fit).toBe('poor')
  })
})

describe('day fit', () => {
  it('finds the best stretch of good hours', () => {
    const day = dayOf([6, 7, 8, 9, 10, 11, 12].map((hour) => ({ hour, windMph: hour < 10 ? 6 : 30, gustMph: hour < 10 ? 8 : 45, windExposure: 'offshore' as const })))
    const fit = evaluateDay(snorkel, day)
    expect(fit.fit).toBe('good')
    expect(fit.bestHours).toEqual({ start: 6, end: 9 })
    expect(fit.headline).toBe('Good for snorkeling')
  })

  it('a lone good hour is not a best stretch', () => {
    expect(bestRun([{ timestamp: 'a', hour: 8, fit: 'good', tags: {} as never }], 2)).toBeNull()
  })

  it('names the problem on a rough day', () => {
    const day = dayOf([8, 9, 10].map((hour) => ({ hour, swellFt: 5, swellFromDeg: 180 })))
    const fit = evaluateDay(snorkel, day)
    expect(fit.fit).toBe('poor')
    expect(fit.headline).toBe('Rough for snorkeling')
    expect(fit.reason).toMatch(/^A 5 ft south swell/)
  })

  it('overrides replace a factor rule', () => {
    const strict = withOverrides(snorkel, { waves: { kind: 'ceiling', good: 0.5, mixed: 0.8 } })
    expect(evaluateDay(strict, calmDay()).fit).toBe('poor')
    expect(settingsSummary(strict)).toMatch(/waves under 0.5 ft/)
  })
})

describe('fit language', () => {
  const FORBIDDEN = [/\bsafe\b/i, /\bunsafe\b/i, /\bguarantee/i, /\bdanger/i]
  it('no lens output speaks in safety terms', () => {
    const variants = [
      calmDay(),
      dayOf([8, 9, 10].map((hour) => ({ hour, swellFt: 6, windMph: 30, gustMph: 45, windExposure: 'onshore' as const, uv: 12, rainPct: 90, sky: 'storms' as const, jelly: { expected: true, window: null }, nwsHazards: [{ event: 'High Surf Advisory', blocking: true }] }))),
    ]
    for (const id of LENS_ORDER) {
      for (const day of variants) {
        const fit = evaluateDay(DEFAULT_LENSES[id], day)
        for (const text of [fit.headline, fit.reason, settingsSummary(DEFAULT_LENSES[id])]) {
          for (const pattern of FORBIDDEN) expect(text, text).not.toMatch(pattern)
        }
      }
    }
  })
})
