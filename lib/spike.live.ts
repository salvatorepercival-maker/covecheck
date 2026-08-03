import { describe, expect, it } from 'vitest'
import { CROMWELLS } from './beach/cromwells'
import { evaluateForecast, VERDICT_LABEL } from './engine'
import { normalizeConditions } from './normalize'
import { honoluluDateOf, utcToHonoluluLocal } from './time'
import { fetchAlerts } from './providers/alerts'
import { checkResolvedCell, fetchMarine, fetchWeather } from './providers/open-meteo'
import { bandsForShore, fetchSurfZoneForecast } from './providers/srf'
import { fetchTideExtremes, fetchTideHourly } from './providers/tides'

/**
 * Live end-to-end spike against the real providers. Run with `npm run spike`.
 *
 * This exists because fixtures cannot catch the failure mode that shaped this
 * whole phase: a provider quietly relocating our sample point or changing units
 * while still returning a valid 200. It asserts the invariants that must hold for
 * the product to be correct, and prints normalized output for eyeballing.
 */

const line = (label: string, value: unknown) => console.log(`  ${label.padEnd(26)} ${value}`)

describe('live provider spike — Cromwell\'s Beach', () => {
  it('fetches, normalizes and cross-checks every source', async () => {
    const nowUtc = new Date()
    const today = honoluluDateOf(utcToHonoluluLocal(nowUtc))
    const endDate = honoluluDateOf(
      utcToHonoluluLocal(new Date(nowUtc.getTime() + 6 * 86_400_000)),
    )

    const [marine, weather, tideHourly, tideExtremes, alerts, srf] = await Promise.all([
      fetchMarine(CROMWELLS.cells.marine, CROMWELLS.timezone),
      fetchWeather(CROMWELLS.cells.weather, CROMWELLS.timezone),
      fetchTideHourly(CROMWELLS.tideStationId, today, endDate),
      fetchTideExtremes(CROMWELLS.tideStationId, today, endDate),
      fetchAlerts(CROMWELLS.latitude, CROMWELLS.longitude),
      fetchSurfZoneForecast(CROMWELLS.srfIsland),
    ])

    console.log('\n=== provider status ===')
    for (const [name, result] of [
      ['marine', marine],
      ['weather', weather],
      ['tides (hourly)', tideHourly],
      ['tides (hi/lo)', tideExtremes],
      ['alerts', alerts],
      ['srf', srf],
    ] as const) {
      line(name, result.ok ? 'ok' : `FAILED — ${result.error.kind}: ${result.error.message}`)
    }

    // Every provider must be reachable for the spike to mean anything.
    expect(marine.ok, 'marine fetch failed').toBe(true)
    expect(weather.ok, 'weather fetch failed').toBe(true)
    expect(tideHourly.ok, 'tide hourly fetch failed').toBe(true)
    expect(tideExtremes.ok, 'tide extremes fetch failed').toBe(true)
    expect(alerts.ok, 'alerts fetch failed').toBe(true)
    if (!marine.ok || !weather.ok || !tideHourly.ok || !tideExtremes.ok || !alerts.ok) return

    // --- The pinned cells must still be the cells we calibrated against. ---
    console.log('\n=== resolved grid cells ===')
    const marineDrift = checkResolvedCell(CROMWELLS.cells.marine, marine.data)
    const weatherDrift = checkResolvedCell(CROMWELLS.cells.weather, weather.data)
    line('marine', `${marine.data.latitude}/${marine.data.longitude} elev ${marine.data.elevation} m`)
    line('weather', `${weather.data.latitude}/${weather.data.longitude} elev ${weather.data.elevation} m`)
    expect(marineDrift, `marine cell drifted: ${marineDrift}`).toBeNull()
    expect(weatherDrift, `weather cell drifted: ${weatherDrift}`).toBeNull()

    // --- Units must be imperial. Metric numbers under imperial thresholds would
    //     read as implausibly calm and could produce a false green. ---
    console.log('\n=== units ===')
    line('wave_height', marine.data.hourly_units.wave_height)
    line('wind_speed_10m', weather.data.hourly_units.wind_speed_10m)
    line('precipitation', weather.data.hourly_units.precipitation)
    expect(marine.data.hourly_units.wave_height).toBe('ft')
    expect(marine.data.hourly_units.swell_wave_height).toBe('ft')
    expect(weather.data.hourly_units.wind_speed_10m).toBe('mp/h')
    expect(weather.data.hourly_units.precipitation).toBe('inch')

    const { hours, warnings } = normalizeConditions({
      profile: CROMWELLS,
      marine: { status: 'ok', data: marine.data, fetchedAtUtc: marine.fetchedAtUtc },
      weather: { status: 'ok', data: weather.data, fetchedAtUtc: weather.fetchedAtUtc },
      tideHourly: { status: 'ok', data: tideHourly.data, fetchedAtUtc: tideHourly.fetchedAtUtc },
      tideExtremes: { status: 'ok', data: tideExtremes.data, fetchedAtUtc: tideExtremes.fetchedAtUtc },
      alerts: { status: 'ok', data: alerts.data, fetchedAtUtc: alerts.fetchedAtUtc },
      nowUtc,
    })

    expect(hours.length).toBeGreaterThan(24)

    console.log('\n=== normalized sample (next 8 hours) ===')
    console.log(
      '  time              modelSig  exposed  wind/gust    tide  stage       counted',
    )
    const startIndex = Math.max(
      0,
      hours.findIndex((h) => h.timestampUtc >= nowUtc.toISOString()),
    )
    for (const hour of hours.slice(startIndex, startIndex + 8)) {
      const counted =
        hour.exposedPartitions.map((p) => `${p.partition}@${p.directionDeg}°`).join(' + ') || '—'
      console.log(
        [
          ` ${hour.timestamp}`,
          String(hour.modelSigWaveHeightFt ?? '—').padStart(8),
          String(hour.exposedSwellHeightFt?.toFixed(1) ?? '—').padStart(8),
          `${hour.windSpeedMph ?? '—'}/${hour.windGustMph ?? '—'}`.padStart(11),
          String(hour.tideHeightFt?.toFixed(2) ?? '—').padStart(7),
          (hour.tideStage ?? '—').padEnd(11),
          counted,
        ].join(' '),
      )
    }

    // --- The headline invariant: raw model height and direction-filtered height
    //     are different quantities, and the exposure filter is doing work. ---
    console.log('\n=== offshore-vs-exposed cross-check ===')
    const withBoth = hours.filter(
      (h) => h.modelSigWaveHeightFt !== null && h.exposedSwellHeightFt !== null,
    )
    const maxModel = Math.max(...withBoth.map((h) => h.modelSigWaveHeightFt!))
    const maxExposed = Math.max(...withBoth.map((h) => h.exposedSwellHeightFt!))
    line('max modelSigWaveHeightFt', `${maxModel.toFixed(1)} ft (all partitions, offshore)`)
    line('max exposedSwellHeightFt', `${maxExposed.toFixed(1)} ft (inside 135-225°)`)

    if (srf.ok && srf.data.forecast) {
      const south = bandsForShore(srf.data.forecast, CROMWELLS.shoreAspect)
      line('NWS south-facing bands', south.map((b) => `${b.column} ${b.minFt}-${b.maxFt} ft`).join(', '))
      const srfMax = Math.max(...south.map((b) => b.maxFt))

      // The bound that matters: exposed height must not exceed the surf-face band
      // by a wide margin. If it does, the exposure window is admitting energy the
      // south shore is not actually receiving.
      console.log(
        `\n  cross-check: exposed ${maxExposed.toFixed(1)} ft vs NWS south-facing max ${srfMax} ft`,
      )
      if (maxExposed > srfMax + 3) {
        console.warn(
          `  ⚠ exposed height exceeds the NWS south-facing band by more than 3 ft — review the exposure window`,
        )
      }
      if (srf.data.warnings.length > 0) {
        console.warn(`  ⚠ SRF parse warnings: ${srf.data.warnings.join('; ')}`)
      }
    } else {
      console.warn('  ⚠ SRF unavailable — no magnitude bound this run')
    }

    // Exposed energy can never exceed the total sea state it was filtered from.
    for (const hour of withBoth) {
      expect(
        hour.exposedSwellHeightFt!,
        `exposed height exceeded total sea state at ${hour.timestamp}`,
      ).toBeLessThanOrEqual(hour.modelSigWaveHeightFt! + 0.001)
    }

    console.log('\n=== active hazards ===')
    line('count', alerts.data.hazards.length)
    for (const hazard of alerts.data.hazards) {
      line(hazard.event, `${hazard.severity}${hazard.isBlocking ? ' (BLOCKING)' : ''}`)
    }

    if (warnings.length > 0) {
      console.log('\n=== normalization warnings ===')
      for (const warning of warnings) console.log(`  ⚠ ${warning}`)
    }

    // --- Run the engine over the live series. ---
    const evaluation = evaluateForecast({
      profile: CROMWELLS,
      hours,
      surfZoneForecast: srf.ok ? srf.data.forecast : null,
      nowUtc,
    })

    console.log('\n=== engine verdicts by day ===')
    console.log('  date        verdict                  recommended    full stretch   conf')
    for (const day of evaluation.days) {
      const span = (w: typeof day.bestWindow) =>
        w ? `${w.startTimestamp.slice(11)}-${w.endTimestamp.slice(11)}` : '—'
      console.log(
        [
          ` ${day.date}`,
          VERDICT_LABEL[day.verdict].padEnd(24),
          span(day.recommendedWindow).padEnd(14),
          span(day.bestWindow).padEnd(14),
          (day.bestWindow?.confidence ?? '—').padStart(6),
        ].join(' '),
      )
    }

    console.log('\n=== current hour ===')
    if (evaluation.current) {
      line('time', evaluation.current.timestamp)
      line('verdict', VERDICT_LABEL[evaluation.current.verdict])
      line('confidence', evaluation.current.confidence)
      console.log('  reasons:')
      for (const entry of evaluation.current.reasons) {
        console.log(`    [${entry.severity}] ${entry.text}${entry.detail ? ` (${entry.detail})` : ''}`)
      }
    } else {
      console.log('  no assessment covers the present moment')
    }

    console.log('\n=== best window overall ===')
    if (evaluation.bestWindow) {
      const best = evaluation.bestWindow
      line('when', `${best.date} ${best.startTimestamp.slice(11)}-${best.endTimestamp.slice(11)}`)
      line('verdict', VERDICT_LABEL[best.verdict])
      line('confidence', best.confidence)
      line('score', best.score.toFixed(3))
      for (const entry of best.reasons) {
        console.log(`    [${entry.severity}] ${entry.text}`)
      }
    } else {
      console.log('  no window met the bar')
    }

    line('engine / config', `${evaluation.engineVersion} / ${evaluation.configVersion}`)

    if (evaluation.warnings.length > 0) {
      console.log('\n=== engine warnings ===')
      for (const warning of evaluation.warnings) console.log(`  ⚠ ${warning}`)
    }

    // A verdict without an explanation is never acceptable.
    for (const assessment of evaluation.hours) {
      expect(assessment.reasons.length, `no reasons at ${assessment.timestamp}`).toBeGreaterThan(0)
    }
    console.log()
  })
})
