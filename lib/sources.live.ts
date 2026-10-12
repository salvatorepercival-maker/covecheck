import { describe, expect, it } from 'vitest'
import { CROMWELLS } from './beach/cromwells'
import { fetchWaterQuality } from './providers/doh'
import { fetchRainHistory, fetchWeather } from './providers/open-meteo'

/**
 * Live health checks for the conditions-report sources (`npm run spike` runs
 * every *.live.ts; `npx vitest run --config vitest.live.config.mts
 * lib/sources.live.ts` runs just these).
 *
 * Each source fails LOUDLY here. On the site they degrade to "Couldn't check" /
 * "—" so a page still renders, which is why a failure needs to be visible here.
 */
describe('conditions sources', () => {
  it('Health Dept. water-quality advisories are reachable and parse', async () => {
    const result = await fetchWaterQuality({ latitude: CROMWELLS.latitude, longitude: CROMWELLS.longitude })
    if (!result.ok) console.error('DOH water quality FAILED:', result.error)
    expect(result.ok).toBe(true)
    if (result.ok) console.log(`DOH: ${result.data.openOnIsland} open on Oahu, ${result.data.nearby.length} within ${result.data.radiusKm} km`)
  })

  it('UV index is present in the weather feed', async () => {
    const result = await fetchWeather(CROMWELLS.cells.weather, CROMWELLS.timezone)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const uv = result.data.hourly.uv_index ?? []
    expect(uv.filter((v) => v !== null).length, 'uv_index missing or all null').toBeGreaterThan(24)
    expect(Math.max(...uv.map((v) => v ?? 0)), 'no daytime UV at all').toBeGreaterThan(0)
  })

  it('48-hour rain history is present', async () => {
    const result = await fetchRainHistory(CROMWELLS.cells.weather, CROMWELLS.timezone)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.hourly.precipitation.filter((v) => v !== null).length).toBeGreaterThanOrEqual(48)
  })
})

describe('buoy', () => {
  it('NDBC 51211 is reporting', async () => {
    const { fetchBuoy, BUOY_STALE_MINUTES } = await import('./providers/buoy')
    const result = await fetchBuoy()
    if (!result.ok) console.error('Buoy FAILED:', result.error)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const age = (Date.now() - Date.parse(result.data.observedUtc)) / 60_000
    console.log(`Buoy 51211: ${result.data.swellHeightFt} ft at ${result.data.swellPeriodSec} s from ${result.data.swellFromText}, ${Math.round(age)} min old`)
    expect(age).toBeLessThan(BUOY_STALE_MINUTES)
  })
})
