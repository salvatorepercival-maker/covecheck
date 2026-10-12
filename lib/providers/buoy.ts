import type { ProviderFailure, ProviderResult } from './http'
import { NWS_USER_AGENT } from './http'

/**
 * NDBC real-time spectral summary for a wave buoy (`realtime2/<id>.spec`).
 *
 * Default station 51211 / CDIP 233, Pearl Harbor Entrance (21.297 N,
 * 157.959 W, 35 m): ~17 km west of Black Point, south-facing, shallow — the
 * closest live buoy with the same exposure. Verified 2026-10-12. Data: NOAA
 * National Data Buoy Center and CDIP / Scripps, with PacIOOS (public domain;
 * attribution requested). Polled no more than every 15 minutes.
 *
 * The file is plain text, newest row first, heights in metres, times UTC,
 * `MM` for missing. Swell and wind-wave directions are 16-point compass text.
 */

export const DEFAULT_BUOY = { id: '51211', name: 'Pearl Harbor Entrance (NDBC 51211 / CDIP 233)' } as const

/** A buoy row older than this is stale: transmissions drop, the file keeps serving. */
export const BUOY_STALE_MINUTES = 90

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export const compassToDeg = (text: string): number | null => {
  const i = COMPASS.indexOf(text.trim().toUpperCase())
  return i < 0 ? null : i * 22.5
}

const M_TO_FT = 3.28084

export type BuoyObservation = {
  stationId: string
  observedUtc: string
  waveHeightFt: number | null
  swellHeightFt: number | null
  swellPeriodSec: number | null
  swellFromDeg: number | null
  swellFromText: string | null
  windWaveHeightFt: number | null
  windWavePeriodSec: number | null
}

function num(raw: string | undefined): number | null {
  if (raw === undefined || raw === 'MM' || raw === 'N/A') return null
  const v = Number(raw)
  return Number.isFinite(v) ? v : null
}

/** Parse the newest complete row. Throws on a file that isn't a .spec summary. */
export function parseSpec(text: string, stationId: string): BuoyObservation {
  const lines = text.split('\n').filter((l) => l.trim())
  if (!lines[0]?.startsWith('#YY')) throw new Error('not an NDBC .spec file')
  const header = lines[0].replace(/^#/, '').trim().split(/\s+/)
  const col = (name: string) => header.indexOf(name)
  for (const line of lines.filter((l) => !l.startsWith('#'))) {
    const f = line.trim().split(/\s+/)
    const swh = num(f[col('SwH')])
    if (swh === null) continue // skip incomplete rows; use the latest complete one
    const [yy, mo, dd, hh, mm] = f.slice(0, 5)
    const dirText = f[col('SwD')] ?? null
    return {
      stationId,
      observedUtc: new Date(`${yy}-${mo}-${dd}T${hh}:${mm}:00Z`).toISOString(),
      waveHeightFt: ((v) => (v === null ? null : Math.round(v * M_TO_FT * 10) / 10))(num(f[col('WVHT')])),
      swellHeightFt: Math.round(swh * M_TO_FT * 10) / 10,
      swellPeriodSec: num(f[col('SwP')]),
      swellFromDeg: dirText ? compassToDeg(dirText) : null,
      swellFromText: dirText && dirText !== 'MM' ? dirText : null,
      windWaveHeightFt: ((v) => (v === null ? null : Math.round(v * M_TO_FT * 10) / 10))(num(f[col('WWH')])),
      windWavePeriodSec: num(f[col('WWP')]),
    }
  }
  throw new Error('no complete observation in the file')
}

export async function fetchBuoy(
  stationId: string = DEFAULT_BUOY.id,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<ProviderResult<BuoyObservation>> {
  const fetchedAtUtc = new Date().toISOString()
  const fail = (error: ProviderFailure): ProviderResult<BuoyObservation> => ({ ok: false, error, fetchedAtUtc, provider: 'buoy' })
  try {
    const res = await (options.fetchImpl ?? fetch)(`https://www.ndbc.noaa.gov/data/realtime2/${stationId}.spec`, {
      headers: { 'User-Agent': NWS_USER_AGENT },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return fail({ kind: 'http_status', status: res.status, message: `NDBC ${stationId}: HTTP ${res.status}` })
    return { ok: true, data: parseSpec(await res.text(), stationId), fetchedAtUtc, provider: 'buoy' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail({ kind: /not an NDBC|no complete/.test(message) ? 'schema_mismatch' : 'network', message })
  }
}
