import { z } from 'zod'
import { distanceKm, kindOf, wktPoints } from './doh'
import { NWS_USER_AGENT, fetchProviderJson, type ProviderResult } from './http'

/**
 * The last 30 days of advisories near the beach, one entry per local day.
 *
 * - NWS: `api.weather.gov/alerts?point=…&start=…` returns past alerts for the
 *   point (verified 2026-10-12: 13 in 30 days, the Oct 7-8 flood event).
 * - Health Dept.: `/cwb/api/events?islandId=3&startDate=…` lists every event
 *   since a date, open or closed; each event's detail gives geometry and
 *   closedDate, so only those within `radiusKm` count, for the days they ran.
 */

const nwsSchema = z.object({
  features: z.array(z.object({ properties: z.object({ event: z.string(), onset: z.string().nullable(), effective: z.string().nullable(), ends: z.string().nullable(), expires: z.string().nullable() }) })),
})
const dohList = z.object({ totalResultsCount: z.number(), list: z.array(z.object({ id: z.number(), type: z.string(), status: z.string() })) })
const dohDetail = z.object({
  id: z.number(),
  type: z.string(),
  postedDate: z.string().nullable().optional(),
  closedDate: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  locationName: z.string().nullable().optional(),
  locations: z.array(z.object({ geometry: z.string().nullable().optional(), centroid: z.string().nullable().optional() })).default([]),
})

export type HistoryDay = { date: string; nws: string[]; doh: string[] }

const hst = (ms: number) => new Date(ms - 10 * 3_600_000).toISOString().slice(0, 10)
const utc = (raw: string) => Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(raw) ? raw : `${raw}Z`)

/** Every local date an interval touches. */
function datesBetween(startMs: number, endMs: number): string[] {
  const out: string[] = []
  for (let t = startMs; t <= endMs; t += 86_400_000) out.push(hst(t))
  const last = hst(endMs)
  if (!out.includes(last)) out.push(last)
  return out
}

export async function fetchAdvisoryHistory(
  beach: { latitude: number; longitude: number },
  options: { days?: number; radiusKm?: number; nowMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ProviderResult<HistoryDay[]>> {
  const days = options.days ?? 30
  const now = options.nowMs ?? Date.now()
  const from = now - days * 86_400_000
  const radius = options.radiusKm ?? 5
  const here = { lat: beach.latitude, lon: beach.longitude }

  const nws = await fetchProviderJson({
    provider: 'alerts',
    url: `https://api.weather.gov/alerts?point=${beach.latitude},${beach.longitude}&start=${new Date(from).toISOString().slice(0, 19)}Z`,
    schema: nwsSchema,
    headers: { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json' },
    fetchImpl: options.fetchImpl,
  })
  if (!nws.ok) return nws
  const list = await fetchProviderJson({
    provider: 'doh',
    url: `https://eha-cloud.doh.hawaii.gov/cwb/api/events?islandId=3&startDate=${hst(from)}&format=json`,
    schema: dohList,
    fetchImpl: options.fetchImpl,
  })
  if (!list.ok) return list
  const details = await Promise.all(
    list.data.list.map((e) =>
      fetchProviderJson({ provider: 'doh', url: `https://eha-cloud.doh.hawaii.gov/cwb/api/events/${e.id}?format=json`, schema: dohDetail, fetchImpl: options.fetchImpl, attempts: 2 }),
    ),
  )
  const failed = details.find((d) => !d.ok)
  if (failed && !failed.ok) return failed

  const byDate = new Map<string, HistoryDay>()
  for (let t = from + 86_400_000; t <= now; t += 86_400_000) byDate.set(hst(t), { date: hst(t), nws: [], doh: [] })

  for (const f of nws.data.features) {
    const p = f.properties
    const start = utc(p.onset ?? p.effective ?? '')
    const end = utc(p.ends ?? p.expires ?? p.onset ?? '')
    if (Number.isNaN(start) || Number.isNaN(end)) continue
    for (const d of datesBetween(start, Math.min(end, now))) {
      const day = byDate.get(d)
      if (day && !day.nws.includes(p.event)) day.nws.push(p.event)
    }
  }
  for (const d of details) {
    if (!d.ok) continue
    const e = d.data
    const pts = e.locations.flatMap((l) => [...wktPoints(l.geometry), ...wktPoints(l.centroid)])
    if (!pts.length || Math.min(...pts.map((p) => distanceKm(here, p))) > radius) continue
    const start = e.postedDate ? utc(e.postedDate) : NaN
    const end = e.closedDate ? utc(e.closedDate) : now
    if (Number.isNaN(start)) continue
    const label = `${kindOf(e.type) === 'sewage' ? 'Sewage spill' : e.type} · ${e.locationName || e.title || ''}`.trim()
    for (const date of datesBetween(start, Math.min(end, now))) {
      const day = byDate.get(date)
      if (day && !day.doh.includes(label)) day.doh.push(label)
    }
  }
  return { ok: true, data: [...byDate.values()], fetchedAtUtc: new Date().toISOString(), provider: 'doh' }
}
