import { describe, expect, it } from 'vitest'
import { DEFAULT_LENSES } from '../lenses/defaults'
import { dayOf, hourFacts } from '../lenses/test-facts'
import { waveGauge, windGauge, windNote } from './deciding'

describe('deciding cards', () => {
  it('wave gauge uses the tide-first limit at this tide', () => {
    const g = waveGauge(DEFAULT_LENSES.snorkel, hourFacts({ swellEnergy: 58, tideFt: 1.6 }))!
    expect(g.caption).toBe('Energy 58 of 90 limit at this tide')
    expect(g.at).toBeLessThan(g.goodTo)
    const low = waveGauge(DEFAULT_LENSES.snorkel, hourFacts({ swellEnergy: 58, tideFt: 0.2 }))!
    expect(low.caption).toBe('Energy 58 of 250 limit at this tide')
  })

  it('wind gauge uses the limit for the wind’s class', () => {
    expect(windGauge(DEFAULT_LENSES.snorkel, hourFacts({ windMph: 9, windClass: 'cross' }))!.caption).toBe('Good up to 12 mph cross-shore')
    expect(windGauge(DEFAULT_LENSES.snorkel, hourFacts({ windMph: 9, windClass: 'onshore' }))!.caption).toBe('Good up to 8 mph onshore')
  })

  it('wind note says when it builds', () => {
    const day = dayOf([8, 12, 15, 16].map((hour) => ({ hour, windMph: hour < 15 ? 9 : 15 })))
    expect(windNote(day, day.hours[0])).toBe('Builds to 15 after 3 PM')
  })
})
