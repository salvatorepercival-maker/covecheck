import { z } from 'zod'
import type { CellRequest } from './open-meteo'
import { fetchProviderJson, type ProviderResult } from './http'

/**
 * 16-day swell partitions and wind, for the planning views only.
 *
 * Swell: Open-Meteo Marine pinned to `ncep_gfswave025` — the one model that
 * carries primary, secondary and tertiary swell for all 16 days (the default
 * model stops near day 10 and has no tertiary partition). Never an engine
 * input; the day tiles and lenses keep the default model.
 * Wind: Open-Meteo forecast, best_match, 16 days.
 * CC BY 4.0, non-commercial free tier. Verified 2026-10-12.
 */

const nums = z.array(z.number().nullable())
const marineSchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    swell_wave_height: nums,
    swell_wave_period: nums,
    swell_wave_direction: nums,
    secondary_swell_wave_height: nums,
    secondary_swell_wave_period: nums,
    secondary_swell_wave_direction: nums,
    tertiary_swell_wave_height: nums,
    tertiary_swell_wave_period: nums,
    tertiary_swell_wave_direction: nums,
  }),
})
const windSchema = z.object({ hourly: z.object({ time: z.array(z.string()), wind_speed_10m: nums }) })

export type LongRange = {
  times: string[]
  /** Per hour, each swell partition (null fields where the model has none). */
  partitions: { heightFt: number | null; periodSec: number | null; directionDeg: number | null }[][]
  windMph: Record<string, number>
}

const PARTS = ['swell_wave', 'secondary_swell_wave', 'tertiary_swell_wave'] as const

export async function fetchLongRange(
  cells: { marine: CellRequest; weather: CellRequest },
  timezone: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<ProviderResult<LongRange>> {
  const marineParams = new URLSearchParams({
    latitude: String(cells.marine.requestedLat),
    longitude: String(cells.marine.requestedLon),
    hourly: PARTS.flatMap((p) => [`${p}_height`, `${p}_period`, `${p}_direction`]).join(','),
    models: 'ncep_gfswave025',
    forecast_days: '16',
    length_unit: 'imperial',
    timezone,
  })
  const windParams = new URLSearchParams({
    latitude: String(cells.weather.requestedLat),
    longitude: String(cells.weather.requestedLon),
    hourly: 'wind_speed_10m',
    forecast_days: '16',
    wind_speed_unit: 'mph',
    timezone,
  })
  const [marine, wind] = await Promise.all([
    fetchProviderJson({ provider: 'marine', url: `https://marine-api.open-meteo.com/v1/marine?${marineParams}`, schema: marineSchema, fetchImpl: options.fetchImpl }),
    fetchProviderJson({ provider: 'weather', url: `https://api.open-meteo.com/v1/forecast?${windParams}`, schema: windSchema, fetchImpl: options.fetchImpl }),
  ])
  if (!marine.ok) return marine
  const h = marine.data.hourly
  const windMph: Record<string, number> = {}
  if (wind.ok) wind.data.hourly.time.forEach((t, i) => {
    const v = wind.data.hourly.wind_speed_10m[i]
    if (v !== null) windMph[t] = v
  })
  return {
    ...marine,
    data: {
      times: h.time,
      partitions: h.time.map((_, i) =>
        PARTS.map((p) => ({ heightFt: h[`${p}_height`][i], periodSec: h[`${p}_period`][i], directionDeg: h[`${p}_direction`][i] })),
      ),
      windMph,
    },
  }
}
