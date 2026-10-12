import { describe, expect, it } from 'vitest'
import { DEFAULT_LENSES, LENS_ORDER } from './defaults'
import { evaluateDay } from './evaluate'
import { heroCopy, lowTideHour } from './hero'
import { dayOf } from './test-facts'

const snorkel = DEFAULT_LENSES.snorkel

describe('hero copy', () => {
  it('says "Go at low tide." when tide-first best hours sit on the low', () => {
    const day = dayOf([8, 9, 10, 11, 12, 13, 14].map((hour) => ({ hour, swellEnergy: 150, tideFt: Math.abs(hour - 11) * 0.3 + 0.1, windMph: 8, windFromDeg: 70 })))
    expect(lowTideHour(day)).toBe(11)
    const copy = heroCopy(snorkel, evaluateDay(snorkel, day), day, true)
    expect(copy.title).toBe('Go at low tide.')
    expect(copy.pill).toBe('Good for snorkeling')
    expect(copy.sentence).toMatch(/^Best \d+ (AM|PM) – \d+ (AM|PM), while the outer reef breaks the swell and the trades stay light\.$/)
  })

  it('names the day on a poor day', () => {
    const day = dayOf([8, 9, 10].map((hour) => ({ hour, swellEnergy: 600, swellFt: 8 })))
    expect(heroCopy(snorkel, evaluateDay(snorkel, day), day, false).title).toBe('Not Monday.')
  })

  it('never speaks about safety', () => {
    const days = [
      dayOf([8, 9, 10].map((hour) => ({ hour }))),
      dayOf([8, 9, 10].map((hour) => ({ hour, swellEnergy: 600, swellFt: 8, windMph: 30, gustMph: 40, windClass: 'onshore' as const }))),
      dayOf([8, 9, 10].map((hour) => ({ hour, dataIssue: 'stale' as const }))),
    ]
    for (const id of LENS_ORDER)
      for (const d of days) {
        const c = heroCopy(DEFAULT_LENSES[id], evaluateDay(DEFAULT_LENSES[id], d), d, true)
        for (const t of [c.title, c.pill, c.sentence]) expect(t).not.toMatch(/\b(safe|unsafe|danger|guarantee)/i)
      }
  })
})
