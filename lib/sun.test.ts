import { describe, expect, it } from 'vitest'
import { CROMWELLS } from './beach/cromwells'
import { formatSunTime, sunTimesFor } from './sun'

const at = (date: string) => sunTimesFor(date, CROMWELLS.latitude, CROMWELLS.longitude)

/** Minutes past midnight → "HH:MM", for readable failures. */
const clock = (minutes: number | null) =>
  minutes === null ? 'null' : `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, '0')}`

describe('sunTimesFor at Cromwell’s', () => {
  it('matches published Honolulu times for 2026-08-02 to within a few minutes', () => {
    // Honolulu on 2 Aug: sunrise about 6:04, sunset about 19:04 HST.
    const sun = at('2026-08-02')
    expect(sun.sunrise, clock(sun.sunrise)).toBeGreaterThan(6 * 60 - 6)
    expect(sun.sunrise, clock(sun.sunrise)).toBeLessThan(6 * 60 + 12)
    expect(sun.sunset, clock(sun.sunset)).toBeGreaterThan(19 * 60 - 12)
    expect(sun.sunset, clock(sun.sunset)).toBeLessThan(19 * 60 + 12)
  })

  it('puts civil twilight outside sunrise and sunset, by roughly 20 minutes', () => {
    const sun = at('2026-08-02')
    const dawnGap = sun.sunrise! - sun.firstLight!
    const duskGap = sun.lastLight! - sun.sunset!
    expect(dawnGap).toBeGreaterThan(15)
    expect(dawnGap).toBeLessThan(30)
    expect(duskGap).toBeGreaterThan(15)
    expect(duskGap).toBeLessThan(30)
  })

  it('orders the four events correctly', () => {
    const sun = at('2026-08-02')
    expect(sun.firstLight!).toBeLessThan(sun.sunrise!)
    expect(sun.sunrise!).toBeLessThan(sun.sunset!)
    expect(sun.sunset!).toBeLessThan(sun.lastLight!)
  })

  it('tracks the seasonal swing across the year', () => {
    // Hawaiʻi's day length varies modestly, but the solstices must differ clearly.
    const june = at('2026-06-21')
    const december = at('2026-12-21')
    const juneDay = june.sunset! - june.sunrise!
    const decemberDay = december.sunset! - december.sunrise!

    expect(juneDay).toBeGreaterThan(decemberDay)
    // Roughly 13h20m versus 10h50m at 21°N.
    expect(juneDay / 60).toBeGreaterThan(13)
    expect(decemberDay / 60).toBeLessThan(11.5)
  })

  it('shifts sunrise later through the autumn', () => {
    expect(at('2026-09-01').sunrise!).toBeGreaterThan(at('2026-08-02').sunrise!)
  })

  it('is deterministic', () => {
    expect(at('2026-08-02')).toEqual(at('2026-08-02'))
  })

  it('handles a polar case without throwing', () => {
    // Svalbard in midsummer: the sun never sets, so there is no crossing.
    const polar = sunTimesFor('2026-06-21', 78.2, 15.6, 2)
    expect(polar.sunrise).toBeNull()
    expect(polar.sunset).toBeNull()
  })
})

describe('formatSunTime', () => {
  it('renders compact lowercase times', () => {
    expect(formatSunTime(5 * 60 + 42)).toBe('5:42am')
    expect(formatSunTime(6 * 60 + 6)).toBe('6:06am')
    expect(formatSunTime(19 * 60 + 10)).toBe('7:10pm')
    expect(formatSunTime(12 * 60)).toBe('12:00pm')
    expect(formatSunTime(0)).toBe('12:00am')
  })

  it('rounds to the nearest minute', () => {
    expect(formatSunTime(6 * 60 + 5.7)).toBe('6:06am')
  })

  it('returns null when the event does not occur', () => {
    expect(formatSunTime(null)).toBeNull()
  })
})
