import { describe, expect, it } from 'vitest'
import { dayOf } from '../lenses/test-facts'
import { bandOfTide, daylightLows, durationText, mixedTideNote, namedExtremes } from './tide-panel'

// Sunrise 6:27 (387 min), sunset 6:11 PM (1091).
const day = {
  ...dayOf([6, 7].map((hour) => ({ hour }))),
  tideExtremes: [
    { timestamp: '2026-10-12 05:04', heightFt: 2.2, kind: 'high' as const },
    { timestamp: '2026-10-12 11:47', heightFt: 0.5, kind: 'low' as const },
    { timestamp: '2026-10-12 16:52', heightFt: 1.3, kind: 'high' as const },
    { timestamp: '2026-10-12 22:41', heightFt: 0.2, kind: 'low' as const },
  ],
}

describe('tide panel', () => {
  it('names mixed-tide highs and lows and places them against now and daylight', () => {
    const ex = namedExtremes(day, 7 * 60 + 14)
    expect(ex.map((e) => `${e.name}:${e.when}`)).toEqual(['Higher high:earlier', 'Higher low:next', 'Lower high:later', 'Lower low:after dark'])
    expect(ex[1].minutesAway).toBe(273)
    expect(durationText(273)).toBe('4 h 33 m')
  })

  it('reads bands, the week’s daylight lows and the mixed-tide note', () => {
    expect(bandOfTide(1.8, { lowFt: 0.6, highFt: 1.4 })).toBe('High band')
    expect(bandOfTide(0.4, { lowFt: 0.6, highFt: 1.4 })).toBe('Low band')
    expect(daylightLows([day])).toEqual([{ date: '2026-10-12', time: '11:47 AM', heightFt: 0.5 }])
    expect(mixedTideNote(day, true)).toBe('Honolulu has mixed tides: two unequal highs and lows a day. Tonight’s lower low is after dark, so the midday low is the one that counts.')
  })
})
