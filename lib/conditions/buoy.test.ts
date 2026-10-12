import { describe, expect, it } from 'vitest'
import { CROMWELLS } from '../beach/cromwells'
import { compassToDeg, fetchBuoy, parseSpec } from '../providers/buoy'
import { compareBuoy, correctionAt } from './buoy'
import { confidenceFor } from './confidence'

const SPEC = `#YY  MM DD hh mm WVHT  SwH  SwP  WWH  WWP SwD WWD  STEEPNESS  APD MWD
#yr  mo dy hr mn    m    m  sec    m  sec  -  degT     -      sec degT
2026 10 12 08 30   MM   MM   MM   MM   MM  MM  MM        N/A   MM  MM
2026 10 12 08 00  0.8  0.7 16.7  0.5  9.1 SSE   S      SWELL 10.0 157
`

describe('NDBC .spec parsing', () => {
  it('reads the newest complete row in feet, with compass directions as degrees', () => {
    const obs = parseSpec(SPEC, '51211')
    expect(obs.observedUtc).toBe('2026-10-12T08:00:00.000Z')
    expect(obs.swellHeightFt).toBe(2.3)
    expect(obs.swellPeriodSec).toBe(16.7)
    expect(obs.swellFromDeg).toBe(157.5)
    expect(obs.swellFromText).toBe('SSE')
    expect(obs.windWaveHeightFt).toBe(1.6)
  })

  it('maps 16-point compass text', () => {
    expect(compassToDeg('S')).toBe(180)
    expect(compassToDeg('SSW')).toBe(202.5)
    expect(compassToDeg('MM')).toBeNull()
  })

  it('treats a 404 page or a non-spec body as a failure', async () => {
    const r404 = await fetchBuoy('51204', { fetchImpl: (async () => new Response('<html>', { status: 404 })) as typeof fetch })
    expect(r404.ok).toBe(false)
    const html = await fetchBuoy('51211', { fetchImpl: (async () => new Response('<html>nope</html>')) as typeof fetch })
    expect(html.ok).toBe(false)
  })
})

const obs = (over: Partial<ReturnType<typeof parseSpec>> = {}) => ({ ...parseSpec(SPEC, '51211'), ...over })
const NOW = new Date('2026-10-12T08:20:00Z')

describe('buoy vs forecast', () => {
  it('compares swell from inside the window and computes the correction', () => {
    const c = compareBuoy(obs(), 3.5, CROMWELLS.exposedSwellDirections, NOW)
    expect(c.inWindow).toBe(true)
    expect(c.divergencePct).toBe(-34)
    expect(c.correction).toBeCloseTo(2.3 / 3.5)
  })

  it('never uses a west swell the cove does not see', () => {
    const c = compareBuoy(obs({ swellFromDeg: 270, swellFromText: 'W' }), 3.5, CROMWELLS.exposedSwellDirections, NOW)
    expect(c.inWindow).toBe(false)
    expect(c.correction).toBe(1)
    expect(c.divergencePct).toBeNull()
  })

  it('ignores a stale buoy', () => {
    const c = compareBuoy(obs(), 3.5, CROMWELLS.exposedSwellDirections, new Date('2026-10-12T11:00:00Z'))
    expect(c.stale).toBe(true)
    expect(c.correction).toBe(1)
  })

  it('caps the correction and fades it over six hours', () => {
    const c = compareBuoy(obs({ swellHeightFt: 9 }), 2, CROMWELLS.exposedSwellDirections, NOW)
    expect(c.correction).toBe(2)
    expect(correctionAt(0.6, 0)).toBeCloseTo(0.6)
    expect(correctionAt(0.6, 3)).toBeCloseTo(0.8)
    expect(correctionAt(0.6, 6)).toBe(1)
    expect(correctionAt(0.6, 7)).toBe(1)
  })
})

describe('computed confidence', () => {
  const base = { dataIssue: null, nwsDisagrees: false, nwsMissing: false, buoyDivergencePct: null, daysAhead: 0, uncheckedSources: [] }
  it('is high when sources agree and data is fresh', () => {
    expect(confidenceFor(base)).toEqual({ level: 'high', reasons: [] })
  })
  it('drops with disagreement, gaps and lead time, saying why', () => {
    expect(confidenceFor({ ...base, buoyDivergencePct: -34 }).level).toBe('medium')
    expect(confidenceFor({ ...base, buoyDivergencePct: 70 }).level).toBe('low')
    expect(confidenceFor({ ...base, nwsDisagrees: true }).reasons[0]).toMatch(/Weather Service/)
    expect(confidenceFor({ ...base, daysAhead: 4 }).level).toBe('medium')
    expect(confidenceFor({ ...base, daysAhead: 7 }).level).toBe('low')
    expect(confidenceFor({ ...base, dataIssue: 'stale' }).level).toBe('low')
    expect(confidenceFor({ ...base, uncheckedSources: ['advisories'] }).reasons).toEqual(["couldn't check advisories"])
  })
  it('never uses safety words', () => {
    const all = confidenceFor({ dataIssue: 'missing', nwsDisagrees: true, nwsMissing: true, buoyDivergencePct: 90, daysAhead: 8, uncheckedSources: ['advisories', 'water quality'] })
    for (const r of all.reasons) expect(r).not.toMatch(/\b(safe|unsafe|danger|guarantee)/i)
  })
})
