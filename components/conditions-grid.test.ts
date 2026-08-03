import { describe, expect, it } from 'vitest'
import { selectTideExtremes } from './conditions-grid'
import type { TideExtreme } from '@/lib/providers/tides'

/** Real Honolulu 1612340 extremes for 2026-08-02 — a four-event, mixed semi-diurnal day. */
const AUG_2: TideExtreme[] = [
  { timestamp: '2026-08-02 00:48', heightFt: 0.175, kind: 'low' },
  { timestamp: '2026-08-02 06:45', heightFt: 1.239, kind: 'high' },
  { timestamp: '2026-08-02 12:01', heightFt: 0.55, kind: 'low' },
  { timestamp: '2026-08-02 18:21', heightFt: 1.745, kind: 'high' },
]

describe('selectTideExtremes', () => {
  it('shows every event in day mode', () => {
    expect(selectTideExtremes(AUG_2, 'day', null)).toHaveLength(4)
  })

  it('picks the two nearest the recommended window', () => {
    // Window 6-9 AM: the 06:45 high sits inside it and the 12:01 low follows.
    const picked = selectTideExtremes(AUG_2, 'window', {
      start: '2026-08-02T06:00',
      end: '2026-08-02T08:00',
    })
    expect(picked.map((e) => e.timestamp)).toEqual(['2026-08-02 06:45', '2026-08-02 12:01'])
  })

  it('tracks a later window', () => {
    const picked = selectTideExtremes(AUG_2, 'window', {
      start: '2026-08-02T15:00',
      end: '2026-08-02T17:00',
    })
    expect(picked.map((e) => e.kind)).toEqual(['low', 'high'])
    expect(picked.map((e) => e.timestamp)).toEqual(['2026-08-02 12:01', '2026-08-02 18:21'])
  })

  it('falls back to midday when there is no recommended window', () => {
    const picked = selectTideExtremes(AUG_2, 'window', null)
    expect(picked.map((e) => e.timestamp)).toEqual(['2026-08-02 06:45', '2026-08-02 12:01'])
  })

  it('always returns events in chronological order', () => {
    const picked = selectTideExtremes(AUG_2, 'window', {
      start: '2026-08-02T11:00',
      end: '2026-08-02T13:00',
    })
    const times = picked.map((e) => e.timestamp)
    expect([...times].sort()).toEqual(times)
  })

  it('drops events with no usable height rather than rendering a blank', () => {
    const withHole: TideExtreme[] = [...AUG_2, { timestamp: '2026-08-02 21:00', heightFt: null, kind: 'low' }]
    expect(selectTideExtremes(withHole, 'day', null).every((e) => e.heightFt !== null)).toBe(true)
  })

  it('returns a short day unchanged in either mode', () => {
    const two = AUG_2.slice(0, 2)
    expect(selectTideExtremes(two, 'window', null)).toHaveLength(2)
    expect(selectTideExtremes([], 'day', null)).toEqual([])
  })
})
