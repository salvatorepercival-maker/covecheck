import { describe, expect, it } from 'vitest'
import { CROMWELLS } from '../beach/cromwells'
import { dayOf } from '../lenses/test-facts'
import { longRangeDays } from './long-range'
import { weekOutlook } from './outlook'
import { swellTrains } from './swell-trains'

const W = CROMWELLS.exposedSwellDirections
const hours = (n: number, start = '2026-10-12T00') => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${start}:00Z`) + i * 3_600_000).toISOString().slice(0, 13) + ':00')

describe('swell trains', () => {
  it('follows one swell through arrival, peak and fade, and ignores out-of-window swell', () => {
    const times = hours(30)
    const heights = times.map((_, i) => (i < 2 ? 0.3 : i < 26 ? 0.6 + Math.sin(((i - 2) / 24) * Math.PI) * 2 : 0.3))
    const partitions = times.map((_, i) => [
      { heightFt: heights[i], periodSec: 15 - i * 0.05, directionDeg: 190 },
      { heightFt: 4, periodSec: 8, directionDeg: 70 }, // trade windswell: outside the window
    ])
    const trains = swellTrains(times, partitions, W)
    expect(trains).toHaveLength(1)
    expect(trains[0]).toMatchObject({ arrives: times[2], fades: times[25], directionDeg: 190, peakPeriodSec: 14 })
    expect(trains[0].peakFt).toBeCloseTo(2.6, 1)
  })

  it('is not fragmented when the model swaps a swell between partition slots', () => {
    const times = hours(24)
    const partitions = times.map((_, i) => {
      const swell = { heightFt: 1.8, periodSec: 14 + (i % 2) * 0.6, directionDeg: 185 + (i % 3) }
      const other = { heightFt: 1.1, periodSec: 9, directionDeg: 150 }
      return i % 2 ? [swell, other] : [other, swell]
    })
    expect(swellTrains(times, partitions, W)).toHaveLength(2)
  })

  it('drops short or small blips', () => {
    const times = hours(24)
    const partitions = times.map((_, i) => [{ heightFt: i >= 5 && i < 9 ? 2 : 0.2, periodSec: 12, directionDeg: 180 }])
    expect(swellTrains(times, partitions, W)).toEqual([])
  })
})

describe('long range', () => {
  it('summarises daylight swell and wind per day with a trend word', () => {
    const times = [...hours(24, '2026-10-20T00').map((t) => t), ...hours(24, '2026-10-21T00')].map((t) => t)
    const partitions = times.map((t) => [{ heightFt: t.startsWith('2026-10-21') ? 3 : 1.5, periodSec: 14, directionDeg: 185 }])
    const windMph = Object.fromEntries(times.map((t) => [t, 15]))
    const days = longRangeDays({ times, partitions, windMph }, W)
    expect(days.map((d) => d.date)).toEqual(['2026-10-20', '2026-10-21'])
    expect(days[1]).toMatchObject({ swellFt: 3, periodSec: 14, windMph: 15, trend: 'building' })
  })
})

describe('outlook', () => {
  const quiet = dayOf([6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((hour) => ({ hour, windMph: hour < 12 ? 6 : 16, swellEnergy: 20 })))
  const windy = { ...dayOf([6, 9, 12, 15].map((hour) => ({ hour, windMph: 25, swellEnergy: 120 }))), date: '2026-10-13' }

  it('names calm mornings, the wind change and new swell, plainly', () => {
    const lines = weekOutlook([quiet, windy], [{ arrives: '2026-10-13T08:00', peaks: '2026-10-13T14:00', fades: '2026-10-14T20:00', peakFt: 2.4, peakPeriodSec: 15, directionDeg: 190 }], '2026-10-12')
    expect(lines[0]).toBe('Days to watch: this morning before the wind fills in.')
    expect(lines).toContain('New south swell (15 s) arrives Tuesday near 2.4 ft.')
    expect(lines.some((l) => /^Wind picks up Tuesday/.test(l))).toBe(true)
  })

  it('leads with a new long-period swell over a bigger short-period one', () => {
    const trains = [
      { arrives: '2026-10-13T02:00', peaks: '2026-10-13T08:00', fades: '2026-10-14T00:00', peakFt: 2.2, peakPeriodSec: 10, directionDeg: 160 },
      { arrives: '2026-10-13T20:00', peaks: '2026-10-14T09:00', fades: '2026-10-15T12:00', peakFt: 1.6, peakPeriodSec: 18, directionDeg: 186 },
    ]
    expect(weekOutlook([quiet, windy], trains, '2026-10-12')).toContain('New south swell (18 s) arrives Tuesday, peaking Wednesday near 1.6 ft.')
  })

  it('uses lens best hours when a lens is on', () => {
    expect(weekOutlook([quiet], [], '2026-10-12', [{ date: '2026-10-12', start: 7, end: 9 }], 'snorkeling')[0]).toBe('Best for snorkeling: Today 7AM–10AM.')
    expect(weekOutlook([quiet], [], '2026-10-12', [], 'surfing')[0]).toBe('No stretch fits your surfing settings in the next 1 days.')
  })

  it('never hypes and never speaks in safety terms', () => {
    const lines = weekOutlook([quiet, windy], [{ arrives: '2026-10-13T08:00', peaks: '2026-10-13T14:00', fades: '2026-10-14T20:00', peakFt: 6, peakPeriodSec: 18, directionDeg: 190 }], '2026-10-12')
    for (const l of lines) expect(l).not.toMatch(/\b(safe|unsafe|danger|guarantee|epic|firing|pumping|perfect|amazing)\b/i)
  })
})
