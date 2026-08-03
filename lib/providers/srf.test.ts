import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bandsForShore, extractIslandSection, parseSurfZoneForecast } from './srf'

const realProduct = JSON.parse(
  readFileSync(new URL('../../fixtures/raw/srf-2026-08-02.json', import.meta.url), 'utf-8'),
) as { issuanceTime: string; productText: string }

describe('parseSurfZoneForecast against the real 2026-08-02 HFO product', () => {
  const { forecast, warnings } = parseSurfZoneForecast(
    realProduct.productText,
    realProduct.issuanceTime,
    'Oahu',
  )

  it('parses without layout warnings', () => {
    expect(warnings).toEqual([])
    expect(forecast).not.toBeNull()
  })

  it('reads all four shore aspects across all four columns', () => {
    expect(forecast?.bands).toHaveLength(16)
  })

  it('reads the south-facing bands that govern Cromwell’s', () => {
    const south = bandsForShore(forecast!, 'south')
    expect(south.map((b) => [b.minFt, b.maxFt])).toEqual([
      [1, 3],
      [1, 3],
      [1, 3],
      [1, 3],
    ])
  })

  it('reads the east-facing bands that the raw wave model was actually reporting', () => {
    // This is the crux of the calibration: the model's 4.5 ft matches these
    // east-facing numbers, not the 1-3 ft south-facing shore Cromwell's sits on.
    const east = bandsForShore(forecast!, 'east')
    expect(east.map((b) => [b.minFt, b.maxFt])).toEqual([
      [5, 7],
      [4, 6],
      [4, 6],
      [4, 6],
    ])
  })

  it('labels columns by day and period', () => {
    expect(bandsForShore(forecast!, 'south').map((b) => b.column)).toEqual([
      'Tonight PM',
      'Tonight AM',
      'Monday AM',
      'Monday PM',
    ])
  })

  it('records the issuance time in UTC', () => {
    expect(forecast?.issuedUtc).toBe('2026-08-03T01:55:00.000Z')
  })

  it('reads Oahu’s table, not the Kauai one that precedes it', () => {
    // Kauai's south-facing row happens to match Oahu's, so assert on a row that
    // differs to prove the section boundary is respected.
    const kauai = parseSurfZoneForecast(realProduct.productText, realProduct.issuanceTime, 'Kauai')
    expect(bandsForShore(kauai.forecast!, 'east')[0]).toMatchObject({ minFt: 5, maxFt: 7 })
    expect(forecast?.island).toBe('Oahu')
  })
})

describe('extractIslandSection', () => {
  it('stops at the following zone-code block', () => {
    const section = extractIslandSection(realProduct.productText, 'Oahu')
    expect(section).not.toBeNull()
    expect(section!.some((line) => line.includes('Facing'))).toBe(true)
    // The next island's own header must not leak in.
    expect(section!.some((line) => line.trim() === 'Maui-')).toBe(false)
  })

  it('returns null for an island not in the product', () => {
    expect(extractIslandSection(realProduct.productText, 'Guam')).toBeNull()
  })
})

describe('parseSurfZoneForecast degradation', () => {
  it('reports a missing island instead of throwing', () => {
    const { forecast, warnings } = parseSurfZoneForecast('nothing useful here', '2026-08-02T00:00:00Z', 'Oahu')
    expect(forecast).toBeNull()
    expect(warnings[0]).toMatch(/no section found/)
  })

  it('reports a missing sub-column ruler instead of guessing', () => {
    const text = ['Oahu-', '355 PM HST Sun Aug 2 2026', '', 'South Facing   1-3   1-3', ''].join('\n')
    const { forecast, warnings } = parseSurfZoneForecast(text, '2026-08-02T00:00:00Z', 'Oahu')
    expect(forecast).toBeNull()
    expect(warnings[0]).toMatch(/AM\/PM sub-column header/)
  })

  it('skips a shore row whose value count does not match the columns', () => {
    const text = [
      'Oahu-',
      '',
      '                      Tonight                    Monday',
      'Shores                  Surf                       Surf',
      '                     PM     AM                  AM     PM',
      '',
      'South Facing         1-3    1-3                 1-3    1-3',
      'East Facing          5-7    4-6',
      '',
    ].join('\n')
    const { forecast, warnings } = parseSurfZoneForecast(text, '2026-08-02T00:00:00Z', 'Oahu')

    // The well-formed row still parses; the malformed one is dropped and reported.
    expect(bandsForShore(forecast!, 'south')).toHaveLength(4)
    expect(bandsForShore(forecast!, 'east')).toHaveLength(0)
    expect(warnings.some((w) => /east facing row has 2 surf values but 4 columns/.test(w))).toBe(true)
  })
})
