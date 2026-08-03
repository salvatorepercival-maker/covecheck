import { describe, expect, it } from 'vitest'
import { CROMWELLS } from '../beach/cromwells'
import type { HourAssessment } from './assess'
import { reason, type Verdict } from './reasons'
import {
  bestSubWindow,
  bestWindowForDate,
  DEFAULT_USABLE_HOURS,
  groupWindows,
  mergeReasons,
  rankWindows,
  scoreWindow,
  type CandidateWindow,
} from './windows'
import { honoluluLocalToUtc } from '../time'

type HourStub = {
  hour: number
  verdict: Verdict
  swell?: number
  windPercentile?: number
  tide?: number
  confidence?: 'high' | 'medium' | 'low'
  date?: string
}

function hour(stub: HourStub): HourAssessment {
  const timestamp = `${stub.date ?? '2026-08-02'}T${String(stub.hour).padStart(2, '0')}:00`
  return {
    timestamp,
    timestampUtc: honoluluLocalToUtc(timestamp).toISOString(),
    verdict: stub.verdict,
    confidence: stub.confidence ?? 'high',
    reasons: [reason(stub.verdict === 'great' ? 'LOW_WAVE_ENERGY' : 'MARGINAL_SWELL')],
    metrics: {
      exposedSwellHeightFt: stub.swell ?? 1,
      windSpeedMph: 8,
      windGustMph: 12,
      windPercentile: stub.windPercentile ?? 0.5,
      tideHeightFt: 1.2,
      tideFavorability: stub.tide ?? 0.7,
      recentRainIn: 0,
      srfSouthFacingMaxFt: null,
    },
    configVersion: CROMWELLS.configVersion,
  }
}

const MIN = CROMWELLS.thresholds.minWindowHours

describe('groupWindows', () => {
  it('combines adjacent hours of the same verdict', () => {
    const windows = groupWindows(
      [7, 8, 9].map((h) => hour({ hour: h, verdict: 'great' })),
      MIN,
    )

    expect(windows).toHaveLength(1)
    expect(windows[0]).toMatchObject({
      startTimestamp: '2026-08-02T07:00',
      endTimestamp: '2026-08-02T09:00',
      lengthHours: 3,
      verdict: 'great',
    })
  })

  it('does not merge runs of different verdicts', () => {
    const windows = groupWindows(
      [
        hour({ hour: 7, verdict: 'great' }),
        hour({ hour: 8, verdict: 'great' }),
        hour({ hour: 9, verdict: 'caution' }),
        hour({ hour: 10, verdict: 'caution' }),
      ],
      MIN,
    )

    expect(windows.map((w) => [w.verdict, w.lengthHours])).toEqual([
      ['great', 2],
      ['caution', 2],
    ])
  })

  it('breaks a run when an hour is blocked', () => {
    const windows = groupWindows(
      [
        hour({ hour: 7, verdict: 'great' }),
        hour({ hour: 8, verdict: 'great' }),
        hour({ hour: 9, verdict: 'not_recommended' }),
        hour({ hour: 10, verdict: 'great' }),
        hour({ hour: 11, verdict: 'great' }),
      ],
      MIN,
    )

    expect(windows).toHaveLength(2)
    expect(windows[0].endTimestamp).toBe('2026-08-02T08:00')
    expect(windows[1].startTimestamp).toBe('2026-08-02T10:00')
  })

  it('breaks a run on a time gap even when verdicts match', () => {
    // A missing hour means the hours are not actually continuous.
    const windows = groupWindows(
      [
        hour({ hour: 7, verdict: 'great' }),
        hour({ hour: 8, verdict: 'great' }),
        hour({ hour: 11, verdict: 'great' }),
        hour({ hour: 12, verdict: 'great' }),
      ],
      MIN,
    )
    expect(windows).toHaveLength(2)
  })

  describe('minimum window length', () => {
    it('downgrades a single favorable hour to caution', () => {
      const windows = groupWindows(
        [
          hour({ hour: 7, verdict: 'great' }),
          hour({ hour: 8, verdict: 'not_recommended' }),
        ],
        MIN,
      )

      expect(windows).toHaveLength(1)
      expect(windows[0].verdict).toBe('caution')
      expect(windows[0].reasons[0].code).toBe('INSUFFICIENT_WINDOW')
      expect(windows[0].reasons[0].detail).toMatch(/only 1 favorable hour in a row, 2 needed/)
    })

    it('accepts a run exactly at the minimum', () => {
      const windows = groupWindows(
        [7, 8].map((h) => hour({ hour: h, verdict: 'great' })),
        MIN,
      )
      expect(windows[0].verdict).toBe('great')
      expect(windows[0].reasons.map((r) => r.code)).not.toContain('INSUFFICIENT_WINDOW')
    })

    it('respects a raised minimum', () => {
      const windows = groupWindows(
        [7, 8].map((h) => hour({ hour: h, verdict: 'great' })),
        3,
      )
      expect(windows[0].verdict).toBe('caution')
    })
  })

  describe('usable hours', () => {
    it('excludes hours outside the usable part of the day', () => {
      // Without this, "favor morning" would rank 4 AM as the best window.
      const windows = groupWindows(
        [3, 4, 5].map((h) => hour({ hour: h, verdict: 'great' })),
        MIN,
      )
      expect(windows).toEqual([])
    })

    it('includes the boundary hours', () => {
      const windows = groupWindows(
        [hour({ hour: 6, verdict: 'great' }), hour({ hour: 7, verdict: 'great' })],
        MIN,
        DEFAULT_USABLE_HOURS,
      )
      expect(windows).toHaveLength(1)
    })

    it('honors an overridden usable range', () => {
      const windows = groupWindows(
        [5, 6].map((h) => hour({ hour: h, verdict: 'great' })),
        MIN,
        { earliest: 5, latest: 20 },
      )
      expect(windows[0].startTimestamp).toBe('2026-08-02T05:00')
    })
  })

  it('takes the weakest confidence across the window', () => {
    const windows = groupWindows(
      [
        hour({ hour: 7, verdict: 'great', confidence: 'high' }),
        hour({ hour: 8, verdict: 'great', confidence: 'medium' }),
      ],
      MIN,
    )
    expect(windows[0].confidence).toBe('medium')
  })
})

describe('mergeReasons', () => {
  it('deduplicates by code and orders problems ahead of positives', () => {
    const hours: HourAssessment[] = [
      { ...hour({ hour: 7, verdict: 'great' }), reasons: [reason('LOW_WAVE_ENERGY'), reason('CALM_WIND')] },
      { ...hour({ hour: 8, verdict: 'great' }), reasons: [reason('CALM_WIND'), reason('STRONG_GUSTS')] },
    ]

    const merged = mergeReasons(hours)
    expect(merged.map((r) => r.code)).toEqual(['STRONG_GUSTS', 'LOW_WAVE_ENERGY', 'CALM_WIND'])
  })
})

describe('ranking two candidate windows', () => {
  const build = (stubs: HourStub[]): CandidateWindow =>
    groupWindows(stubs.map(hour), MIN)[0]

  it('prefers the window with less swell', () => {
    const calm = build([
      { hour: 7, verdict: 'great', swell: 0.5 },
      { hour: 8, verdict: 'great', swell: 0.5 },
    ])
    const lumpy = build([
      { hour: 7, verdict: 'great', swell: 2.5 },
      { hour: 8, verdict: 'great', swell: 2.5 },
    ])
    expect(rankWindows([lumpy, calm])[0]).toBe(calm)
  })

  it('prefers the window with lighter wind', () => {
    const light = build([
      { hour: 7, verdict: 'great', windPercentile: 0.1 },
      { hour: 8, verdict: 'great', windPercentile: 0.1 },
    ])
    const breezy = build([
      { hour: 7, verdict: 'great', windPercentile: 0.9 },
      { hour: 8, verdict: 'great', windPercentile: 0.9 },
    ])
    expect(rankWindows([breezy, light])[0]).toBe(light)
  })

  it('prefers a tide closer to the beach\'s favourable band', () => {
    // Not "more water" — favourability, so a near-high tide is not automatically best.
    const inBand = build([
      { hour: 7, verdict: 'great', tide: 1 },
      { hour: 8, verdict: 'great', tide: 1 },
    ])
    const offBand = build([
      { hour: 7, verdict: 'great', tide: 0.3 },
      { hour: 8, verdict: 'great', tide: 0.3 },
    ])
    expect(rankWindows([offBand, inBand])[0]).toBe(inBand)
  })

  it('prefers the morning of two otherwise identical windows', () => {
    const early = build([
      { hour: 7, verdict: 'great' },
      { hour: 8, verdict: 'great' },
    ])
    const late = build([
      { hour: 15, verdict: 'great' },
      { hour: 16, verdict: 'great' },
    ])
    expect(rankWindows([late, early])[0]).toBe(early)
  })

  it('prefers higher confidence', () => {
    const confident = build([
      { hour: 7, verdict: 'great', confidence: 'high' },
      { hour: 8, verdict: 'great', confidence: 'high' },
    ])
    const uncertain = build([
      { hour: 7, verdict: 'great', confidence: 'low' },
      { hour: 8, verdict: 'great', confidence: 'low' },
    ])
    expect(rankWindows([uncertain, confident])[0]).toBe(confident)
  })

  it('prefers the longer window', () => {
    const long = build([6, 7, 8, 9].map((h) => ({ hour: h, verdict: 'great' as Verdict })))
    const short = build([
      { hour: 6, verdict: 'great' },
      { hour: 7, verdict: 'great' },
    ])
    expect(rankWindows([short, long])[0]).toBe(long)
  })

  it('ranks a great window above a caution window regardless of score', () => {
    // Verdict tier is a floor, not a weighting: a marginal great morning still
    // outranks a beautifully-scored caution afternoon.
    const greatButLate = build([
      { hour: 16, verdict: 'great', swell: 2.5, tide: 0.45, windPercentile: 0.9 },
      { hour: 17, verdict: 'great', swell: 2.5, tide: 0.45, windPercentile: 0.9 },
    ])
    const cautionButLovely = build([
      { hour: 7, verdict: 'caution', swell: 0.2, tide: 0.95, windPercentile: 0.05 },
      { hour: 8, verdict: 'caution', swell: 0.2, tide: 0.95, windPercentile: 0.05 },
    ])

    expect(cautionButLovely.score).toBeLessThan(greatButLate.score)
    expect(rankWindows([cautionButLovely, greatButLate])[0]).toBe(greatButLate)
  })

  it('breaks exact ties on the earlier start, so ordering is total', () => {
    const a = build([
      { hour: 7, verdict: 'great' },
      { hour: 8, verdict: 'great' },
    ])
    const b = build([
      { hour: 7, verdict: 'great', date: '2026-08-03' },
      { hour: 8, verdict: 'great', date: '2026-08-03' },
    ])
    expect(a.score).toBe(b.score)
    expect(rankWindows([b, a])[0]).toBe(a)
  })

  it('does not treat missing metrics as an advantage', () => {
    const measured = build([
      { hour: 7, verdict: 'great', swell: 0.5, tide: 0.9 },
      { hour: 8, verdict: 'great', swell: 0.5, tide: 0.9 },
    ])
    const unknown: CandidateWindow = {
      ...measured,
      hours: measured.hours.map((h) => ({
        ...h,
        metrics: { ...h.metrics, exposedSwellHeightFt: null, tideFavorability: null, windPercentile: null },
      })),
    }
    const rescored = { ...unknown, score: scoreWindow(unknown) }

    // Unknown terms contribute their neutral midpoint, which is worse than good data.
    expect(rescored.score).toBeGreaterThan(measured.score)
  })
})

describe('bestSubWindow', () => {
  const runOf = (stubs: HourStub[]) => groupWindows(stubs.map(hour), MIN)[0]

  it('returns a short window unchanged', () => {
    const window = runOf([
      { hour: 7, verdict: 'great' },
      { hour: 8, verdict: 'great' },
    ])
    expect(bestSubWindow(window, MIN, 3)).toBe(window)
  })

  it('tightens a whole-day stretch to the preferred length', () => {
    // The case that motivated this: uniform conditions merge every usable hour
    // into one block, which is not a recommendation.
    const allDay = runOf(
      Array.from({ length: 13 }, (_, i) => ({ hour: 6 + i, verdict: 'great' as Verdict })),
    )
    expect(allDay.lengthHours).toBe(13)

    const tightened = bestSubWindow(allDay, MIN, 3)
    expect(tightened.lengthHours).toBe(3)
    // With everything else equal, the morning preference picks the earliest slice.
    expect(tightened.startTimestamp).toBe('2026-08-02T06:00')
  })

  it('picks the calmest slice, not merely the earliest', () => {
    const window = runOf([
      { hour: 6, verdict: 'great', swell: 3 },
      { hour: 7, verdict: 'great', swell: 3 },
      { hour: 8, verdict: 'great', swell: 3 },
      { hour: 9, verdict: 'great', swell: 0.2 },
      { hour: 10, verdict: 'great', swell: 0.2 },
      { hour: 11, verdict: 'great', swell: 0.2 },
    ])

    const tightened = bestSubWindow(window, MIN, 3)
    expect(tightened.startTimestamp).toBe('2026-08-02T09:00')
    expect(tightened.endTimestamp).toBe('2026-08-02T11:00')
  })

  it('never returns fewer hours than the minimum', () => {
    const window = runOf(
      Array.from({ length: 8 }, (_, i) => ({ hour: 6 + i, verdict: 'great' as Verdict })),
    )
    expect(bestSubWindow(window, 4, 2).lengthHours).toBe(4)
  })

  it('preserves the verdict of the parent stretch', () => {
    const window = runOf(
      Array.from({ length: 8 }, (_, i) => ({ hour: 6 + i, verdict: 'caution' as Verdict })),
    )
    expect(bestSubWindow(window, MIN, 3).verdict).toBe('caution')
  })

  it('scores with the same weights as the top-level ranking', () => {
    // If these diverged, the recommended slice could contradict the day ranking.
    const window = runOf(
      Array.from({ length: 6 }, (_, i) => ({ hour: 6 + i, verdict: 'great' as Verdict })),
    )
    const tightened = bestSubWindow(window, MIN, 3)
    expect(tightened.score).toBeCloseTo(scoreWindow(tightened), 10)
  })
})

describe('bestWindowForDate', () => {
  const windows = [
    ...groupWindows(
      [
        hour({ hour: 7, verdict: 'caution', date: '2026-08-02' }),
        hour({ hour: 8, verdict: 'caution', date: '2026-08-02' }),
      ],
      MIN,
    ),
    ...groupWindows(
      [
        hour({ hour: 7, verdict: 'great', date: '2026-08-03' }),
        hour({ hour: 8, verdict: 'great', date: '2026-08-03' }),
      ],
      MIN,
    ),
  ]

  it('returns only windows on the requested local date', () => {
    expect(bestWindowForDate(windows, '2026-08-02')?.verdict).toBe('caution')
    expect(bestWindowForDate(windows, '2026-08-03')?.verdict).toBe('great')
  })

  it('returns null for a date with no windows', () => {
    expect(bestWindowForDate(windows, '2026-08-09')).toBeNull()
  })
})
