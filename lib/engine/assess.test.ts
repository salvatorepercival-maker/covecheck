import { describe, expect, it } from 'vitest'
import { CROMWELLS } from '../beach/cromwells'
import {
  assessHour,
  buildContext,
  hasUnresolvedWindCalibration,
  percentileOf,
  recentRainInches,
} from './assess'
import { buildSeries, CROMWELLS_WIND_CALIBRATED, HIGH_SURF_ADVISORY } from './fixtures'

describe('percentileOf', () => {
  const sorted = [1, 2, 3, 4, 5]

  it('places a value within the distribution', () => {
    expect(percentileOf(1, sorted)).toBeCloseTo(0.1, 6)
    expect(percentileOf(3, sorted)).toBeCloseTo(0.5, 6)
    expect(percentileOf(5, sorted)).toBeCloseTo(0.9, 6)
  })

  it('returns the midpoint for a completely flat distribution', () => {
    // The bug this guards: counting ties as "below" would make every hour of a
    // uniformly calm forecast the windiest hour of that forecast.
    expect(percentileOf(7, [7, 7, 7, 7])).toBe(0.5)
  })

  it('handles values outside the distribution', () => {
    expect(percentileOf(0, sorted)).toBe(0)
    expect(percentileOf(99, sorted)).toBe(1)
  })

  it('returns null when there is nothing to compare against', () => {
    expect(percentileOf(5, [])).toBeNull()
    expect(percentileOf(null, sorted)).toBeNull()
  })
})

describe('recentRainInches', () => {
  const series = (values: (number | null)[]) =>
    buildSeries(values.map((precipitationIn, index) => ({ hour: index, precipitationIn })))

  it('sums the lookback window inclusive of the current hour', () => {
    const hours = series([0.1, 0.2, 0.3])
    expect(recentRainInches(hours, 2)).toBeCloseTo(0.6, 6)
  })

  it('does not reach back before the start of the series', () => {
    const hours = series([0.5, 0.1])
    expect(recentRainInches(hours, 0)).toBeCloseTo(0.5, 6)
  })

  it('caps the lookback at 12 hours', () => {
    const hours = series(Array.from({ length: 20 }, () => 0.1))
    expect(recentRainInches(hours, 19)).toBeCloseTo(1.2, 6)
  })

  it('treats individual nulls as zero but an all-null window as unknown', () => {
    // Partial data is still usable; no data at all must not read as "no rain".
    expect(recentRainInches(series([0.2, null]), 1)).toBeCloseTo(0.2, 6)
    expect(recentRainInches(series([null, null]), 1)).toBeNull()
  })
})

describe('hasUnresolvedWindCalibration', () => {
  it('detects the open gap on the real profile', () => {
    expect(hasUnresolvedWindCalibration(CROMWELLS)).toBe(true)
  })

  it('is false once the gap is marked resolved', () => {
    expect(hasUnresolvedWindCalibration(CROMWELLS_WIND_CALIBRATED)).toBe(false)
  })

  it('ignores unresolved gaps that do not affect wind thresholds', () => {
    const profile = {
      ...CROMWELLS,
      calibration: CROMWELLS.calibration.filter((gap) => !gap.id.includes('wind')),
    }
    expect(hasUnresolvedWindCalibration(profile)).toBe(false)
  })
})

describe('assessHour precedence', () => {
  const assess = (hours: ReturnType<typeof buildSeries>, profile = CROMWELLS_WIND_CALIBRATED) =>
    assessHour(hours, 0, buildContext(profile, hours, null))

  it('lets a hazard outrank stale data', () => {
    // Both are present. The hazard is definitive, so not_recommended must win
    // over insufficient_data — the conservative outcome.
    const hours = buildSeries([
      { hour: 8, hazards: [HIGH_SURF_ADVISORY], freshnessOverrides: { marine: 'stale' } },
    ])
    const result = assess(hours)

    expect(result.verdict).toBe('not_recommended')
    expect(result.reasons.map((r) => r.code)).toContain('ACTIVE_BEACH_HAZARD')
    expect(result.reasons.map((r) => r.code)).toContain('STALE_DATA')
  })

  it('lets excessive swell outrank missing wind data', () => {
    const hours = buildSeries([{ hour: 8, exposedSwellHeightFt: 6, windSpeedMph: null }])
    expect(assess(hours).verdict).toBe('not_recommended')
  })

  it('reports insufficient_data when wave data is missing entirely', () => {
    const hours = buildSeries([{ hour: 8, exposedSwellHeightFt: null }])
    const result = assess(hours)
    expect(result.verdict).toBe('insufficient_data')
    expect(result.reasons.map((r) => r.code)).toContain('MISSING_CRITICAL_DATA')
  })

  it('reports insufficient_data when the hazard state is unknown', () => {
    const hours = buildSeries([{ hour: 8, freshnessOverrides: { alerts: 'failed' } }])
    const result = assess(hours)
    expect(result.verdict).toBe('insufficient_data')
    expect(result.reasons.map((r) => r.code)).toContain('HAZARD_STATE_UNKNOWN')
  })

  it('treats missing tide as critical, given the shallow reef', () => {
    const hours = buildSeries([{ hour: 8, tideRangeFraction: null }])
    expect(assess(hours).verdict).toBe('insufficient_data')
  })

  it('never rates an hour great with any incomplete critical input', () => {
    const incomplete = [
      { hour: 8, exposedSwellHeightFt: null },
      { hour: 8, windSpeedMph: null },
      { hour: 8, tideRangeFraction: null },
      { hour: 8, freshnessOverrides: { marine: 'stale' as const } },
      { hour: 8, freshnessOverrides: { alerts: 'missing' as const } },
    ]

    for (const spec of incomplete) {
      const result = assess(buildSeries([spec]))
      expect(result.verdict, `${JSON.stringify(spec)} produced ${result.verdict}`).not.toBe('great')
    }
  })
})

describe('assessHour wind handling', () => {
  it('does not gate on absolute wind while calibration is unresolved', () => {
    // 40 mph at the model cell. With the gap open the engine reports it but
    // refuses to treat it as a measured gust, capping at caution instead.
    const hours = buildSeries([{ hour: 8, windSpeedMph: 40, windGustMph: 55 }])
    const result = assessHour(hours, 0, buildContext(CROMWELLS, hours, null))

    expect(result.verdict).toBe('caution')
    const codes = result.reasons.map((r) => r.code)
    expect(codes).toContain('WIND_NOT_CALIBRATED')
    expect(codes).not.toContain('STRONG_GUSTS')
  })

  it('gates on absolute wind once calibration is resolved', () => {
    const hours = buildSeries([{ hour: 8, windSpeedMph: 40, windGustMph: 55 }])
    const result = assessHour(hours, 0, buildContext(CROMWELLS_WIND_CALIBRATED, hours, null))

    expect(result.verdict).toBe('caution')
    expect(result.reasons.map((r) => r.code)).toContain('STRONG_GUSTS')
  })

  it('classifies onshore wind by the beach’s own exposure arc', () => {
    // 180° is straight in off the water at a south-facing beach.
    const onshore = buildSeries([{ hour: 8, windDirectionDeg: 180 }])
    const codes = assessHour(onshore, 0, buildContext(CROMWELLS_WIND_CALIBRATED, onshore, null))
      .reasons.map((r) => r.code)
    expect(codes).toContain('ONSHORE_WIND')
  })

  it('does not call a cross-shore trade wind onshore', () => {
    // 70° is neither offshore-favorable nor blowing in off the south shore, so
    // it should produce no directional reason at all rather than a wrong one.
    const cross = buildSeries([{ hour: 8, windDirectionDeg: 70 }])
    const codes = assessHour(cross, 0, buildContext(CROMWELLS_WIND_CALIBRATED, cross, null))
      .reasons.map((r) => r.code)
    expect(codes).not.toContain('ONSHORE_WIND')
    expect(codes).not.toContain('FAVORABLE_WIND_DIRECTION')
  })
})

describe('assessHour runoff', () => {
  it('blocks a green verdict after heavy rain', () => {
    const hours = buildSeries([
      { hour: 6, precipitationIn: 0.2 },
      { hour: 7, precipitationIn: 0.2 },
      { hour: 8, precipitationIn: 0 },
    ])
    const result = assessHour(hours, 2, buildContext(CROMWELLS_WIND_CALIBRATED, hours, null))

    expect(result.verdict).toBe('caution')
    const rain = result.reasons.find((r) => r.code === 'RECENT_HEAVY_RAIN')
    expect(rain?.detail).toMatch(/0\.40 in over the last 12 h/)
  })

  it('ignores light rain below the threshold', () => {
    const hours = buildSeries([{ hour: 8, precipitationIn: 0.05 }])
    const result = assessHour(hours, 0, buildContext(CROMWELLS_WIND_CALIBRATED, hours, null))
    expect(result.reasons.map((r) => r.code)).not.toContain('RECENT_HEAVY_RAIN')
  })
})

describe('assessHour confidence', () => {
  const context = (hours: ReturnType<typeof buildSeries>) =>
    buildContext(CROMWELLS_WIND_CALIBRATED, hours, null)

  it('is high when everything is measured and fresh', () => {
    const hours = buildSeries([{ hour: 8 }])
    expect(assessHour(hours, 0, context(hours)).confidence).toBe('high')
  })

  it('is low whenever a critical input is missing, since the verdict is then insufficient_data', () => {
    for (const spec of [
      { hour: 8, windSpeedMph: null },
      { hour: 8, exposedSwellHeightFt: null },
      { hour: 8, tideRangeFraction: null },
    ]) {
      const hours = buildSeries([spec])
      const result = assessHour(hours, 0, context(hours))
      expect(result.verdict).toBe('insufficient_data')
      expect(result.confidence).toBe('low')
    }
  })

  it('drops to medium when only a secondary value is missing', () => {
    // Gust is not critical on its own, so the verdict survives — but CoveCheck
    // should not present it as settled.
    const hours = buildSeries([{ hour: 8, windGustMph: null }])
    const result = assessHour(hours, 0, context(hours))
    expect(result.verdict).toBe('great')
    expect(result.confidence).toBe('medium')
  })

  it('is medium while wind calibration is unresolved', () => {
    const hours = buildSeries([{ hour: 8 }])
    const result = assessHour(hours, 0, buildContext(CROMWELLS, hours, null))
    expect(result.verdict).toBe('caution')
    expect(result.confidence).toBe('medium')
  })
})
