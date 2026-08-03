import { describe, expect, it } from 'vitest'
import { bracketingExtremes, tideRangeFractionAt, tideStageAt } from './tide'
import type { TideExtreme } from './providers/tides'

/** Real Honolulu 1612340 turning points for 2026-08-02, from fixtures/raw. */
const AUG_2: TideExtreme[] = [
  { timestamp: '2026-08-02 00:48', heightFt: 0.175, kind: 'low' },
  { timestamp: '2026-08-02 06:45', heightFt: 1.239, kind: 'high' },
  { timestamp: '2026-08-02 12:01', heightFt: 0.55, kind: 'low' },
  { timestamp: '2026-08-02 18:21', heightFt: 1.745, kind: 'high' },
]

describe('bracketingExtremes', () => {
  it('finds the turning points either side of a timestamp', () => {
    const { previous, next } = bracketingExtremes('2026-08-02T09:00', AUG_2)
    expect(previous?.timestamp).toBe('2026-08-02 06:45')
    expect(next?.timestamp).toBe('2026-08-02 12:01')
  })

  it('returns no previous before the first extreme', () => {
    const { previous, next } = bracketingExtremes('2026-08-02T00:00', AUG_2)
    expect(previous).toBeNull()
    expect(next?.timestamp).toBe('2026-08-02 00:48')
  })

  it('returns no next after the last extreme', () => {
    const { previous, next } = bracketingExtremes('2026-08-02T22:00', AUG_2)
    expect(previous?.timestamp).toBe('2026-08-02 18:21')
    expect(next).toBeNull()
  })
})

describe('tideStageAt', () => {
  it('reports falling while heading toward a low', () => {
    expect(tideStageAt('2026-08-02T09:00', AUG_2)).toBe('falling')
  })

  it('reports rising while heading toward a high', () => {
    expect(tideStageAt('2026-08-02T15:00', AUG_2)).toBe('rising')
  })

  it('reports slack water near a turning point', () => {
    // 06:45 high — an hour either side is effectively slack.
    expect(tideStageAt('2026-08-02T07:00', AUG_2)).toBe('near-high')
    expect(tideStageAt('2026-08-02T06:00', AUG_2)).toBe('near-high')
    expect(tideStageAt('2026-08-02T12:00', AUG_2)).toBe('near-low')
  })

  it('prefers the turning point over the direction just outside the slack window', () => {
    // 08:00 is 75 min past the high, so direction wins over slack.
    expect(tideStageAt('2026-08-02T08:00', AUG_2)).toBe('falling')
  })

  it('infers direction away from the last extreme once past it', () => {
    // After the 18:21 high with no further extreme supplied, the tide must be falling.
    expect(tideStageAt('2026-08-02T22:00', AUG_2)).toBe('falling')
  })

  it('is unknown with no extremes rather than guessing', () => {
    expect(tideStageAt('2026-08-02T09:00', [])).toBe('unknown')
  })
})

describe('tideRangeFractionAt', () => {
  it('places a height within the local day’s own range', () => {
    // 2026-08-02 spans 0.175 to 1.745 ft — a 1.57 ft range.
    expect(tideRangeFractionAt('2026-08-02T06:45', 1.745, AUG_2)).toBeCloseTo(1, 3)
    expect(tideRangeFractionAt('2026-08-02T00:48', 0.175, AUG_2)).toBeCloseTo(0, 3)
    expect(tideRangeFractionAt('2026-08-02T09:00', 0.96, AUG_2)).toBeCloseTo(0.5, 2)
  })

  it('is expressed relative to the day, not absolute feet', () => {
    // 1.24 ft is only a mid-range height here, but would be near the top of a
    // day with a smaller swing. The fraction is what carries meaning.
    const fraction = tideRangeFractionAt('2026-08-02T06:45', 1.239, AUG_2)
    expect(fraction).toBeGreaterThan(0.6)
    expect(fraction).toBeLessThan(0.8)
  })

  it('clamps values outside the predicted extremes', () => {
    expect(tideRangeFractionAt('2026-08-02T09:00', 2.5, AUG_2)).toBe(1)
    expect(tideRangeFractionAt('2026-08-02T09:00', -0.5, AUG_2)).toBe(0)
  })

  it('returns null for a missing height rather than 0', () => {
    // At the MLLW datum 0 ft is a real low tide, so coercing null to 0 would be
    // indistinguishable from data.
    expect(tideRangeFractionAt('2026-08-02T09:00', null, AUG_2)).toBeNull()
  })

  it('returns null when the day has too few extremes to define a range', () => {
    expect(tideRangeFractionAt('2026-08-02T09:00', 1, [AUG_2[0]])).toBeNull()
  })

  it('returns null when the day’s range is degenerate', () => {
    const flat: TideExtreme[] = [
      { timestamp: '2026-08-02 06:00', heightFt: 1.0, kind: 'high' },
      { timestamp: '2026-08-02 12:00', heightFt: 1.02, kind: 'low' },
    ]
    expect(tideRangeFractionAt('2026-08-02T09:00', 1.01, flat)).toBeNull()
  })

  it('uses only the matching local calendar day’s extremes', () => {
    const twoDays: TideExtreme[] = [
      ...AUG_2,
      { timestamp: '2026-08-03 06:00', heightFt: 4.0, kind: 'high' },
      { timestamp: '2026-08-03 12:00', heightFt: 0.0, kind: 'low' },
    ]
    // The 3rd's much larger range must not stretch the 2nd's scale.
    expect(tideRangeFractionAt('2026-08-02T06:45', 1.745, twoDays)).toBeCloseTo(1, 3)
  })
})
