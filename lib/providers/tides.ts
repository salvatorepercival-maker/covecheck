import { z } from 'zod'
import { fetchProviderJson, type ProviderResult } from './http'

/**
 * NOAA CO-OPS tide predictions.
 *
 * Two products are needed and they are not interchangeable:
 *   - `interval=h`   hourly heights, to line up with the hourly forecast grid
 *   - `interval=hilo` high/low turning points, which is how tide *stage* is
 *     determined reliably; inferring turns from hourly samples alone misplaces
 *     them by up to half an hour.
 *
 * CO-OPS returns heights as strings. They are parsed explicitly and a value that
 * will not parse becomes null, never 0 — at Honolulu's MLLW datum 0 ft is a real,
 * plausible low tide, so a coerced failure would be indistinguishable from data.
 */

const BASE = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'

/** CO-OPS reports errors as a 200 with an `{ error: { message } }` body. */
const errorEnvelope = z.object({ error: z.object({ message: z.string() }) })

const hourlySchema = z.object({
  predictions: z.array(z.object({ t: z.string(), v: z.string() })),
})

const hiloSchema = z.object({
  predictions: z.array(
    z.object({
      t: z.string(),
      v: z.string(),
      type: z.enum(['H', 'L']),
    }),
  ),
})

const hourlyOrError = z.union([errorEnvelope, hourlySchema])
const hiloOrError = z.union([errorEnvelope, hiloSchema])

export type TidePrediction = { timestamp: string; heightFt: number | null }
export type TideExtreme = { timestamp: string; heightFt: number | null; kind: 'high' | 'low' }

/** `YYYYMMDD`, the only date format CO-OPS accepts for begin_date/end_date. */
export function toCoopsDate(honoluluDate: string): string {
  return honoluluDate.replaceAll('-', '')
}

function buildUrl(
  stationId: string,
  beginDate: string,
  endDate: string,
  interval: 'h' | 'hilo',
): string {
  const params = new URLSearchParams({
    product: 'predictions',
    application: 'covecheck',
    station: stationId,
    begin_date: toCoopsDate(beginDate),
    end_date: toCoopsDate(endDate),
    datum: 'MLLW',
    time_zone: 'lst_ldt',
    units: 'english',
    interval,
    format: 'json',
  })
  return `${BASE}?${params.toString()}`
}

export const buildTideHourlyUrl = (s: string, b: string, e: string) => buildUrl(s, b, e, 'h')
export const buildTideExtremesUrl = (s: string, b: string, e: string) => buildUrl(s, b, e, 'hilo')

/** Parse a CO-OPS height string. Returns null rather than 0 on anything unparseable. */
export function parseTideHeight(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

function unwrap<T extends { predictions: unknown[] }>(
  result: ProviderResult<{ error: { message: string } } | T>,
): ProviderResult<T> {
  if (!result.ok) return result
  if ('error' in result.data) {
    return {
      ok: false,
      error: { kind: 'schema_mismatch', message: `CO-OPS: ${result.data.error.message}` },
      fetchedAtUtc: result.fetchedAtUtc,
      provider: result.provider,
    }
  }
  return { ...result, data: result.data as T }
}

export async function fetchTideHourly(
  stationId: string,
  beginDate: string,
  endDate: string,
  overrides: { fetchImpl?: typeof fetch } = {},
): Promise<ProviderResult<{ predictions: TidePrediction[] }>> {
  const result = unwrap(
    await fetchProviderJson({
      provider: 'tides',
      url: buildTideHourlyUrl(stationId, beginDate, endDate),
      schema: hourlyOrError,
      fetchImpl: overrides.fetchImpl,
    }),
  )
  if (!result.ok) return result
  return {
    ...result,
    data: {
      predictions: result.data.predictions.map((p) => ({
        timestamp: p.t,
        heightFt: parseTideHeight(p.v),
      })),
    },
  }
}

export async function fetchTideExtremes(
  stationId: string,
  beginDate: string,
  endDate: string,
  overrides: { fetchImpl?: typeof fetch } = {},
): Promise<ProviderResult<{ extremes: TideExtreme[] }>> {
  const result = unwrap(
    await fetchProviderJson({
      provider: 'tides',
      url: buildTideExtremesUrl(stationId, beginDate, endDate),
      schema: hiloOrError,
      fetchImpl: overrides.fetchImpl,
    }),
  )
  if (!result.ok) return result
  return {
    ...result,
    data: {
      extremes: result.data.predictions.map((p) => ({
        timestamp: p.t,
        heightFt: parseTideHeight(p.v),
        kind: p.type === 'H' ? ('high' as const) : ('low' as const),
      })),
    },
  }
}
