import { describe, expect, it } from 'vitest'
import {
  honoluluDateOf,
  honoluluHourOf,
  honoluluLocalToUtc,
  toHonoluluLocal,
  utcToHonoluluLocal,
} from './time'

describe('toHonoluluLocal', () => {
  it('accepts the Open-Meteo local form', () => {
    expect(toHonoluluLocal('2026-08-02T07:00')).toBe('2026-08-02T07:00')
  })

  it('accepts the NOAA CO-OPS lst_ldt form', () => {
    expect(toHonoluluLocal('2026-08-02 07:00')).toBe('2026-08-02T07:00')
  })

  it('throws rather than guessing at an unknown format', () => {
    // A silently mis-parsed timestamp would misalign every source against the others.
    expect(() => toHonoluluLocal('2026-08-02T07:00:00Z')).toThrow(/Unrecognized/)
    expect(() => toHonoluluLocal('08/02/2026 7am')).toThrow(/Unrecognized/)
    expect(() => toHonoluluLocal('')).toThrow(/Unrecognized/)
  })
})

describe('honoluluLocalToUtc', () => {
  it('applies the constant UTC-10 offset', () => {
    expect(honoluluLocalToUtc('2026-08-02T07:00').toISOString()).toBe('2026-08-02T17:00:00.000Z')
  })

  it('rolls into the next UTC day for afternoon local times', () => {
    expect(honoluluLocalToUtc('2026-08-02T18:00').toISOString()).toBe('2026-08-03T04:00:00.000Z')
  })

  it('does not shift across the summer/winter boundary', () => {
    // Hawaiʻi does not observe daylight saving, so January and July agree.
    expect(honoluluLocalToUtc('2026-01-15T06:00').toISOString()).toBe('2026-01-15T16:00:00.000Z')
    expect(honoluluLocalToUtc('2026-07-15T06:00').toISOString()).toBe('2026-07-15T16:00:00.000Z')
  })

  it('round-trips with utcToHonoluluLocal', () => {
    const local = '2026-08-02T07:00'
    expect(utcToHonoluluLocal(honoluluLocalToUtc(local))).toBe(local)
  })
})

describe('day boundaries in Pacific/Honolulu', () => {
  it('keeps local midnight on the local calendar day, not the UTC one', () => {
    // 2026-08-02T00:00 HST is 2026-08-02T10:00Z — same date here, but the
    // reverse case below is where a naive UTC slice goes wrong.
    expect(honoluluDateOf('2026-08-02T00:00')).toBe('2026-08-02')
    expect(honoluluLocalToUtc('2026-08-02T00:00').toISOString()).toBe('2026-08-02T10:00:00.000Z')
  })

  it('keeps a late local evening on the local day even though UTC has advanced', () => {
    const local = '2026-08-02T23:00'
    expect(honoluluDateOf(local)).toBe('2026-08-02')
    // UTC is already the 3rd; grouping by UTC date would file this under the wrong day.
    expect(honoluluLocalToUtc(local).toISOString()).toBe('2026-08-03T09:00:00.000Z')
  })

  it('reads the local hour used for morning-window preference', () => {
    expect(honoluluHourOf('2026-08-02T07:00')).toBe(7)
    expect(honoluluHourOf('2026-08-02T00:00')).toBe(0)
    expect(honoluluHourOf('2026-08-02T23:00')).toBe(23)
  })
})
