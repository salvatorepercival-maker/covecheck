import { describe, expect, it } from 'vitest'
import { distanceKm, fetchWaterQuality, kindOf, wktPoints } from './doh'

const BEACH = { latitude: 21.257, longitude: -157.797 }

function fakeFetch(routes: Record<string, unknown | number>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)
    const key = Object.keys(routes).find((k) => url.includes(k))
    const body = key === undefined ? 404 : routes[key]
    if (typeof body === 'number') return new Response('nope', { status: body })
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

describe('DOH water quality', () => {
  it('classifies advisory types', () => {
    expect(kindOf('Brown Water Advisory')).toBe('brown_water')
    expect(kindOf('Beach Advisory')).toBe('bacteria')
    expect(kindOf('Sewage Spill')).toBe('sewage')
  })

  it('reads WKT points and measures distance', () => {
    expect(wktPoints('POLYGON ((-157.7389 21.4241, -157.73 21.41))')).toHaveLength(2)
    expect(distanceKm({ lat: 21.257, lon: -157.797 }, { lat: 21.2685, lon: -157.7758 })).toBeCloseTo(2.5, 0)
  })

  it('keeps only advisories near the beach', async () => {
    const result = await fetchWaterQuality(BEACH, {
      fetchImpl: fakeFetch({
        'events?': { totalResultsCount: 2, list: [{ id: 1, type: 'Sewage Spill', status: 'Open' }, { id: 2, type: 'Brown Water Advisory', status: 'Open' }] },
        'events/1': { id: 1, type: 'Sewage Spill', status: 'Open', title: 'Kahala pump station', locations: [{ centroid: 'POINT (-157.7758 21.2685)' }], eventBeaches: [] },
        'events/2': { id: 2, type: 'Brown Water Advisory', status: 'Open', locationName: 'Kailua Bay', locations: [{ centroid: 'POINT (-157.7341 21.4099)' }], eventBeaches: [] },
      }),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.nearby.map((a) => a.kind)).toEqual(['sewage'])
      expect(result.data.openOnIsland).toBe(2)
    }
  })

  it('fails — never reports clear — when the source is down or a detail is unreadable', async () => {
    const down = await fetchWaterQuality(BEACH, { fetchImpl: fakeFetch({ 'events?': 500 }) })
    expect(down.ok).toBe(false)
    const partial = await fetchWaterQuality(BEACH, {
      fetchImpl: fakeFetch({ 'events?': { totalResultsCount: 1, list: [{ id: 9, type: 'Beach Advisory', status: 'Open' }] }, 'events/9': 400 }),
    })
    expect(partial.ok).toBe(false)
  })

  it('treats a response without a result count as a failure, not as no advisories', async () => {
    const result = await fetchWaterQuality(BEACH, { fetchImpl: fakeFetch({ 'events?': { list: [] } }) })
    expect(result.ok).toBe(false)
  })
})
