import { describe, expect, it } from 'vitest'
import { durationHours, expandHourly, fetchNwsThunder } from './nws-grid'

const grid = (weather: unknown[], lightning: unknown[] = []) =>
  (async () =>
    new Response(JSON.stringify({ properties: { updateTime: '2026-10-12T04:01:51+00:00', weather: { values: weather }, lightningActivityLevel: { values: lightning } } }), {
      status: 200,
      headers: { 'content-type': 'application/geo+json' },
    })) as unknown as typeof fetch

describe('NWS grid thunder', () => {
  it('parses ISO durations and expands intervals per hour', () => {
    expect(durationHours('PT12H')).toBe(12)
    expect(durationHours('P1DT18H')).toBe(42)
    const m = expandHourly([{ validTime: '2026-10-13T16:00:00+00:00/PT3H', value: 'x' }])
    expect([...m.keys()]).toEqual(['2026-10-13T16', '2026-10-13T17', '2026-10-13T18'])
  })

  it('flags thunderstorm hours with coverage, and lightning level 2+', async () => {
    const r = await fetchNwsThunder(
      { office: 'HFO', x: 157, y: 142 },
      {
        fetchImpl: grid(
          [
            { validTime: '2026-10-13T16:00:00+00:00/PT2H', value: [{ coverage: 'isolated', weather: 'rain_showers' }, { coverage: 'chance', weather: 'thunderstorms' }] },
            { validTime: '2026-10-13T18:00:00+00:00/PT2H', value: [{ coverage: null, weather: null }] },
          ],
          [{ validTime: '2026-10-13T19:00:00+00:00/PT1H', value: 3 }],
        ),
      },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.byUtcHour['2026-10-13T16']).toEqual({ coverage: 'chance', lightningLevel: null })
    expect(r.data.byUtcHour['2026-10-13T18']).toBeUndefined()
    expect(r.data.byUtcHour['2026-10-13T19']).toEqual({ coverage: null, lightningLevel: 3 })
    expect(r.data.coveredUtcHours).toContain('2026-10-13T18')
  })

  it('fails rather than reporting no thunder when the grid is unreadable', async () => {
    const r = await fetchNwsThunder({ office: 'HFO', x: 157, y: 142 }, { fetchImpl: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch })
    expect(r.ok).toBe(false)
  })
})
