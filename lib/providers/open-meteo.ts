import { z } from 'zod'
import type { ProviderCell } from '../types'
import { fetchProviderJson, type ProviderResult } from './http'

/**
 * Open-Meteo marine and weather adapters.
 *
 * Both endpoints relocate the requested coordinate to their nearest model grid
 * cell and report where they landed. We always request imperial units explicitly
 * — the defaults are metric (m, km/h, mm) and silently mixing unit systems is
 * exactly the class of bug that produces a confidently wrong verdict.
 *
 * Note the response labels miles-per-hour as `mp/h`, not `mph`.
 */

const MARINE_BASE = 'https://marine-api.open-meteo.com/v1/marine'
const WEATHER_BASE = 'https://api.open-meteo.com/v1/forecast'

/** Hourly arrays are parallel to `time` and may contain nulls where the model has no value. */
const nullableNumbers = z.array(z.number().nullable())

const marineSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number(),
  timezone: z.string(),
  hourly_units: z.object({
    wave_height: z.string(),
    swell_wave_height: z.string(),
    wind_wave_height: z.string(),
    sea_surface_temperature: z.string().optional(),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    wave_height: nullableNumbers,
    wave_direction: nullableNumbers,
    wave_period: nullableNumbers,
    swell_wave_height: nullableNumbers,
    swell_wave_direction: nullableNumbers,
    swell_wave_period: nullableNumbers,
    wind_wave_height: nullableNumbers,
    wind_wave_direction: nullableNumbers,
    wind_wave_period: nullableNumbers,
    sea_surface_temperature: nullableNumbers,
  }),
})

const weatherSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number(),
  timezone: z.string(),
  hourly_units: z.object({
    wind_speed_10m: z.string(),
    wind_gusts_10m: z.string(),
    precipitation: z.string(),
    temperature_2m: z.string().optional(),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    wind_speed_10m: nullableNumbers,
    wind_direction_10m: nullableNumbers,
    wind_gusts_10m: nullableNumbers,
    precipitation: nullableNumbers,
    temperature_2m: nullableNumbers,
  }),
})

export type MarineResponse = z.infer<typeof marineSchema>
export type WeatherResponse = z.infer<typeof weatherSchema>

export const MARINE_HOURLY_VARIABLES = [
  'wave_height',
  'wave_direction',
  'wave_period',
  'swell_wave_height',
  'swell_wave_direction',
  'swell_wave_period',
  'wind_wave_height',
  'wind_wave_direction',
  'wind_wave_period',
  // Sea surface temperature. Verified non-null at the pinned sea cell.
  'sea_surface_temperature',
] as const

export const WEATHER_HOURLY_VARIABLES = [
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'precipitation',
  'temperature_2m',
] as const

/**
 * Only the requested coordinates are needed to build a URL. Narrowing the
 * parameter keeps callers from having to fabricate the calibration fields.
 */
export type CellRequest = Pick<ProviderCell, 'requestedLat' | 'requestedLon'>

export function buildMarineUrl(cell: CellRequest, timezone: string, forecastDays = 7): string {
  const params = new URLSearchParams({
    latitude: String(cell.requestedLat),
    longitude: String(cell.requestedLon),
    hourly: MARINE_HOURLY_VARIABLES.join(','),
    timezone,
    forecast_days: String(forecastDays),
    length_unit: 'imperial',
    temperature_unit: 'fahrenheit',
  })
  return `${MARINE_BASE}?${params.toString()}`
}

export function buildWeatherUrl(cell: CellRequest, timezone: string, forecastDays = 7): string {
  const params = new URLSearchParams({
    latitude: String(cell.requestedLat),
    longitude: String(cell.requestedLon),
    hourly: WEATHER_HOURLY_VARIABLES.join(','),
    timezone,
    forecast_days: String(forecastDays),
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    temperature_unit: 'fahrenheit',
  })
  return `${WEATHER_BASE}?${params.toString()}`
}

/**
 * Guard against the provider silently moving our sample point.
 *
 * A grid change upstream could relocate a pinned sea cell onto land without any
 * error surfacing — the response would still be a valid 200 full of plausible
 * numbers from the wrong place. Returns a human-readable complaint, or null.
 */
export function checkResolvedCell(
  expected: ProviderCell,
  actual: { latitude: number; longitude: number; elevation: number },
  toleranceDeg = 0.02,
): string | null {
  if (actual.elevation > 0) {
    return `resolved to elevation ${actual.elevation} m — expected a sea cell at 0 m; the model may have snapped inland`
  }
  const latDrift = Math.abs(actual.latitude - expected.resolvedLat)
  const lonDrift = Math.abs(actual.longitude - expected.resolvedLon)
  if (latDrift > toleranceDeg || lonDrift > toleranceDeg) {
    return `resolved to ${actual.latitude}/${actual.longitude}, drifting from the calibrated ${expected.resolvedLat}/${expected.resolvedLon}`
  }
  return null
}

export function fetchMarine(
  cell: CellRequest,
  timezone: string,
  overrides: { fetchImpl?: typeof fetch; forecastDays?: number } = {},
): Promise<ProviderResult<MarineResponse>> {
  return fetchProviderJson({
    provider: 'marine',
    url: buildMarineUrl(cell, timezone, overrides.forecastDays),
    schema: marineSchema,
    fetchImpl: overrides.fetchImpl,
  })
}

export function fetchWeather(
  cell: CellRequest,
  timezone: string,
  overrides: { fetchImpl?: typeof fetch; forecastDays?: number } = {},
): Promise<ProviderResult<WeatherResponse>> {
  return fetchProviderJson({
    provider: 'weather',
    url: buildWeatherUrl(cell, timezone, overrides.forecastDays),
    schema: weatherSchema,
    fetchImpl: overrides.fetchImpl,
  })
}
