import { describe, expect, it, vi } from 'vitest'
import { fetchAdvisoryHistory } from './advisory-history'

const BEACH = { latitude: 21.2575, longitude: -157.7895 }
// 2026-10-12 12:00 HST
const NOW = Date.parse('2026-10-12T22:00:00Z')

function fakeFetch(routes: Record<string, unknown>) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url)
    const key = Object.keys(routes).find((k) => u.includes(k))
    return key ? new Response(JSON.stringify(routes[key]), { status: 200 }) : new Response('nope', { status: 404 })
  }) as unknown as typeof fetch
}

const nws = {
  features: [
    { properties: { event: 'Flood Watch', onset: '2026-10-07T18:00:00-10:00', effective: null, ends: '2026-10-08T18:00:00-10:00', expires: null } },
  ],
}
const list = { totalResultsCount: 2, list: [{ id: 1, type: 'Sewage', status: 'Closed' }, { id: 2, type: 'Brown Water', status: 'Open' }] }
const near = { id: 1, type: 'Sewage', postedDate: '2026-09-20T09:00:00', closedDate: '2026-09-21T09:00:00', title: 'Kahala', locationName: 'Kahala', locations: [{ geometry: 'POINT (-157.78 21.27)', centroid: null }] }
const far = { id: 2, type: 'Brown Water', postedDate: '2026-10-01T09:00:00', closedDate: null, title: 'North Shore', locationName: 'Haleiwa', locations: [{ geometry: 'POINT (-158.10 21.59)', centroid: null }] }

describe('fetchAdvisoryHistory', () => {
  it('lays NWS and nearby Health Dept. events onto 30 local days', async () => {
    const r = await fetchAdvisoryHistory(BEACH, {
      nowMs: NOW,
      fetchImpl: fakeFetch({ 'alerts?point': nws, 'events/1?': near, 'events/2?': far, 'events?islandId': list }),
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toHaveLength(30)
    expect(r.data.at(-1)!.date).toBe('2026-10-12')
    const by = Object.fromEntries(r.data.map((d) => [d.date, d]))
    expect(by['2026-10-07'].nws).toEqual(['Flood Watch'])
    expect(by['2026-10-08'].nws).toEqual(['Flood Watch'])
    expect(by['2026-10-09'].nws).toEqual([])
    expect(by['2026-09-20'].doh[0]).toMatch(/^Sewage spill/)
    // The North Shore event is far outside the radius.
    expect(r.data.some((d) => d.doh.some((x) => x.includes('Haleiwa')))).toBe(false)
  })

  it('fails rather than reporting an empty history when a source is down', async () => {
    const r = await fetchAdvisoryHistory(BEACH, { nowMs: NOW, fetchImpl: fakeFetch({ 'alerts?point': nws }) })
    expect(r.ok).toBe(false)
  })
})
