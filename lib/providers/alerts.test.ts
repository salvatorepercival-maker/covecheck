import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { buildAlertsUrl, fetchAlerts, isBlockingEvent } from './alerts'

const emptyFixture = readFileSync(
  new URL('../../fixtures/raw/alerts-empty-2026-08-02.json', import.meta.url),
  'utf-8',
)

const respondWith = (body: string) =>
  vi.fn().mockResolvedValue(new Response(body, { status: 200 }))

describe('buildAlertsUrl', () => {
  it('sends a bare lat,lon point without percent-encoding the comma', () => {
    expect(buildAlertsUrl(21.257, -157.797)).toBe(
      'https://api.weather.gov/alerts/active?point=21.257,-157.797',
    )
  })
})

describe('isBlockingEvent', () => {
  it('blocks the hazards the spec names', () => {
    expect(isBlockingEvent('High Surf Advisory')).toBe(true)
    expect(isBlockingEvent('High Surf Warning')).toBe(true)
    expect(isBlockingEvent('Beach Hazards Statement')).toBe(true)
    expect(isBlockingEvent('Coastal Flood Advisory')).toBe(true)
    expect(isBlockingEvent('Flash Flood Warning')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isBlockingEvent('HIGH SURF ADVISORY')).toBe(true)
    expect(isBlockingEvent('high surf advisory')).toBe(true)
  })

  it('does not block unrelated inland events', () => {
    expect(isBlockingEvent('Red Flag Warning')).toBe(false)
    expect(isBlockingEvent('Air Quality Alert')).toBe(false)
    expect(isBlockingEvent('Special Weather Statement')).toBe(false)
  })
})

describe('fetchAlerts', () => {
  it('reads an empty feature list as "no active hazards"', async () => {
    const result = await fetchAlerts(21.257, -157.797, { fetchImpl: respondWith(emptyFixture) })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.hazards).toEqual([])
  })

  it('normalizes a High Surf Advisory into a blocking hazard', async () => {
    const body = JSON.stringify({
      features: [
        {
          properties: {
            event: 'High Surf Advisory',
            severity: 'Moderate',
            headline: 'High Surf Advisory in effect until 6 PM HST Monday',
            onset: '2026-08-02T18:00:00-10:00',
            ends: '2026-08-03T18:00:00-10:00',
          },
        },
      ],
    })

    const result = await fetchAlerts(21.257, -157.797, { fetchImpl: respondWith(body) })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.hazards[0]).toMatchObject({
      event: 'High Surf Advisory',
      severity: 'advisory',
      isBlocking: true,
      onsetUtc: '2026-08-02T18:00:00-10:00',
    })
  })

  it('derives severity from the event name ahead of the NWS severity field', async () => {
    // NWS labels a High Surf Warning "Moderate"; the event name is more meaningful.
    const body = JSON.stringify({
      features: [{ properties: { event: 'High Surf Warning', severity: 'Moderate' } }],
    })

    const result = await fetchAlerts(21.257, -157.797, { fetchImpl: respondWith(body) })
    if (result.ok) expect(result.data.hazards[0].severity).toBe('warning')
  })

  it('falls back to expires when ends is absent', async () => {
    const body = JSON.stringify({
      features: [
        {
          properties: {
            event: 'Beach Hazards Statement',
            expires: '2026-08-03T06:00:00-10:00',
          },
        },
      ],
    })

    const result = await fetchAlerts(21.257, -157.797, { fetchImpl: respondWith(body) })
    if (result.ok) {
      expect(result.data.hazards[0].endsUtc).toBe('2026-08-03T06:00:00-10:00')
      expect(result.data.hazards[0].headline).toBeNull()
    }
  })

  it('keeps a non-blocking hazard in the list rather than discarding it', async () => {
    const body = JSON.stringify({
      features: [{ properties: { event: 'Air Quality Alert' } }],
    })

    const result = await fetchAlerts(21.257, -157.797, { fetchImpl: respondWith(body) })
    if (result.ok) {
      expect(result.data.hazards).toHaveLength(1)
      expect(result.data.hazards[0].isBlocking).toBe(false)
    }
  })

  it('surfaces a fetch failure instead of reporting zero hazards', async () => {
    const result = await fetchAlerts(21.257, -157.797, {
      fetchImpl: vi.fn().mockResolvedValue(new Response('{}', { status: 503 })),
    })
    expect(result.ok).toBe(false)
  })
})
