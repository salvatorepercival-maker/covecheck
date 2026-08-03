import { describe, expect, it } from 'vitest'
import { CROMWELLS } from './beach/cromwells'
import { CROMWELLS_WIND_CALIBRATED } from './engine/fixtures'
import { evaluateForecast } from './engine'
import { normalizeConditions } from './normalize'
import { fetchAlerts } from './providers/alerts'
import { fetchMarine, fetchWeather } from './providers/open-meteo'
import { fetchSurfZoneForecast } from './providers/srf'
import { fetchTideExtremes, fetchTideHourly } from './providers/tides'
import { honoluluDateOf, honoluluHourOf, utcToHonoluluLocal } from './time'
import type { BeachProfile } from './types'

/**
 * Temporary diagnostic: why is every day "use caution"?
 *
 * Counts which reasons actually cap each usable hour, then re-runs the engine
 * with each suspected cause removed to see what it would take to reach "great".
 */
describe('diagnose caution-everywhere', () => {
  it('attributes the cap', async () => {
    const nowUtc = new Date()
    const today = honoluluDateOf(utcToHonoluluLocal(nowUtc))
    const endDate = honoluluDateOf(utcToHonoluluLocal(new Date(nowUtc.getTime() + 6 * 86_400_000)))

    const [marine, weather, tideHourly, tideExtremes, alerts, srf] = await Promise.all([
      fetchMarine(CROMWELLS.cells.marine, CROMWELLS.timezone),
      fetchWeather(CROMWELLS.cells.weather, CROMWELLS.timezone),
      fetchTideHourly(CROMWELLS.tideStationId, today, endDate),
      fetchTideExtremes(CROMWELLS.tideStationId, today, endDate),
      fetchAlerts(CROMWELLS.latitude, CROMWELLS.longitude),
      fetchSurfZoneForecast(CROMWELLS.srfIsland),
    ])
    expect(marine.ok && weather.ok && tideHourly.ok && tideExtremes.ok && alerts.ok).toBe(true)
    if (!marine.ok || !weather.ok || !tideHourly.ok || !tideExtremes.ok || !alerts.ok) return

    const { hours } = normalizeConditions({
      profile: CROMWELLS,
      marine: { status: 'ok', data: marine.data, fetchedAtUtc: marine.fetchedAtUtc },
      weather: { status: 'ok', data: weather.data, fetchedAtUtc: weather.fetchedAtUtc },
      tideHourly: { status: 'ok', data: tideHourly.data, fetchedAtUtc: tideHourly.fetchedAtUtc },
      tideExtremes: { status: 'ok', data: tideExtremes.data, fetchedAtUtc: tideExtremes.fetchedAtUtc },
      alerts: { status: 'ok', data: alerts.data, fetchedAtUtc: alerts.fetchedAtUtc },
      nowUtc,
    })

    const forecast = srf.ok ? srf.data.forecast : null
    console.log('\n=== NWS south-facing bands (the magnitude bound) ===')
    for (const band of forecast?.bands.filter((b) => b.shore === 'south') ?? []) {
      console.log(`  ${band.column.padEnd(14)} ${band.minFt}-${band.maxFt} ft`)
    }
    console.log(`  threshold: great <= ${CROMWELLS.thresholds.srfSurfFaceFt.great} ft, caution <= ${CROMWELLS.thresholds.srfSurfFaceFt.caution} ft`)

    const usable = (h: { timestamp: string }) => {
      const local = honoluluHourOf(h.timestamp)
      return local >= 6 && local <= 18
    }

    const scenario = (label: string, profile: BeachProfile, srfIn: typeof forecast) => {
      const result = evaluateForecast({ profile, hours, surfZoneForecast: srfIn, nowUtc })
      const usableHours = result.hours.filter(usable)
      const counts = new Map<string, number>()
      for (const hour of usableHours) {
        for (const r of hour.reasons) {
          if (r.severity === 'negative' || r.severity === 'blocker' || r.severity === 'disqualifying') {
            counts.set(r.code, (counts.get(r.code) ?? 0) + 1)
          }
        }
      }
      const great = usableHours.filter((h) => h.verdict === 'great').length
      console.log(`\n--- ${label} ---`)
      console.log(`  great hours: ${great} / ${usableHours.length}`)
      console.log(`  great days:  ${result.days.filter((d) => d.verdict === 'great').length} / ${result.days.length}`)
      for (const [code, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${code.padEnd(22)} caps ${n} hours`)
      }
    }

    scenario('AS SHIPPED (wind uncalibrated, SRF bound on)', CROMWELLS, forecast)
    scenario('if wind were calibrated', CROMWELLS_WIND_CALIBRATED, forecast)
    scenario('if SRF bound removed (wind still uncalibrated)', CROMWELLS, null)
    scenario('if BOTH resolved', CROMWELLS_WIND_CALIBRATED, null)

    // What the actual swell reaching the beach looks like, for context.
    const exposed = hours.filter(usable).map((h) => h.exposedSwellHeightFt ?? 0)
    console.log(
      `\n=== exposed swell across usable hours: min ${Math.min(...exposed).toFixed(1)} ft, max ${Math.max(...exposed).toFixed(1)} ft, mean ${(exposed.reduce((a, b) => a + b, 0) / exposed.length).toFixed(2)} ft ===`,
    )
    console.log(`  threshold: great <= ${CROMWELLS.thresholds.exposedSwellFt.great} ft\n`)
  })
})
