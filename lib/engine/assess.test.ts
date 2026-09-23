import { describe, expect, it } from 'vitest'
import { CROMWELLS } from '../beach/cromwells'
import {
  assessHour,
  buildContext,
  hasProvisionalTideCalibration,
  hasUnresolvedTideCalibration,
  hasUnresolvedWindCalibration,
  percentileOf,
  recentRainInches,
} from './assess'
import { buildSeries, CROMWELLS_FULLY_CALIBRATED, HIGH_SURF_ADVISORY } from './fixtures'

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

describe('calibration gap detection', () => {
  it('reports the real profile as wind-calibrated and tide-provisional', () => {
    // Both were anchored to the same single in-water observation. Tide's band is
    // provisional: it gates verdicts, but is not treated as calibrated.
    expect(hasUnresolvedWindCalibration(CROMWELLS)).toBe(false)
    expect(hasUnresolvedTideCalibration(CROMWELLS)).toBe(false)
    expect(hasProvisionalTideCalibration(CROMWELLS)).toBe(true)
  })

  it('does not treat a provisional gap as unresolved, or vice versa', () => {
    // The distinction is load-bearing: unresolved means "do not gate at all",
    // provisional means "gate, but keep saying the basis is thin".
    expect(hasProvisionalTideCalibration(CROMWELLS_FULLY_CALIBRATED)).toBe(false)
    const unset = {
      ...CROMWELLS,
      calibration: CROMWELLS.calibration.map((gap) =>
        gap.affectedThresholds.some((t) => t.includes('Tide'))
          ? { ...gap, status: 'unresolved' as const }
          : gap,
      ),
    }
    expect(hasUnresolvedTideCalibration(unset)).toBe(true)
    expect(hasProvisionalTideCalibration(unset)).toBe(false)
  })

  it('is false for both once every gap is resolved', () => {
    expect(hasUnresolvedWindCalibration(CROMWELLS_FULLY_CALIBRATED)).toBe(false)
    expect(hasUnresolvedTideCalibration(CROMWELLS_FULLY_CALIBRATED)).toBe(false)
  })

  it('matches on the affected threshold, not the gap id', () => {
    const profile = {
      ...CROMWELLS,
      calibration: [
        {
          id: 'something-unrelated',
          providerObservation: '',
          referenceObservation: '',
          affectedThresholds: ['thresholds.windSpeedMph.offshore'],
          status: 'unresolved' as const,
          note: '',
        },
      ],
    }
    expect(hasUnresolvedWindCalibration(profile)).toBe(true)
    expect(hasUnresolvedTideCalibration(profile)).toBe(false)
  })
})

describe('assessHour precedence', () => {
  const assess = (hours: ReturnType<typeof buildSeries>, profile = CROMWELLS_FULLY_CALIBRATED) =>
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
    const hours = buildSeries([{ hour: 8, tideHeightFt: null }])
    expect(assess(hours).verdict).toBe('insufficient_data')
  })

  it('never rates an hour great with any incomplete critical input', () => {
    const incomplete = [
      { hour: 8, exposedSwellHeightFt: null },
      { hour: 8, windSpeedMph: null },
      { hour: 8, tideHeightFt: null },
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
    const uncalibrated = {
      ...CROMWELLS,
      calibration: CROMWELLS.calibration.map((gap) =>
        gap.affectedThresholds.some((t) => t.includes('wind'))
          ? { ...gap, status: 'unresolved' as const }
          : gap,
      ),
    }
    // 40 mph at the model cell. With the gap open the engine reports it but
    // refuses to treat it as a measured gust, capping at caution instead.
    const hours = buildSeries([{ hour: 8, windSpeedMph: 40, windGustMph: 55 }])
    const result = assessHour(hours, 0, buildContext(uncalibrated, hours, null))

    expect(result.verdict).toBe('caution')
    const codes = result.reasons.map((r) => r.code)
    expect(codes).toContain('WIND_NOT_CALIBRATED')
    expect(codes).not.toContain('STRONG_GUSTS')
  })

  it('gates on absolute wind once calibration is resolved', () => {
    const hours = buildSeries([{ hour: 8, windSpeedMph: 40, windGustMph: 55 }])
    const result = assessHour(hours, 0, buildContext(CROMWELLS_FULLY_CALIBRATED, hours, null))

    expect(result.verdict).toBe('caution')
    expect(result.reasons.map((r) => r.code)).toContain('STRONG_GUSTS')
  })

  it('classifies onshore wind by the beach’s own exposure arc', () => {
    // 180° is straight in off the water at a south-facing beach.
    const onshore = buildSeries([{ hour: 8, windDirectionDeg: 180 }])
    const codes = assessHour(onshore, 0, buildContext(CROMWELLS_FULLY_CALIBRATED, onshore, null))
      .reasons.map((r) => r.code)
    expect(codes).toContain('ONSHORE_WIND')
  })

  it('classifies a due-east wind as cross-shore, neither favourable nor onshore', () => {
    // 90° is exactly alongshore at a south-facing beach, so it earns no
    // directional reason either way — and is gated with the stricter onshore
    // limits, since alongshore fetch can still build chop.
    const cross = buildSeries([{ hour: 8, windDirectionDeg: 90 }])
    const codes = assessHour(cross, 0, buildContext(CROMWELLS_FULLY_CALIBRATED, cross, null))
      .reasons.map((r) => r.code)
    expect(codes).not.toContain('ONSHORE_WIND')
    expect(codes).not.toContain('FAVORABLE_WIND_DIRECTION')
  })
})

/**
 * The band between this beach's `great` ceiling and its `caution` ceiling.
 *
 * Before MARGINAL_WIND this band emitted no wind reason of any kind, so the hour
 * resolved to `great` and its reason list said nothing about the wind at all.
 * The only wind-magnitude cases previously covered here were 40 mph / 55 mph —
 * both well above `caution` — and `null`, which is exactly why the gap survived.
 *
 * Offshore ceilings at Cromwell's: sustained great 25 / caution 32, gusts great
 * 31 / caution 40. Onshore: sustained 8 / 12, gusts 12 / 18.
 */
describe('assessHour marginal wind', () => {
  const codesOf = (hours: ReturnType<typeof buildSeries>) =>
    assessHour(hours, 0, buildContext(CROMWELLS_FULLY_CALIBRATED, hours, null)).reasons.map(
      (r) => r.code,
    )

  const assess = (spec: Parameters<typeof buildSeries>[0][number]) => {
    const hours = buildSeries([spec])
    return assessHour(hours, 0, buildContext(CROMWELLS_FULLY_CALIBRATED, hours, null))
  }

  it('says the wind out loud for the case measured on production', () => {
    // 2026-09-24T18:00 as served by the live site: 30.0 mph sustained with
    // 38.7 mph gusts, offshore, rendering `great` with `FAVORABLE_WIND_DIRECTION`
    // as its only wind reason. See PR #19.
    const result = assess({ hour: 8, windSpeedMph: 30, windGustMph: 38.7, windDirectionDeg: 350 })
    const marginal = result.reasons.find((r) => r.code === 'MARGINAL_WIND')

    expect(marginal).toBeDefined()
    expect(marginal?.detail).toBe('30 mph sustained, gusts to 39 mph')
    expect(marginal?.severity).toBe('caveat')
  })

  it('leaves the verdict green and drops confidence to medium', () => {
    // This is what option B on PR #19's decision card chose, and what it did NOT
    // choose: the hour is no longer silent about the wind, and it still reads
    // "Great window". Changing that is a separate calibration decision.
    const result = assess({ hour: 8, windSpeedMph: 30, windGustMph: 38.7, windDirectionDeg: 350 })

    expect(result.verdict).toBe('great')
    expect(result.confidence).toBe('medium')
  })

  it('fires on either measure alone, carrying only the number that applies', () => {
    const sustainedOnly = assess({ hour: 8, windSpeedMph: 30, windGustMph: 20 })
    expect(sustainedOnly.reasons.find((r) => r.code === 'MARGINAL_WIND')?.detail).toBe(
      '30 mph sustained',
    )

    const gustOnly = assess({ hour: 8, windSpeedMph: 20, windGustMph: 39 })
    expect(gustOnly.reasons.find((r) => r.code === 'MARGINAL_WIND')?.detail).toBe(
      'gusts to 39 mph',
    )
    // The sustained figure is genuinely calm, so it keeps saying so.
    expect(gustOnly.reasons.map((r) => r.code)).toContain('CALM_WIND')
  })

  it('stays silent at or below the great ceiling, on both measures', () => {
    const atCeiling = assess({ hour: 8, windSpeedMph: 25, windGustMph: 31 })
    expect(atCeiling.reasons.map((r) => r.code)).not.toContain('MARGINAL_WIND')
    expect(atCeiling.verdict).toBe('great')
    expect(atCeiling.confidence).toBe('high')
  })

  it('hands over to STRONG_GUSTS strictly above the caution ceiling', () => {
    // At the ceiling exactly, still marginal — the existing comparisons are `>`.
    const atCaution = assess({ hour: 8, windSpeedMph: 32, windGustMph: 40 })
    expect(atCaution.reasons.map((r) => r.code)).toContain('MARGINAL_WIND')
    expect(atCaution.reasons.map((r) => r.code)).not.toContain('STRONG_GUSTS')
    expect(atCaution.verdict).toBe('great')

    const above = assess({ hour: 8, windSpeedMph: 33, windGustMph: 41 })
    expect(above.reasons.map((r) => r.code)).toContain('STRONG_GUSTS')
    expect(above.reasons.map((r) => r.code)).not.toContain('MARGINAL_WIND')
    expect(above.verdict).toBe('caution')
  })

  it('uses the onshore ceilings when the wind is not offshore', () => {
    // 180° is straight off the water: great 8 / caution 12 sustained. 10 mph is
    // marginal there and squarely calm offshore, so this proves the band is read
    // from the direction-selected limits rather than a fixed pair.
    const onshore = codesOf(buildSeries([{ hour: 8, windSpeedMph: 10, windGustMph: 14, windDirectionDeg: 180 }]))
    expect(onshore).toContain('MARGINAL_WIND')

    const offshore = codesOf(buildSeries([{ hour: 8, windSpeedMph: 10, windGustMph: 14, windDirectionDeg: 350 }]))
    expect(offshore).not.toContain('MARGINAL_WIND')
    expect(offshore).toContain('CALM_WIND')
  })

  it('does not fire while wind calibration is unresolved', () => {
    // With the gap open the engine must not compare raw provider wind against
    // shoreline-referenced ceilings at all — including these ones.
    const uncalibrated = {
      ...CROMWELLS,
      calibration: CROMWELLS.calibration.map((gap) =>
        gap.affectedThresholds.some((t) => t.includes('wind'))
          ? { ...gap, status: 'unresolved' as const }
          : gap,
      ),
    }
    const hours = buildSeries([{ hour: 8, windSpeedMph: 30, windGustMph: 38.7 }])
    const codes = assessHour(hours, 0, buildContext(uncalibrated, hours, null)).reasons.map(
      (r) => r.code,
    )
    expect(codes).toContain('WIND_NOT_CALIBRATED')
    expect(codes).not.toContain('MARGINAL_WIND')
  })

  it('never changes a verdict, across every reachable wind and gust combination', () => {
    // The load-bearing claim of this change, checked by execution rather than by
    // reading: re-resolving each hour from its reasons with every MARGINAL_WIND
    // removed must produce the same verdict it already has. Sweeps both
    // exposures, both null gusts and measured ones, and every band boundary on
    // both measures.
    const speeds = [null, 0, 7, 8, 9, 12, 13, 24, 25, 26, 31, 32, 33, 40]
    const gusts = [null, 0, 11, 12, 13, 17, 18, 19, 30, 31, 32, 39, 40, 41, 55]
    const directions = [350, 180, 90]

    let marginalHours = 0
    for (const windSpeedMph of speeds) {
      for (const windGustMph of gusts) {
        for (const windDirectionDeg of directions) {
          const result = assess({ hour: 8, windSpeedMph, windGustMph, windDirectionDeg })
          const withoutMarginal = result.reasons.filter((r) => r.code !== 'MARGINAL_WIND')
          if (withoutMarginal.length !== result.reasons.length) marginalHours += 1

          const severities = new Set(withoutMarginal.map((r) => r.severity))
          const expected = severities.has('blocker')
            ? 'not_recommended'
            : severities.has('disqualifying')
              ? 'insufficient_data'
              : severities.has('negative')
                ? 'caution'
                : 'great'

          expect(
            result.verdict,
            `${windSpeedMph} mph / ${windGustMph} gust / ${windDirectionDeg}° changed verdict`,
          ).toBe(expected)
        }
      }
    }

    // Guard against the sweep passing vacuously because nothing ever fired.
    expect(marginalHours).toBeGreaterThan(0)
  })
})

describe('assessHour runoff', () => {
  it('blocks a green verdict after heavy rain', () => {
    const hours = buildSeries([
      { hour: 6, precipitationIn: 0.2 },
      { hour: 7, precipitationIn: 0.2 },
      { hour: 8, precipitationIn: 0 },
    ])
    const result = assessHour(hours, 2, buildContext(CROMWELLS_FULLY_CALIBRATED, hours, null))

    expect(result.verdict).toBe('caution')
    const rain = result.reasons.find((r) => r.code === 'RECENT_HEAVY_RAIN')
    expect(rain?.detail).toMatch(/0\.40 in over the last 12 h/)
  })

  it('ignores light rain below the threshold', () => {
    const hours = buildSeries([{ hour: 8, precipitationIn: 0.05 }])
    const result = assessHour(hours, 0, buildContext(CROMWELLS_FULLY_CALIBRATED, hours, null))
    expect(result.reasons.map((r) => r.code)).not.toContain('RECENT_HEAVY_RAIN')
  })
})

describe('assessHour confidence', () => {
  const context = (hours: ReturnType<typeof buildSeries>) =>
    buildContext(CROMWELLS_FULLY_CALIBRATED, hours, null)

  it('is high when everything is measured and fresh', () => {
    const hours = buildSeries([{ hour: 8 }])
    expect(assessHour(hours, 0, context(hours)).confidence).toBe('high')
  })

  it('is low whenever a critical input is missing, since the verdict is then insufficient_data', () => {
    for (const spec of [
      { hour: 8, windSpeedMph: null },
      { hour: 8, exposedSwellHeightFt: null },
      { hour: 8, tideHeightFt: null },
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

  it('is medium while the tide band is provisional, without capping the verdict', () => {
    // The band gates the verdict, so a favourable tide contributes — but a single
    // observation is not grounds for high confidence.
    const hours = buildSeries([{ hour: 8, tideHeightFt: 1.0 }])
    const result = assessHour(hours, 0, buildContext(CROMWELLS, hours, null))
    expect(result.verdict).toBe('great')
    expect(result.confidence).toBe('medium')
    const codes = result.reasons.map((r) => r.code)
    expect(codes).toContain('FAVORABLE_TIDE')
    expect(codes).toContain('TIDE_BAND_PROVISIONAL')
  })

  it('gates on the provisional band at both ends', () => {
    const context = (hours: ReturnType<typeof buildSeries>) => buildContext(CROMWELLS, hours, null)

    // Above the 1.5 ft upper edge: less shallow standing area, stronger current.
    const high = buildSeries([{ hour: 8, tideHeightFt: 1.9 }])
    const highResult = assessHour(high, 0, context(high))
    expect(highResult.verdict).toBe('caution')
    expect(highResult.reasons.map((r) => r.code)).toContain('HIGH_TIDE_LESS_SHALLOW')

    // Below the 0 ft lower edge: reef and rock exposed.
    const low = buildSeries([{ hour: 8, tideHeightFt: -0.3 }])
    const lowResult = assessHour(low, 0, context(low))
    expect(lowResult.verdict).toBe('caution')
    expect(lowResult.reasons.map((r) => r.code)).toContain('LOW_TIDE_OVER_REEF')
  })

  it('keeps the provisional caveat visible even on an all-positive day', () => {
    // mergeReasons sorts caveats ahead of positives, so the thin basis reaches the
    // verdict bullets rather than being buried under the good news.
    const hours = buildSeries([{ hour: 8, tideHeightFt: 1.0 }])
    const result = assessHour(hours, 0, buildContext(CROMWELLS, hours, null))
    const provisional = result.reasons.find((r) => r.code === 'TIDE_BAND_PROVISIONAL')
    expect(provisional?.severity).toBe('caveat')
    expect(provisional?.detail).toMatch(/band 0-1\.5 ft from 1 observation/)
  })
})
