import { z } from 'zod'
import { fetchProviderJson, NWS_USER_AGENT, type ProviderResult } from './http'

/**
 * NWS gridpoint forecast — thunderstorm and lightning signals only.
 *
 * `https://api.weather.gov/gridpoints/{office}/{x},{y}` (public domain, needs a
 * User-Agent; poll at most hourly). For Black Point: HFO 157,142, verified via
 * /points/21.257,-157.797 on 2026-10-12.
 *
 * Two fields carry thunder for Hawaiʻi:
 *   - `weather`: run-length-encoded intervals; any element with
 *     weather == "thunderstorms" means thunder is forecast, with a coverage word.
 *   - `lightningActivityLevel`: 1 = no thunderstorms, 2-6 increasing.
 * (`probabilityOfThunder` exists but is empty for HFO.)
 */

const interval = z.object({ validTime: z.string() })
const schema = z.object({
  properties: z.object({
    updateTime: z.string(),
    weather: z.object({
      values: z.array(
        interval.extend({
          value: z.array(z.object({ coverage: z.string().nullable(), weather: z.string().nullable() })),
        }),
      ),
    }),
    lightningActivityLevel: z.object({ values: z.array(interval.extend({ value: z.number().nullable() })) }).optional(),
  }),
})

export type NwsThunderHour = { coverage: string | null; lightningLevel: number | null }

/** ISO 8601 duration (P1DT18H, PT12H) → hours. */
export function durationHours(iso: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(iso)
  if (!m) return 0
  return Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0) + Number(m[3] ?? 0) / 60
}

/** Expand "start/duration" intervals into one entry per UTC hour (ISO hour string → value). */
export function expandHourly<T>(values: readonly { validTime: string; value: T }[]): Map<string, T> {
  const out = new Map<string, T>()
  for (const { validTime, value } of values) {
    const [start, dur] = validTime.split('/')
    const startMs = Date.parse(start)
    const hours = Math.round(durationHours(dur))
    for (let h = 0; h < hours; h++) out.set(new Date(startMs + h * 3_600_000).toISOString().slice(0, 13), value)
  }
  return out
}

export type NwsThunder = {
  updatedUtc: string
  /** Keyed by UTC hour, "2026-10-13T16". Hours without thunder are absent. */
  byUtcHour: Record<string, NwsThunderHour>
  /** Hours the grid covers at all, so "absent" can mean "no thunder" rather than "unknown". */
  coveredUtcHours: string[]
}

export async function fetchNwsThunder(
  grid: { office: string; x: number; y: number },
  options: { fetchImpl?: typeof fetch } = {},
): Promise<ProviderResult<NwsThunder>> {
  const result = await fetchProviderJson({
    provider: 'nwsgrid',
    url: `https://api.weather.gov/gridpoints/${grid.office}/${grid.x},${grid.y}`,
    schema,
    headers: { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json' },
    fetchImpl: options.fetchImpl,
  })
  if (!result.ok) return result
  const p = result.data.properties
  const weather = expandHourly(p.weather.values)
  const lightning = expandHourly(p.lightningActivityLevel?.values ?? [])
  const byUtcHour: Record<string, NwsThunderHour> = {}
  for (const [hour, entries] of weather) {
    const thunder = entries.find((e) => e.weather === 'thunderstorms')
    const level = lightning.get(hour) ?? null
    if (thunder || (level !== null && level >= 2)) byUtcHour[hour] = { coverage: thunder?.coverage ?? null, lightningLevel: level }
  }
  for (const [hour, level] of lightning) {
    if (level !== null && level >= 2 && !byUtcHour[hour]) byUtcHour[hour] = { coverage: null, lightningLevel: level }
  }
  return { ...result, data: { updatedUtc: p.updateTime, byUtcHour, coveredUtcHours: [...weather.keys()] } }
}
