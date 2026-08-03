import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CROMWELLS } from './beach/cromwells'
import { exposedSwell, normalizeConditions, type NormalizeInput } from './normalize'
import type { MarineResponse, WeatherResponse } from './providers/open-meteo'
import type { TideExtreme, TidePrediction } from './providers/tides'
import { parseTideHeight } from './providers/tides'

const fixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../fixtures/raw/${name}`, import.meta.url), 'utf-8')) as T

const marine = fixture<MarineResponse>('marine-2026-08-02.json')
const weather = fixture<WeatherResponse>('weather-2026-08-02.json')
const tideHourlyRaw = fixture<{ predictions: { t: string; v: string }[] }>(
  'tides-hourly-2026-08-02.json',
)
const tideHiloRaw = fixture<{ predictions: { t: string; v: string; type: 'H' | 'L' }[] }>(
  'tides-hilo-2026-08-02.json',
)

const tidePredictions: TidePrediction[] = tideHourlyRaw.predictions.map((p) => ({
  timestamp: p.t,
  heightFt: parseTideHeight(p.v),
}))
const tideExtremes: TideExtreme[] = tideHiloRaw.predictions.map((p) => ({
  timestamp: p.t,
  heightFt: parseTideHeight(p.v),
  kind: p.type === 'H' ? 'high' : 'low',
}))

const FETCHED_AT = '2026-08-02T17:05:00.000Z'
const NOW = new Date('2026-08-02T17:10:00.000Z')

function baseInput(overrides: Partial<NormalizeInput> = {}): NormalizeInput {
  return {
    profile: CROMWELLS,
    marine: { status: 'ok', data: marine, fetchedAtUtc: FETCHED_AT },
    weather: { status: 'ok', data: weather, fetchedAtUtc: FETCHED_AT },
    tideHourly: { status: 'ok', data: { predictions: tidePredictions }, fetchedAtUtc: FETCHED_AT },
    tideExtremes: { status: 'ok', data: { extremes: tideExtremes }, fetchedAtUtc: FETCHED_AT },
    alerts: { status: 'ok', data: { hazards: [] }, fetchedAtUtc: FETCHED_AT },
    nowUtc: NOW,
    ...overrides,
  }
}

describe('exposedSwell', () => {
  it('counts a south swell inside the exposure window', () => {
    const result = exposedSwell(
      [{ partition: 'swell', heightFt: 3, directionDeg: 190 }],
      CROMWELLS,
    )
    expect(result.heightFt).toBeCloseTo(3, 6)
    expect(result.counted).toHaveLength(1)
  })

  it('discards the trade-wind easterly that would otherwise dominate', () => {
    // The August 2026 case: 0.68 m primary swell from 83°, plus east windswell.
    const result = exposedSwell(
      [
        { partition: 'swell', heightFt: 2.2, directionDeg: 83 },
        { partition: 'wind_wave', heightFt: 4.0, directionDeg: 104 },
      ],
      CROMWELLS,
    )
    expect(result.heightFt).toBe(0)
    expect(result.counted).toEqual([])
  })

  it('admits partitions independently rather than gating on the total', () => {
    // A big east windswell alongside a small south swell must yield the south
    // swell's height, not the combined sea state.
    const result = exposedSwell(
      [
        { partition: 'swell', heightFt: 1, directionDeg: 180 },
        { partition: 'wind_wave', heightFt: 4, directionDeg: 90 },
      ],
      CROMWELLS,
    )
    expect(result.heightFt).toBeCloseTo(1, 6)
    expect(result.counted.map((p) => p.partition)).toEqual(['swell'])
  })

  it('combines two in-window partitions in quadrature', () => {
    const result = exposedSwell(
      [
        { partition: 'swell', heightFt: 2, directionDeg: 170 },
        { partition: 'wind_wave', heightFt: 2, directionDeg: 200 },
      ],
      CROMWELLS,
    )
    expect(result.heightFt).toBeCloseTo(2.828, 3)
  })

  it('returns null, not 0, when nothing is measurable', () => {
    // "No data" and "flat calm" must never be the same value.
    const result = exposedSwell(
      [
        { partition: 'swell', heightFt: null, directionDeg: null },
        { partition: 'wind_wave', heightFt: null, directionDeg: 120 },
      ],
      CROMWELLS,
    )
    expect(result.heightFt).toBeNull()
  })

  it('ignores a partition with a height but no direction', () => {
    // Without a direction there is no way to know whether it reaches the beach.
    const result = exposedSwell(
      [{ partition: 'swell', heightFt: 5, directionDeg: null }],
      CROMWELLS,
    )
    expect(result.heightFt).toBeNull()
  })
})

describe('normalizeConditions against the real 2026-08-02 payloads', () => {
  const { hours, warnings } = normalizeConditions(baseInput())

  it('produces a full 7-day hourly series with no warnings', () => {
    expect(hours).toHaveLength(168)
    expect(warnings).toEqual([])
  })

  it('aligns the marine and weather grids on every hour', () => {
    expect(hours.every((h) => h.windSpeedMph !== null)).toBe(true)
    expect(hours.every((h) => h.modelSigWaveHeightFt !== null)).toBe(true)
  })

  /**
   * The regression this whole phase exists to prevent.
   *
   * Raw model height on the morning of 2026-08-02 was ~4.6 ft, which lands in the
   * spec's 4-6 ft "not recommended" band. The direction-filtered figure is ~0 ft,
   * consistent with NWS's 1-3 ft south-facing surf. If these two ever converge,
   * the exposure filter has stopped working and the product will read red on an
   * ordinary trade-wind morning.
   */
  it('separates raw model height from direction-filtered exposed height', () => {
    const morning = hours.find((h) => h.timestamp === '2026-08-02T08:00')!

    expect(morning.modelSigWaveHeightFt).toBeGreaterThan(4)
    expect(morning.modelSigWaveDirectionDeg).toBeGreaterThan(60)
    expect(morning.modelSigWaveDirectionDeg).toBeLessThan(135)

    expect(morning.exposedSwellHeightFt).toBe(0)
    expect(morning.exposedPartitions).toEqual([])
  })

  it('keeps the raw model height out of any field a threshold would reach for', () => {
    const morning = hours[8]
    // There is deliberately no `waveHeightFt` on the model — see lib/types.ts.
    expect('waveHeightFt' in morning).toBe(false)
  })

  it('carries tide height, stage and range fraction', () => {
    const morning = hours.find((h) => h.timestamp === '2026-08-02T07:00')!
    expect(morning.tideHeightFt).toBeGreaterThan(1)
    expect(morning.tideStage).toBe('near-high')
    expect(morning.tideRangeFraction).toBeGreaterThan(0.5)
  })

  it('marks every source fresh at evaluation time', () => {
    const freshness = hours[0].sourceFreshness
    expect(freshness.marine?.status).toBe('ok')
    expect(freshness.weather?.status).toBe('ok')
    expect(freshness.alerts?.status).toBe('ok')
    expect(freshness.marine?.ageSeconds).toBe(300)
  })

  it('records local and UTC timestamps consistently', () => {
    const first = hours[0]
    expect(first.timestamp).toBe('2026-08-02T00:00')
    expect(first.timestampUtc).toBe('2026-08-02T10:00:00.000Z')
  })
})

describe('normalizeConditions with degraded inputs', () => {
  it('marks a source stale once past its limit instead of silently using it', () => {
    const { hours } = normalizeConditions(
      baseInput({
        alerts: { status: 'ok', data: { hazards: [] }, fetchedAtUtc: '2026-08-02T16:00:00.000Z' },
      }),
    )
    // Alerts go stale after 30 minutes; this one is 70 minutes old.
    expect(hours[0].sourceFreshness.alerts?.status).toBe('stale')
    expect(hours[0].sourceFreshness.alerts?.ageSeconds).toBe(4200)
  })

  it('keeps wave fields null when marine fails rather than defaulting them', () => {
    const { hours, warnings } = normalizeConditions(
      baseInput({ marine: { status: 'failed', fetchedAtUtc: FETCHED_AT } }),
    )
    // The weather grid becomes the spine so wind is still usable.
    expect(hours).toHaveLength(168)
    expect(hours[0].modelSigWaveHeightFt).toBeNull()
    expect(hours[0].exposedSwellHeightFt).toBeNull()
    expect(hours[0].windSpeedMph).not.toBeNull()
    expect(warnings.some((w) => /marine data unavailable/.test(w))).toBe(true)
  })

  it('flags unknown hazard state as distinct from "no hazards"', () => {
    const { hours, warnings } = normalizeConditions(
      baseInput({ alerts: { status: 'failed', fetchedAtUtc: FETCHED_AT } }),
    )
    expect(hours[0].activeHazards).toEqual([])
    expect(hours[0].sourceFreshness.alerts?.status).toBe('failed')
    expect(warnings.some((w) => /hazard state unknown/.test(w))).toBe(true)
  })

  it('reports tide stage as unknown when extremes are unavailable', () => {
    const { hours, warnings } = normalizeConditions(
      baseInput({ tideExtremes: { status: 'failed', fetchedAtUtc: FETCHED_AT } }),
    )
    expect(hours[0].tideStage).toBe('unknown')
    expect(hours[0].tideRangeFraction).toBeNull()
    expect(warnings.some((w) => /no tide extremes/.test(w))).toBe(true)
  })

  it('returns no hours when both grids are gone', () => {
    const { hours, warnings } = normalizeConditions(
      baseInput({
        marine: { status: 'failed', fetchedAtUtc: FETCHED_AT },
        weather: { status: 'failed', fetchedAtUtc: FETCHED_AT },
      }),
    )
    expect(hours).toEqual([])
    expect(warnings.some((w) => /no hourly spine/.test(w))).toBe(true)
  })

  it('propagates an active hazard onto every hour', () => {
    const { hours } = normalizeConditions(
      baseInput({
        alerts: {
          status: 'ok',
          fetchedAtUtc: FETCHED_AT,
          data: {
            hazards: [
              {
                event: 'High Surf Advisory',
                severity: 'advisory',
                headline: 'High Surf Advisory in effect',
                onsetUtc: null,
                endsUtc: null,
                isBlocking: true,
              },
            ],
          },
        },
      }),
    )
    expect(hours[0].activeHazards[0]?.isBlocking).toBe(true)
  })
})
