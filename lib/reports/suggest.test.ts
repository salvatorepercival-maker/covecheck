import { describe, expect, it } from 'vitest'
import { hourFacts } from '../lenses/test-facts'
import type { StoredReport } from './schema'
import { bestCeiling, claritySuggestion, fitClarity, lensAgreement, MIN_REPORTS_FOR_CLARITY, thresholdSuggestions, tideSuggestion } from './suggest'

let n = 0
function report(over: Partial<StoredReport['report']>, facts: Partial<ReturnType<typeof hourFacts>>, snorkelFit: 'good' | 'mixed' | 'poor' = 'good'): StoredReport {
  n++
  return {
    version: 1,
    id: `r${n}`,
    receivedUtc: '2026-10-12T20:00:00Z',
    beachId: 'cromwells',
    date: '2026-10-12',
    hour: 9,
    report: { activity: 'snorkel', visibility: '20-30', surge: 'calm', again: 'yes', note: '', hour: 9, ...over },
    forecast: { engineVersion: 'e', configVersion: 'c', engineVerdict: null, facts: hourFacts(facts), lenses: [{ lens: 'snorkel', fit: snorkelFit, tags: {} }] },
  }
}

describe('lens agreement', () => {
  it('counts where the fit matched "would go again", and which way it missed', () => {
    const a = lensAgreement([report({ again: 'yes' }, {}, 'good'), report({ again: 'yes' }, {}, 'poor'), report({ again: 'no' }, {}, 'good')])
    expect(a).toEqual([{ lens: 'snorkel', reports: 3, agree: 1, tooStrict: 1, tooLoose: 1 }])
  })
})

describe('threshold suggestions', () => {
  it('finds the cut that separates yes from no', () => {
    expect(bestCeiling([{ value: 50, positive: true }, { value: 80, positive: true }, { value: 140, positive: false }, { value: 200, positive: false }])).toEqual({ cut: 110, accuracy: 1 })
    expect(bestCeiling([{ value: 1, positive: true }])).toBeNull()
  })

  it('suggests only after enough reports, and never applies anything', () => {
    const few = Array.from({ length: 5 }, (_, i) => report({ again: i < 3 ? 'yes' : 'no' }, { swellEnergy: 40 + i * 30 }))
    expect(thresholdSuggestions(few)).toEqual([])
    const many = Array.from({ length: 12 }, (_, i) => report({ again: i < 6 ? 'yes' : 'no' }, { swellEnergy: 20 + i * 20, windMph: 8, chopFt: 0 }))
    const s = thresholdSuggestions(many).find((x) => x.id === 'threshold:snorkel:waves')!
    expect(s.evidence).toMatch(/splits best at 130 ft²·s \(100% of reports agree\)/)
    expect(s.options[0]).toMatchObject({ recommended: true })
    expect(s.options.filter((o) => o.recommended)).toHaveLength(1)
  })
})

describe('clarity fit', () => {
  const clarityAt = (energy: number) => ({ ft: 25, confidence: 'low' as const, mainCause: null, inputs: { swellEnergy: energy, windMph: 5, windDirectionDeg: 0, rain48hIn: 0 }, modelVersion: 't' })
  it('waits for 10 reports', () => {
    const rs = Array.from({ length: MIN_REPORTS_FOR_CLARITY - 1 }, (_, i) => report({ visibility: '20-30' }, { clarity: clarityAt(10 * i) }))
    expect(fitClarity(rs)).toBeNull()
    expect(claritySuggestion(rs).evidence).toMatch(/9 of 10 reports/)
  })

  it('fits coefficients that explain the reports, and recommends turning clarity on when they do', () => {
    const buckets = ['30+', '30+', '20-30', '20-30', '10-20', '10-20', '<10', '<10', '20-30', '10-20'] as const
    const energies = [5, 10, 40, 50, 100, 110, 160, 170, 45, 105]
    const rs = buckets.map((v, i) => report({ visibility: v }, { clarity: clarityAt(energies[i]) }))
    const fit = fitClarity(rs)!
    expect(fit.reports).toBe(10)
    expect(fit.ftLostPerEnergy).toBeGreaterThan(0)
    expect(fit.maeAfterFt).toBeLessThan(fit.maeBeforeFt)
    const s = claritySuggestion(rs)
    expect(s.options.find((o) => o.recommended)?.label).toMatch(/affectsFit: true/)
  })
})

describe('tide band', () => {
  it('suggests from where good sessions happened', () => {
    const rs = [0.2, 0.5, 1.0, 1.7, 1.8].map((t) => report({ again: 'yes' }, { tideFt: t }))
    const s = tideSuggestion(rs, { minFt: 0, maxFt: 1.5 })!
    expect(s.evidence).toMatch(/5 good sessions between 0.2 and 1.8 ft \(2 outside/)
    expect(s.options[0]).toMatchObject({ label: 'Set the band to 0.2–1.8 ft', recommended: true })
  })
})
