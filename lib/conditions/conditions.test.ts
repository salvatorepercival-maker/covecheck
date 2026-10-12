import { describe, expect, it } from 'vitest'
import { calmDay, dayOf } from '../lenses/test-facts'
import { estimateClarity } from './clarity'
import { conditionTiles, dayHeadline, uvPeakWindow, weekSummary } from './describe'
import { fullMoonsBetween, jellyOutlook, jellyWindowsFrom } from './jellyfish'
import { dominantSky, skyOf } from './sky'

describe('box jellyfish calendar', () => {
  it('lands within a day of known full moons', () => {
    // Full moons 2026-09-26 16:49 UTC and 2026-10-26 04:12 UTC.
    const moons = fullMoonsBetween(Date.UTC(2026, 8, 20), Date.UTC(2026, 10, 1))
    expect(moons).toHaveLength(2)
    expect(Math.abs(moons[0] - Date.UTC(2026, 8, 26, 16, 49))).toBeLessThan(1.5 * 86_400_000)
    expect(Math.abs(moons[1] - Date.UTC(2026, 9, 26, 4, 12))).toBeLessThan(1.5 * 86_400_000)
  })

  it('expects jellyfish 8-10 days after the full moon, Hawaiʻi time', () => {
    const [next] = jellyWindowsFrom('2026-10-12', 1)
    // Oct 26 04:12 UTC is Oct 25 in Hawaiʻi; +8..10 days.
    expect(next).toEqual({ start: '2026-11-02', end: '2026-11-04' })
    expect(jellyOutlook('2026-11-03').expected).toBe(true)
    expect(jellyOutlook('2026-11-06').expected).toBe(false)
  })
})

describe('clarity estimate', () => {
  it('is clear on a flat still dry day and drops with swell', () => {
    const calm = estimateClarity({ swellEnergy: 1, windMph: 5, windDirectionDeg: 20, rain48hIn: 0 }, 'south')
    const rough = estimateClarity({ swellEnergy: 122.5, windMph: 13, windDirectionDeg: 90, rain48hIn: 0 }, 'south')
    expect(calm?.ft).toBe(40)
    expect(rough!.ft).toBeLessThan(25)
    expect(rough?.mainCause).toBe('swell')
    expect(rough?.confidence).toBe('low')
  })

  it('is driven by swell energy, so a long-period swell clouds the water more', () => {
    const short = estimateClarity({ swellEnergy: 3 * 3 * 7, windMph: 5, windDirectionDeg: 20, rain48hIn: 0 }, 'south')
    const long = estimateClarity({ swellEnergy: 3 * 3 * 16, windMph: 5, windDirectionDeg: 20, rain48hIn: 0 }, 'south')
    expect(long!.ft).toBeLessThan(short!.ft)
  })

  it('has no estimate without swell data', () => {
    expect(estimateClarity({ swellEnergy: null, windMph: 5, windDirectionDeg: 0, rain48hIn: 0 }, 'south')).toBeNull()
  })
})

describe('sky', () => {
  it('maps WMO codes and prefers wet kinds when a third of hours are wet', () => {
    expect(skyOf(95)).toBe('storms')
    expect(skyOf(1)).toBe('mostly_sunny')
    expect(dominantSky(['clear', 'clear', 'showers', 'clear', 'showers', 'clear'])).toBe('showers')
    expect(dominantSky(['clear', 'clear', 'mostly_sunny', 'clear'])).toBe('clear')
  })
})

describe('neutral description', () => {
  it('describes the day in plain words', () => {
    const day = dayOf([8, 9, 10].map((hour) => ({ hour, swellFt: 3.5, swellEnergy: 184, swellPeriodSec: 15, swellFromDeg: 180, windMph: 13, windFromDeg: 80, sky: 'mostly_sunny' as const })))
    expect(dayHeadline(day)).toBe('Big south swell, breezy trades, mostly sunny.')
  })

  it('has eleven tiles and never judges in the neutral view', () => {
    const day = calmDay()
    const tiles = conditionTiles(day, day.hours[3], 'south')
    expect(tiles).toHaveLength(11)
    for (const t of tiles) expect(`${t.value} ${t.detail}`).not.toMatch(/\b(good|poor|safe)\b/i)
  })

  it('finds the UV peak window and summarises the week row', () => {
    const day = dayOf([10, 11, 12, 13, 14].map((hour) => ({ hour, uv: hour === 12 || hour === 13 ? 10 : 6 })))
    expect(uvPeakWindow(day)).toEqual({ peak: 10, range: '12 PM – 2 PM' })
    expect(weekSummary(calmDay()).title).toBe('Swell to 1 ft · wind 6 mph')
  })
})
