import { z } from 'zod'
import { fetchProviderJson, type ProviderFailure, type ProviderResult } from './http'

/**
 * Hawaiʻi Department of Health, Clean Water Branch — water-quality advisories.
 *
 * Source: the JSON API behind https://eha-cloud.doh.hawaii.gov/cwb/ (public, no
 * key, undocumented — ServiceStack). Three advisory kinds matter here: brown
 * water (runoff after heavy rain), bacteria (enterococcus exceedance, typed
 * "Beach Advisory") and sewage spills.
 *
 * Two traps this adapter guards against:
 *   - An invalid filter value returns 200 with an EMPTY list, indistinguishable
 *     from "no advisories". We only ever send known-good filters, and a response
 *     without `totalResultsCount` is treated as a failure, never as "clear".
 *   - The list endpoint omits geometry, so each open event's detail is fetched
 *     to decide whether it is near this beach.
 *
 * Browsers cannot call it (no Access-Control-Allow-Origin), so it is server-only.
 */

const BASE = 'https://eha-cloud.doh.hawaii.gov/cwb/api'

/** Island ids from `/api/islands`. */
export const DOH_ISLAND_IDS = { oahu: 3 } as const

const eventSummary = z.object({
  id: z.number(),
  type: z.string(),
  status: z.string(),
  title: z.string().nullable().optional(),
  locationName: z.string().nullable().optional(),
  postedDate: z.string().nullable().optional(),
})

const listSchema = z.object({
  totalResultsCount: z.number(),
  list: z.array(eventSummary),
})

const point = z.object({
  startLatitude: z.number().nullable().optional(),
  startLongitude: z.number().nullable().optional(),
  endLatitude: z.number().nullable().optional(),
  endLongitude: z.number().nullable().optional(),
})

const detailSchema = eventSummary.extend({
  locations: z
    .array(z.object({ geometry: z.string().nullable().optional(), centroid: z.string().nullable().optional() }))
    .default([]),
  eventBeaches: z.array(z.object({ beach: point.nullable().optional() })).default([]),
})

export type WaterQualityKind = 'brown_water' | 'bacteria' | 'sewage' | 'other'

export type WaterQualityAdvisory = {
  id: number
  kind: WaterQualityKind
  /** DOH's own type string, verbatim. */
  type: string
  title: string
  postedUtc: string | null
  /** Nearest point of the advisory to the beach, km. */
  distanceKm: number
  url: string
}

export type WaterQualityReport = {
  /** Open advisories within `radiusKm` of the beach. Empty means checked and clear. */
  nearby: WaterQualityAdvisory[]
  radiusKm: number
  /** Open advisories island-wide, for context. */
  openOnIsland: number
}

export function kindOf(type: string): WaterQualityKind {
  const t = type.toLowerCase()
  if (t.includes('brown water')) return 'brown_water'
  if (t.includes('beach advisory') || t.includes('bacteria')) return 'bacteria'
  if (t.includes('sewage') || t.includes('wastewater')) return 'sewage'
  return 'other'
}

/** Every "lon lat" pair in a WKT string (POINT, POLYGON, MULTI…). */
export function wktPoints(wkt: string | null | undefined): { lat: number; lon: number }[] {
  if (!wkt) return []
  const out: { lat: number; lon: number }[] = []
  for (const match of wkt.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)) {
    out.push({ lon: Number(match[1]), lat: Number(match[2]) })
  }
  return out
}

/** Great-circle distance, km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Postedate is UTC with no zone marker: `2026-10-09T20:30:40.08`. */
function postedUtc(raw: string | null | undefined): string | null {
  if (!raw) return null
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(raw) ? raw : `${raw}Z`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function fetchWaterQuality(
  beach: { latitude: number; longitude: number },
  options: { islandId?: number; radiusKm?: number; fetchImpl?: typeof fetch } = {},
): Promise<ProviderResult<WaterQualityReport>> {
  const islandId = options.islandId ?? DOH_ISLAND_IDS.oahu
  const radiusKm = options.radiusKm ?? 5
  const here = { lat: beach.latitude, lon: beach.longitude }

  const list = await fetchProviderJson({
    provider: 'doh',
    url: `${BASE}/events?status=Open&islandId=${islandId}&format=json`,
    schema: listSchema,
    fetchImpl: options.fetchImpl,
  })
  if (!list.ok) return list

  const open = list.data.list.filter((event) => event.status === 'Open')
  const details = await Promise.all(
    open.map((event) =>
      fetchProviderJson({
        provider: 'doh',
        url: `${BASE}/events/${event.id}?format=json`,
        schema: detailSchema,
        fetchImpl: options.fetchImpl,
        attempts: 2,
      }),
    ),
  )

  // Any detail we could not read makes the answer unknowable — an unread
  // advisory might be the nearby one. Fail rather than report "clear".
  const failed = details.find((detail) => !detail.ok)
  if (failed && !failed.ok) {
    const error: ProviderFailure = {
      ...failed.error,
      message: `could not read advisory detail: ${failed.error.message}`,
    }
    return { ok: false, error, fetchedAtUtc: failed.fetchedAtUtc, provider: 'doh' }
  }

  const nearby: WaterQualityAdvisory[] = []
  for (const detail of details) {
    if (!detail.ok) continue
    const event = detail.data
    const points = [
      ...event.locations.flatMap((location) => [...wktPoints(location.geometry), ...wktPoints(location.centroid)]),
      ...event.eventBeaches.flatMap(({ beach }) =>
        beach
          ? [
              { lat: beach.startLatitude, lon: beach.startLongitude },
              { lat: beach.endLatitude, lon: beach.endLongitude },
            ].filter((p): p is { lat: number; lon: number } => typeof p.lat === 'number' && typeof p.lon === 'number')
          : [],
      ),
    ]
    if (points.length === 0) continue
    const nearest = Math.min(...points.map((p) => distanceKm(here, p)))
    if (nearest > radiusKm) continue
    nearby.push({
      id: event.id,
      kind: kindOf(event.type),
      type: event.type,
      title: event.locationName || event.title || event.type,
      postedUtc: postedUtc(event.postedDate),
      distanceKm: Math.round(nearest * 10) / 10,
      url: `https://eha-cloud.doh.hawaii.gov/cwb/#!/event/${event.id}/details/view`,
    })
  }

  return {
    ok: true,
    data: { nearby: nearby.sort((a, b) => a.distanceKm - b.distanceKm), radiusKm, openOnIsland: open.length },
    fetchedAtUtc: new Date().toISOString(),
    provider: 'doh',
  }
}
