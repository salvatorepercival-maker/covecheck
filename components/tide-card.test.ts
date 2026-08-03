import { describe, expect, it } from 'vitest'
import { buildCurve, nextExtremes } from './tide-card'
import type { TideExtreme } from '@/lib/providers/tides'
import type { HourlyBeachConditions } from '@/lib/types'
import { honoluluLocalToUtc } from '@/lib/time'

/** Real Honolulu 1612340 extremes for 2026-08-02 — a four-event, mixed semi-diurnal day. */
const AUG_2: TideExtreme[] = [
  { timestamp: '2026-08-02 00:48', heightFt: 0.175, kind: 'low' },
  { timestamp: '2026-08-02 06:45', heightFt: 1.239, kind: 'high' },
  { timestamp: '2026-08-02 12:01', heightFt: 0.55, kind: 'low' },
  { timestamp: '2026-08-02 18:21', heightFt: 1.745, kind: 'high' },
]

describe('nextExtremes', () => {
  it('finds the next high and next low at or after now', () => {
    const { nextHigh, nextLow } = nextExtremes(AUG_2, '2026-08-02T09:00')
    expect(nextHigh?.timestamp).toBe('2026-08-02 18:21')
    expect(nextLow?.timestamp).toBe('2026-08-02 12:01')
  })

  it('crosses midnight rather than stopping at the end of the day', () => {
    const spanning: TideExtreme[] = [
      ...AUG_2,
      { timestamp: '2026-08-03 01:15', heightFt: 0.1, kind: 'low' },
      { timestamp: '2026-08-03 07:30', heightFt: 1.3, kind: 'high' },
    ]
    const { nextHigh, nextLow } = nextExtremes(spanning, '2026-08-02T19:00')
    expect(nextLow?.timestamp).toBe('2026-08-03 01:15')
    expect(nextHigh?.timestamp).toBe('2026-08-03 07:30')
  })

  it('returns nulls once nothing is upcoming, rather than reaching backwards', () => {
    const { nextHigh, nextLow } = nextExtremes(AUG_2, '2026-08-03T00:00')
    expect(nextHigh).toBeNull()
    expect(nextLow).toBeNull()
  })

  it('skips extremes with no usable height', () => {
    const holed: TideExtreme[] = [{ timestamp: '2026-08-02 12:01', heightFt: null, kind: 'low' }]
    expect(nextExtremes(holed, '2026-08-02T09:00').nextLow).toBeNull()
  })
})

/** Minimal hourly record — only the fields the curve reads. */
function hourAt(local: string, tideHeightFt: number | null): HourlyBeachConditions {
  return {
    timestamp: local,
    timestampUtc: honoluluLocalToUtc(local).toISOString(),
    tideHeightFt,
  } as HourlyBeachConditions
}

const series = (start: number, heights: readonly (number | null)[]) =>
  Object.fromEntries(
    heights.map((height, index) => {
      const local = `2026-08-02T${String(start + index).padStart(2, '0')}:00`
      return [local, hourAt(local, height)]
    }),
  )

describe('buildCurve', () => {
  it('plots a 12-hour window centred on now', () => {
    const curve = buildCurve(series(3, Array.from({ length: 18 }, (_, i) => 1 + i * 0.1)), '2026-08-02T09:00')
    expect(curve).not.toBeNull()
    // 03:00 through 15:00 inclusive is 13 hourly samples.
    expect(curve!.points).toHaveLength(13)
    expect(curve!.points[0].localTimestamp).toBe('2026-08-02T03:00')
    expect(curve!.points.at(-1)!.localTimestamp).toBe('2026-08-02T15:00')
  })

  it('places the now marker in the middle of the plot', () => {
    const curve = buildCurve(series(3, Array.from({ length: 18 }, () => 1)), '2026-08-02T09:00')
    expect(curve!.nowX).toBeGreaterThan(150)
    expect(curve!.nowX).toBeLessThan(170)
  })

  it('pads a flat stretch so it is not drawn as a hairline', () => {
    const curve = buildCurve(series(6, Array.from({ length: 8 }, () => 1.2)), '2026-08-02T09:00')
    expect(curve!.maxFt - curve!.minFt).toBeGreaterThan(0.2)
  })

  it('skips hours with no tide height', () => {
    const curve = buildCurve(series(6, [1, null, 1.2, null, 1.4, 1.5]), '2026-08-02T09:00')
    expect(curve!.points.every((p) => p.heightFt !== null)).toBe(true)
    expect(curve!.points).toHaveLength(4)
  })

  it('returns null when there is too little to draw', () => {
    expect(buildCurve(series(9, [1]), '2026-08-02T09:00')).toBeNull()
    expect(buildCurve({}, '2026-08-02T09:00')).toBeNull()
  })

  it('keeps every plotted point inside the viewBox', () => {
    const curve = buildCurve(series(3, Array.from({ length: 18 }, (_, i) => 0.2 + i * 0.2)), '2026-08-02T09:00')
    for (const point of curve!.points) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(320)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(92)
    }
  })
})

describe('clothingCue', () => {
  it('maps the wetsuit bands from the brief', async () => {
    const { clothingCue } = await import('./conditions-grid')
    expect(clothingCue(81)).toBe('No wetsuit needed')
    expect(clothingCue(78)).toBe('No wetsuit needed')
    expect(clothingCue(77)).toBe('Rashguard')
    expect(clothingCue(74)).toBe('Rashguard')
    expect(clothingCue(73)).toBe('Rashguard, some may want a light wetsuit top')
    expect(clothingCue(70)).toBe('Rashguard, some may want a light wetsuit top')
    expect(clothingCue(69)).toBe('Wetsuit recommended')
  })

  it('reports absence rather than inventing a temperature', async () => {
    const { clothingCue } = await import('./conditions-grid')
    expect(clothingCue(null)).toBe('Not available')
  })
})
