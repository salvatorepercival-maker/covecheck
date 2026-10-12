import { describe, expect, it } from 'vitest'
import { DEFAULT_LENSES, LENS_ORDER } from './defaults'
import { bestRun, evaluateDay, evaluateHour, settingsSummary, tagFactor, withOverrides } from './evaluate'
import { calmDay, dayOf, hourFacts } from './test-facts'

const snorkel = DEFAULT_LENSES.snorkel
const surf = DEFAULT_LENSES.surf

describe('factor tags', () => {
  it('dive judges swell energy: its height ceilings converted at 10 s (40 / 90)', () => {
    const dive = DEFAULT_LENSES.dive
    const at = (ft: number, s: number) => hourFacts({ swellFt: ft, swellEnergy: ft * ft * s, swellPeriodSec: s })
    expect(tagFactor('waves', dive.factors.waves, at(2, 10))).toBe('good')
    expect(tagFactor('waves', dive.factors.waves, at(2.5, 10))).toBe('mixed')
    expect(tagFactor('waves', dive.factors.waves, at(3.5, 10))).toBe('poor')
  })

  it('snorkel is tide-first: much more swell passes at low tide, less as it rises (DECISIONS #24)', () => {
    const at = (energy: number, tideFt: number) => hourFacts({ swellFt: Math.sqrt(energy / 10), swellEnergy: energy, tideFt })
    // 4.5 ft at 10 s (≈ 200): good at low tide, poor once the tide is up.
    expect(tagFactor('waves', snorkel.factors.waves, at(200, 0.3))).toBe('good')
    expect(tagFactor('waves', snorkel.factors.waves, at(200, 1.0))).toBe('mixed')
    expect(tagFactor('waves', snorkel.factors.waves, at(200, 1.6))).toBe('poor')
    // Over the reef at any tide.
    expect(tagFactor('waves', snorkel.factors.waves, at(500, 0.0))).toBe('poor')
    // No tide reading: judged as if risen.
    expect(tagFactor('waves', snorkel.factors.waves, at(120, null as unknown as number))).toBe('mixed')
  })

  it('tide-first: the NWS figure is only a high ceiling, for its own hours', () => {
    const h = (nws: number | null) => hourFacts({ swellFt: 3, swellEnergy: 90, tideFt: 0.3, nwsSurfMaxFt: nws })
    expect(tagFactor('waves', snorkel.factors.waves, h(7))).toBe('good')
    expect(tagFactor('waves', snorkel.factors.waves, h(8))).toBe('poor')
    expect(tagFactor('waves', snorkel.factors.waves, h(null))).toBe('good')
  })

  it('period matters: the same height is judged harder as a long-period groundswell', () => {
    const dive = DEFAULT_LENSES.dive
    const at = (ft: number, s: number) => hourFacts({ swellFt: ft, swellEnergy: ft * ft * s, swellPeriodSec: s })
    expect(tagFactor('waves', dive.factors.waves, at(2, 9))).toBe('good')
    expect(tagFactor('waves', dive.factors.waves, at(2, 16))).toBe('mixed')
    expect(tagFactor('waves', dive.factors.waves, at(2.5, 9))).toBe('mixed')
    expect(tagFactor('waves', dive.factors.waves, at(2.5, 16))).toBe('poor')
  })

  it('chop is its own factor', () => {
    expect(tagFactor('chop', snorkel.factors.chop, hourFacts({ chopFt: 0.5 }))).toBe('good')
    expect(tagFactor('chop', snorkel.factors.chop, hourFacts({ chopFt: 1.5 }))).toBe('mixed')
    expect(tagFactor('chop', snorkel.factors.chop, hourFacts({ chopFt: 2.5 }))).toBe('poor')
  })

  it('extreme NWS surf makes calm-water lenses poor, but not surf', () => {
    const h = hourFacts({ swellFt: 1, swellEnergy: 10, nwsSurfMaxFt: 7 })
    expect(tagFactor('waves', DEFAULT_LENSES.dive.factors.waves, h)).toBe('poor')
    expect(tagFactor('waves', surf.factors.waves, hourFacts({ swellFt: 3, swellEnergy: 90, nwsSurfMaxFt: 7 }))).toBe('good')
  })

  it('a fresh buoy that contradicts an extreme NWS figure lifts the automatic Poor', () => {
    const dive = DEFAULT_LENSES.dive
    const h = hourFacts({ swellFt: 2, swellEnergy: 40, nwsSurfMaxFt: 7, nwsContradictedByBuoy: true })
    expect(tagFactor('waves', dive.factors.waves, h)).toBe('good')
    expect(tagFactor('waves', dive.factors.waves, { ...h, nwsContradictedByBuoy: false })).toBe('poor')
  })

  it('surf wants swell inside a range', () => {
    expect(tagFactor('waves', surf.factors.waves, hourFacts({ swellFt: 0.5, swellEnergy: 2.5 }))).toBe('poor')
    expect(tagFactor('waves', surf.factors.waves, hourFacts({ swellFt: 1.5, swellEnergy: 22.5 }))).toBe('mixed')
    expect(tagFactor('waves', surf.factors.waves, hourFacts({ swellFt: 4, swellEnergy: 160 }))).toBe('good')
  })

  it('wind is judged by three classes: offshore, cross-shore, onshore', () => {
    const w = snorkel.factors.wind
    expect(tagFactor('wind', w, hourFacts({ windMph: 10, gustMph: 14, windClass: 'offshore' }))).toBe('good')
    expect(tagFactor('wind', w, hourFacts({ windMph: 10, gustMph: 14, windClass: 'cross' }))).toBe('good')
    expect(tagFactor('wind', w, hourFacts({ windMph: 10, gustMph: 11, windClass: 'onshore' }))).toBe('mixed')
    expect(tagFactor('wind', w, hourFacts({ windMph: 20, gustMph: 22, windClass: 'cross' }))).toBe('poor')
    expect(tagFactor('wind', w, hourFacts({ windMph: 14, gustMph: 15, windClass: 'onshore' }))).toBe('poor')
  })

  it('gusts can make the wind worse on their own', () => {
    expect(tagFactor('wind', snorkel.factors.wind, hourFacts({ windMph: 6, gustMph: 20, windClass: 'onshore' }))).toBe('poor')
  })

  it('offshore is never looser than cross-shore for in-water lenses, even when overridden', () => {
    const loose = withOverrides(snorkel, {
      wind: { ...(snorkel.factors.wind as Extract<typeof snorkel.factors.wind, { kind: 'wind' }>), offshore: { good: 30, mixed: 40 } },
    })
    expect(tagFactor('wind', loose.factors.wind, hourFacts({ windMph: 20, gustMph: 21, windClass: 'offshore' }))).toBe('poor')
  })

  it('default wind tables match Sal\'s 2026-10-11 settings', () => {
    for (const id of ['snorkel', 'dive'] as const) {
      const w = DEFAULT_LENSES[id].factors.wind
      if (w.kind !== 'wind') throw new Error('wind rule')
      expect([w.offshore, w.cross, w.onshore]).toEqual([{ good: 12, mixed: 18 }, { good: 12, mixed: 18 }, { good: 8, mixed: 12 }])
      expect([w.gustOffshore, w.gustCross, w.gustOnshore]).toEqual([{ good: 18, mixed: 25 }, { good: 18, mixed: 25 }, { good: 12, mixed: 18 }])
    }
    const b = DEFAULT_LENSES.beach.factors.wind
    if (b.kind !== 'wind') throw new Error('wind rule')
    expect([b.offshore, b.cross, b.onshore]).toEqual([{ good: 15, mixed: 22 }, { good: 18, mixed: 25 }, { good: 15, mixed: 25 }])
    for (const id of ['snorkel', 'dive', 'beach'] as const) {
      const w = DEFAULT_LENSES[id].factors.wind
      if (w.kind !== 'wind') throw new Error('wind rule')
      expect(w.offshoreNoLooserThanCross).toBe(true)
      expect(w.offshore.good).toBeLessThanOrEqual(w.cross.good)
      expect(w.gustOffshore.good).toBeLessThanOrEqual(w.gustCross.good)
    }
  })

  it('UV is never poor in any lens; beach is mixed above 7', () => {
    for (const id of LENS_ORDER) {
      for (const uv of [3, 9, 12, 15]) expect(tagFactor('uv', DEFAULT_LENSES[id].factors.uv, hourFacts({ uv }))).not.toBe('poor')
    }
    expect(tagFactor('uv', DEFAULT_LENSES.beach.factors.uv, hourFacts({ uv: 7 }))).toBe('good')
    expect(tagFactor('uv', DEFAULT_LENSES.beach.factors.uv, hourFacts({ uv: 8 }))).toBe('mixed')
  })

  it('water temp is off for dive', () => {
    expect(tagFactor('waterTemp', DEFAULT_LENSES.dive.factors.waterTemp, hourFacts({ seaF: 70 }))).toBe('off')
    expect(tagFactor('waterTemp', snorkel.factors.waterTemp, hourFacts({ seaF: 70 }))).toBe('mixed')
  })

  it('NWS advisories and warnings split: surf advisory mixed, warning poor; others poor', () => {
    const advisory = hourFacts({ nwsHazards: [{ event: 'High Surf Advisory', blocking: true, level: 'advisory' }] })
    const warning = hourFacts({ nwsHazards: [{ event: 'High Surf Warning', blocking: true, level: 'warning' }] })
    expect(tagFactor('advisories', surf.factors.advisories, advisory)).toBe('mixed')
    expect(tagFactor('advisories', surf.factors.advisories, warning)).toBe('poor')
    for (const id of ['snorkel', 'dive', 'beach'] as const) {
      expect(tagFactor('advisories', DEFAULT_LENSES[id].factors.advisories, advisory)).toBe('poor')
      expect(tagFactor('advisories', DEFAULT_LENSES[id].factors.advisories, warning)).toBe('poor')
    }
  })

  it('thunderstorms are poor in every lens, from NWS or the model fallback, and unknown without either', () => {
    for (const id of LENS_ORDER) {
      expect(tagFactor('storms', DEFAULT_LENSES[id].factors.storms, hourFacts({ thunder: { expected: true, source: 'nws', coverage: 'chance' } }))).toBe('poor')
      expect(tagFactor('storms', DEFAULT_LENSES[id].factors.storms, hourFacts({ thunder: { expected: true, source: 'model', coverage: null } }))).toBe('poor')
    }
    expect(evaluateHour(snorkel, hourFacts({ thunder: { expected: null, source: null, coverage: null } })).fit).toBe('unknown')
  })

  it('an empty closures list is never read as clear', () => {
    expect(tagFactor('closures', snorkel.factors.closures, hourFacts({ closures: [] }))).toBe('off')
  })

  it('a closure is poor in every lens', () => {
    const closed = hourFacts({ closures: [{ kind: 'shark', title: 'Shark sighting', startsUtc: '', endsUtc: null, source: 'signs' }] })
    for (const id of LENS_ORDER) expect(evaluateHour(DEFAULT_LENSES[id], closed).fit).toBe('poor')
  })

  it('tide mid-change is off by default and only matters when turned on', () => {
    const mid = hourFacts({ tide: { direction: 'rising', rateFtPerHr: 0.3, nextTurn: null, midChange: true } })
    for (const id of LENS_ORDER) expect(tagFactor('tideFlow', DEFAULT_LENSES[id].factors.tideFlow, mid)).toBe('off')
    expect(evaluateHour(snorkel, mid).fit).toBe('good')
    const on = withOverrides(snorkel, { tideFlow: { kind: 'flag', whenPresent: 'mixed' } })
    expect(evaluateHour(on, mid).fit).toBe('mixed')
  })

  it('clarity is tagged but does not affect fit while uncalibrated', () => {
    const murky = hourFacts({ clarity: { ft: 5, confidence: 'low', mainCause: 'swell', inputs: { swellEnergy: 10, windMph: 6, windDirectionDeg: 0, rain48hIn: 0 }, modelVersion: 't' } })
    const result = evaluateHour(snorkel, murky)
    expect(result.tags.clarity).toBe('poor')
    expect(result.fit).toBe('good')
    expect(snorkel.factors.clarity).toMatchObject({ affectsFit: false })
    // Turning it on makes it count.
    const calibrated = withOverrides(snorkel, { clarity: { kind: 'floor', good: 15, mixed: 10, affectsFit: true } })
    expect(evaluateHour(calibrated, murky).fit).toBe('poor')
    expect(settingsSummary(snorkel)).not.toMatch(/clarity/)
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
    expect(evaluateHour(snorkel, hourFacts({ swellFt: 6, swellEnergy: 360, nwsHazardsKnown: false })).fit).toBe('poor')
  })
})

describe('day fit', () => {
  it('finds the best stretch of good hours', () => {
    const day = dayOf([6, 7, 8, 9, 10, 11, 12].map((hour) => ({ hour, windMph: hour < 10 ? 6 : 30, gustMph: hour < 10 ? 8 : 45, windClass: 'offshore' as const })))
    const fit = evaluateDay(snorkel, day)
    expect(fit.fit).toBe('good')
    expect(fit.bestHours).toEqual({ start: 6, end: 9 })
    expect(fit.headline).toBe('Good for snorkeling')
  })

  it('tide-first best hours centre on the lowest daylight tide', () => {
    // Good all day; lowest tide at 14:00.
    const day = dayOf([7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((hour) => ({ hour, swellEnergy: hour === 11 ? 300 : 60, tideFt: Math.abs(hour - 14) * 0.15 + 0.1 })))
    const fit = evaluateDay(snorkel, day)
    expect(fit.bestHours).toEqual({ start: 12, end: 16 })
  })

  it('explains a day with only short good stretches', () => {
    const day = dayOf([8, 9, 10, 11].map((hour) => ({ hour, chopFt: hour % 2 ? 0 : 1.5 })))
    const fit = evaluateDay(snorkel, day)
    expect(fit.fit).toBe('mixed')
    expect(fit.reason).toBe('Some hours fit, but none for 2 hours in a row.')
  })

  it('a lone good hour is not a best stretch', () => {
    expect(bestRun([{ timestamp: 'a', hour: 8, fit: 'good', tags: {} as never }], 2)).toBeNull()
  })

  it('names the problem on a rough day', () => {
    const day = dayOf([8, 9, 10].map((hour) => ({ hour, swellFt: 5, swellEnergy: 375, swellPeriodSec: 15, swellFromDeg: 180 })))
    const fit = evaluateDay(snorkel, day)
    expect(fit.fit).toBe('poor')
    expect(fit.headline).toBe('Rough for snorkeling')
    expect(fit.reason).toMatch(/^A 5 ft swell at 15 s reaches the inside with the tide up at 0.8 ft/)
  })

  it('overrides replace a factor rule', () => {
    const strict = withOverrides(snorkel, { waves: { kind: 'ceiling', good: 2.5, mixed: 5 } })
    expect(evaluateDay(strict, calmDay()).fit).toBe('poor')
    expect(settingsSummary(strict)).toMatch(/swell energy under 2.5 \(≈ 0.5 ft at 10 s\)/)
  })
})

describe('fit language', () => {
  const FORBIDDEN = [/\bsafe\b/i, /\bunsafe\b/i, /\bguarantee/i, /\bdanger/i]
  it('no lens output speaks in safety terms', () => {
    const variants = [
      calmDay(),
      dayOf([8, 9, 10].map((hour) => ({ hour, swellFt: 6, swellEnergy: 540, chopFt: 3, windMph: 30, gustMph: 45, windClass: 'onshore' as const, uv: 12, rainPct: 90, sky: 'storms' as const, jelly: { expected: true, window: null }, nwsHazards: [{ event: 'High Surf Warning', blocking: true, level: 'warning' as const }] }))),
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
