import { describe, expect, it, vi } from 'vitest'
import { CROMWELLS } from '../beach/cromwells'
import {
  distanceMiles,
  fetchNearbySurfReport,
  likelyDifferentExposureOnOahu,
  parseWaveForecast,
} from './surfline'

const BEACH = { latitude: CROMWELLS.latitude, longitude: CROMWELLS.longitude }

describe('distanceMiles', () => {
  it('is zero for the same point', () => {
    expect(distanceMiles(BEACH, BEACH)).toBeCloseTo(0, 6)
  })

  it('matches a known Oahu separation', () => {
    // Cromwell's to Waikiki is roughly 3 miles along the south shore.
    const waikiki = { latitude: 21.2745, longitude: -157.8305 }
    const miles = distanceMiles(BEACH, waikiki)
    expect(miles).toBeGreaterThan(2)
    expect(miles).toBeLessThan(4)
  })

  it('is symmetric', () => {
    const other = { latitude: 21.6, longitude: -158.1 }
    expect(distanceMiles(BEACH, other)).toBeCloseTo(distanceMiles(other, BEACH), 9)
  })
})

describe('likelyDifferentExposureOnOahu', () => {
  it('flags North Shore breaks', () => {
    // Pipeline / Sunset sit around 21.66°N — opposite exposure to a south cove.
    expect(likelyDifferentExposureOnOahu({ latitude: 21.665, longitude: -158.05 })).toBe(true)
  })

  it('flags the Waianae (west) coast', () => {
    expect(likelyDifferentExposureOnOahu({ latitude: 21.44, longitude: -158.19 })).toBe(true)
  })

  it('does not flag a south-shore break', () => {
    expect(likelyDifferentExposureOnOahu({ latitude: 21.2745, longitude: -157.8305 })).toBe(false)
    expect(likelyDifferentExposureOnOahu(BEACH)).toBe(false)
  })
})

describe('parseWaveForecast', () => {
  const payload = {
    associated: { units: { waveHeight: 'FT' }, utcOffset: -10 },
    data: {
      wave: [
        { timestamp: 1785715200, surf: { min: 1, max: 3, humanRelation: 'knee to thigh' } },
        { timestamp: 1785726000, surf: { min: 2, max: 4, humanRelation: null } },
      ],
    },
  }

  it('maps epoch seconds to ISO instants and keeps the range', () => {
    const rows = parseWaveForecast(payload)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ minFt: 1, maxFt: 3, description: 'knee to thigh' })
    expect(rows[0].timestampUtc).toBe(new Date(1785715200 * 1000).toISOString())
    expect(rows[1].description).toBeNull()
  })

  it('rejects a change of units rather than silently rescaling the card', () => {
    const metric = { ...payload, associated: { units: { waveHeight: 'M' } } }
    expect(() => parseWaveForecast(metric)).toThrow(/unexpected wave height unit M/)
  })

  it('tolerates a missing units block, since the field is undocumented', () => {
    expect(() => parseWaveForecast({ data: payload.data })).not.toThrow()
  })

  it('throws on an unrecognised shape, so a silent format change cannot pass through', () => {
    expect(() => parseWaveForecast({ data: { wave: [{ nope: true }] } })).toThrow()
    expect(() => parseWaveForecast(null)).toThrow()
  })
})

describe('fetchNearbySurfReport', () => {
  it('is disabled unless SURFLINE_ENABLED is set', async () => {
    const result = await fetchNearbySurfReport(BEACH)
    expect(result.status).toBe('disabled')
    if (result.status === 'disabled') expect(result.reason).toMatch(/Cloudflare bot protection/)
  })

  describe('with the flag set', () => {
    it('reports unavailable on the real 403 rather than throwing', async () => {
      vi.stubEnv('SURFLINE_ENABLED', '1')
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('<html>challenge</html>', { status: 403 }))

      const result = await fetchNearbySurfReport(BEACH)
      expect(result.status).toBe('unavailable')
      if (result.status === 'unavailable') expect(result.reason).toMatch(/HTTP 403/)

      fetchSpy.mockRestore()
      vi.unstubAllEnvs()
    })

    it('survives the entire domain disappearing', async () => {
      vi.stubEnv('SURFLINE_ENABLED', '1')
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('getaddrinfo ENOTFOUND services.surfline.com'))

      const result = await fetchNearbySurfReport(BEACH)
      expect(result.status).toBe('unavailable')
      if (result.status === 'unavailable') expect(result.reason).toMatch(/ENOTFOUND/)

      fetchSpy.mockRestore()
      vi.unstubAllEnvs()
    })

    it('reports unavailable when no break is listed nearby', async () => {
      vi.stubEnv('SURFLINE_ENABLED', '1')
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(Response.json({ data: { spots: [] } }))

      const result = await fetchNearbySurfReport(BEACH)
      expect(result.status).toBe('unavailable')
      if (result.status === 'unavailable') expect(result.reason).toMatch(/no Surfline break listed/)

      fetchSpy.mockRestore()
      vi.unstubAllEnvs()
    })

    it('picks the nearest break and records its distance and exposure', async () => {
      vi.stubEnv('SURFLINE_ENABLED', '1')
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        const url = String(input)
        if (url.includes('/nearby')) {
          return Promise.resolve(
            Response.json({
              data: {
                spots: [
                  // Deliberately out of order, and the far one listed first.
                  { _id: 'north', name: 'Pipeline', lat: 21.665, lon: -158.05 },
                  { _id: 'diamond', name: 'Diamond Head Cliffs', lat: 21.2554, lon: -157.8069 },
                ],
              },
            }),
          )
        }
        return Promise.resolve(
          Response.json({
            associated: { units: { waveHeight: 'FT' } },
            data: { wave: [{ timestamp: 1785715200, surf: { min: 1, max: 2, humanRelation: 'knee high' } }] },
          }),
        )
      })

      const result = await fetchNearbySurfReport(BEACH, { fetchNow: () => new Date('2026-08-02T20:00:00Z') })
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.spot.name).toBe('Diamond Head Cliffs')
      expect(result.spot.distanceMiles).toBeLessThan(1)
      expect(result.spot.isDistant).toBe(false)
      expect(result.spot.likelyDifferentExposure).toBe(false)
      expect(result.hours).toHaveLength(1)
      expect(result.fetchedAtUtc).toBe('2026-08-02T20:00:00.000Z')

      // The spot id must come from the payload, never be hardcoded.
      expect(String(fetchSpy.mock.calls[1][0])).toContain('spotId=diamond')

      fetchSpy.mockRestore()
      vi.unstubAllEnvs()
    })

    it('marks a distant, differently-exposed break as such instead of presenting it plainly', async () => {
      vi.stubEnv('SURFLINE_ENABLED', '1')
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        if (String(input).includes('/nearby')) {
          return Promise.resolve(
            Response.json({
              data: { spots: [{ _id: 'north', name: 'Sunset Beach', lat: 21.675, lon: -158.041 }] },
            }),
          )
        }
        return Promise.resolve(
          Response.json({
            data: { wave: [{ timestamp: 1785715200, surf: { min: 6, max: 10 } }] },
          }),
        )
      })

      const result = await fetchNearbySurfReport(BEACH)
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      // ~29 miles away on the opposite coast — the card must say so.
      expect(result.spot.distanceMiles).toBeGreaterThan(25)
      expect(result.spot.isDistant).toBe(true)
      expect(result.spot.likelyDifferentExposure).toBe(true)

      fetchSpy.mockRestore()
      vi.unstubAllEnvs()
    })
  })
})

describe('isolation from the verdict engine', () => {
  it('is not imported anywhere under lib/engine', async () => {
    // The hard rule from the file header, enforced rather than trusted.
    const { readdirSync, readFileSync } = await import('node:fs')
    const dir = new URL('../engine/', import.meta.url)
    const offenders = readdirSync(dir)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => readFileSync(new URL(file, dir), 'utf-8').includes('surfline'))
    expect(offenders).toEqual([])
  })
})
