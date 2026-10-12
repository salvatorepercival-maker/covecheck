import { describe, expect, it } from 'vitest'
import { hourFacts } from '../lenses/test-facts'
import { findingsFor, summarize } from './calibration'
import { reportInput, type StoredReport } from './schema'
import { getReportStore } from './store'

const stored = (over: Partial<StoredReport['report']> = {}, facts = hourFacts({ clarity: { ft: 25, confidence: 'low', mainCause: null, inputs: { exposedSwellFt: 1, windMph: 6, windDirectionDeg: 0, rain48hIn: 0 }, modelVersion: 't' } })): StoredReport => ({
  version: 1,
  id: 'r1',
  receivedUtc: '2026-10-12T20:00:00Z',
  beachId: 'cromwells',
  date: '2026-10-12',
  hour: 9,
  report: { activity: 'snorkel', visibility: '20-30', surge: 'calm', again: 'yes', note: '', hour: 9, ...over },
  forecast: {
    engineVersion: 'e',
    configVersion: 'c',
    engineVerdict: 'great',
    facts,
    lenses: [{ lens: 'snorkel', fit: 'good', tags: { waves: 'good' } }],
  },
})

describe('calibration findings', () => {
  it('a report that agrees produces nothing', () => {
    expect(findingsFor(stored())).toEqual([])
  })

  it('flags clarity, surge and fit disagreements', () => {
    const kinds = findingsFor(stored({ visibility: '<10', surge: 'strong', again: 'no' })).map((f) => f.kind)
    expect(kinds).toEqual(['clarity', 'surge', 'fit'])
  })

  it('treats a good session outside the tide band as tide evidence', () => {
    const r = stored({}, hourFacts({ tideFt: 1.8, tideVsBand: 'high' }))
    expect(findingsFor(r).map((f) => f.kind)).toContain('tide')
  })

  it('reports clarity bias across reports', () => {
    expect(summarize([stored({ visibility: '<10' })]).clarityBiasFt).toBe(-20)
  })
})

describe('report input', () => {
  it('rejects unknown buckets and accepts a complete report', () => {
    expect(reportInput.safeParse({ activity: 'snorkel', visibility: '5ft', surge: 'calm', again: 'yes', hour: 9, elapsedMs: 5000 }).success).toBe(false)
    expect(reportInput.safeParse({ activity: 'swim', visibility: '30+', surge: 'calm', again: 'yes', hour: 9, elapsedMs: 5000 }).success).toBe(true)
  })
})

describe('report store', () => {
  it('refuses to fake storage in production without credentials', () => {
    expect(getReportStore({ NODE_ENV: 'production' })).toBeNull()
  })

  it('rate-limits with an expiring counter', async () => {
    const store = getReportStore({ NODE_ENV: 'test' })!
    const key = `k-${Math.random()}`
    expect(await store.hit(key, 60)).toBe(1)
    expect(await store.hit(key, 60)).toBe(2)
  })
})
