import { describe, expect, it } from 'vitest'
import { closuresAt } from '../beach/closures'
import { dailyRangeFt, hourlyRates, springNeap, tideDynamics } from './tide'

const series = [0.2, 0.3, 0.6, 1.0, 1.4, 1.7, 1.8, 1.7].map((ft, i) => ({ timestamp: `2026-10-13T${String(6 + i).padStart(2, '0')}:00`, ft }))
const extremes = [
  { timestamp: '2026-10-13 05:40', heightFt: 0.2, kind: 'low' as const },
  { timestamp: '2026-10-13 12:10', heightFt: 1.8, kind: 'high' as const },
]

describe('tide dynamics', () => {
  it('computes direction, rate and the next turn', () => {
    const d = tideDynamics(series, extremes)
    expect(d[3].direction).toBe('rising')
    expect(d[3].rateFtPerHr).toBe(0.4)
    expect(d[3].nextTurn).toEqual({ kind: 'high', timestamp: '2026-10-13 12:10', minutesAway: 190 })
  })

  it('flags the mid-change hours, not the turns', () => {
    const d = tideDynamics(series, extremes)
    expect(d.map((x) => x.midChange)).toEqual([false, false, true, true, true, false, false, false])
  })

  it('rates use neighbouring hours', () => {
    const r = hourlyRates([{ timestamp: 'a', ft: 1 }, { timestamp: 'b', ft: 1.4 }, { timestamp: 'c', ft: 2 }])
    expect(r[0]).toBeCloseTo(0.4)
    expect(r[1]).toBeCloseTo(0.5)
    expect(r[2]).toBeCloseTo(0.6)
  })

  it('spring near new and full moon, neap near quarters', () => {
    // Full moon 2026-10-26 04:12 UTC (Oct 25 HST); new moon 2026-10-10 15:50 UTC.
    expect(springNeap('2026-10-25')).toBe('spring')
    expect(springNeap('2026-10-10')).toBe('spring')
    expect(springNeap('2026-10-18')).toBe('neap')
    expect(springNeap('2026-10-14')).toBeNull()
    expect(dailyRangeFt(extremes)).toBe(1.6)
  })
})

describe('closures (entered by hand)', () => {
  it('apply between start and end, or until removed', () => {
    const list = [
      { kind: 'shark' as const, title: 'Shark sighting', startsUtc: '2026-10-12T18:00:00Z', endsUtc: '2026-10-13T04:00:00Z', source: 'Posted signs' },
      { kind: 'closure' as const, title: 'Beach closed', startsUtc: '2026-10-14T00:00:00Z', endsUtc: null, source: 'Signs' },
    ]
    expect(closuresAt(list, Date.parse('2026-10-12T20:00:00Z'))).toHaveLength(1)
    expect(closuresAt(list, Date.parse('2026-10-13T05:00:00Z'))).toHaveLength(0)
    expect(closuresAt(list, Date.parse('2026-12-01T00:00:00Z'))).toHaveLength(1)
  })
})
