import { CLARITY_MODEL } from '../conditions/clarity'
import { VISIBILITY_FT, type StoredReport } from './schema'

/**
 * Where a visit report disagrees with the forecast for its hour.
 *
 * Read by Sal through /api/reports/calibration and the private /calibration
 * page. Findings never change anything by themselves — one report is an
 * anecdote; suggestions say how many agree.
 */

export type FindingKind = 'clarity' | 'surge' | 'fit' | 'tide'

export type Finding = {
  kind: FindingKind
  reportId: string
  date: string
  hour: number
  /** One line: what the forecast said vs what was seen. */
  summary: string
}

const r1 = (v: number | null) => (v === null ? '?' : String(Math.round(v * 10) / 10))
const r0 = (v: number | null) => (v === null ? '?' : String(Math.round(v)))

const lensFor = (activity: StoredReport['report']['activity']) => (activity === 'swim' ? 'beach' : activity)

export function findingsFor(r: StoredReport): Finding[] {
  const out: Finding[] = []
  const base = { reportId: r.id, date: r.date, hour: r.hour }
  const facts = r.forecast.facts
  if (!facts) return out

  // Clarity: the estimate should land inside, or within 5 ft of, the reported bucket.
  if (facts.clarity) {
    const [lo, hi] = VISIBILITY_FT[r.report.visibility]
    const est = facts.clarity.ft
    if (est < lo - 5 || est > hi + 5) {
      out.push({
        ...base,
        kind: 'clarity',
        summary: `Clarity estimate ~${est} ft, reported ${r.report.visibility} ft (swell ${r1(facts.swellFt)} ft, energy ${r0(facts.swellEnergy)}, wind ${r0(facts.windMph)} mph, 48h rain ${facts.rain48hIn ?? '?'} in)`,
      })
    }
  }

  // Surge at the entry vs the swell the forecast called fine (or not).
  const snorkel = r.forecast.lenses.find((l) => l.lens === 'snorkel')
  if (snorkel) {
    if (r.report.surge === 'strong' && snorkel.tags.waves === 'good') {
      out.push({ ...base, kind: 'surge', summary: `Strong surge reported with ${r1(facts.swellFt)} ft swell (energy ${r0(facts.swellEnergy)}) — snorkel lens called waves good` })
    }
    if (r.report.surge === 'calm' && snorkel.tags.waves === 'poor') {
      out.push({ ...base, kind: 'surge', summary: `Calm entry reported with ${r1(facts.swellFt)} ft swell (energy ${r0(facts.swellEnergy)}) — snorkel lens called waves poor` })
    }
  }

  // Would they go again vs the fit for their activity.
  const lens = r.forecast.lenses.find((l) => l.lens === lensFor(r.report.activity))
  if (lens) {
    if (r.report.again === 'no' && lens.fit === 'good') {
      out.push({ ...base, kind: 'fit', summary: `${r.report.activity}: wouldn't go again, but the ${lens.lens} lens said good fit` })
    }
    if (r.report.again === 'yes' && lens.fit === 'poor') {
      out.push({ ...base, kind: 'fit', summary: `${r.report.activity}: would go again, but the ${lens.lens} lens said poor fit` })
    }
  }

  // A good session outside the provisional tide band is evidence about the band's edges.
  if (r.report.again === 'yes' && r.report.surge !== 'strong' && facts.tideVsBand && facts.tideVsBand !== 'in') {
    out.push({
      ...base,
      kind: 'tide',
      summary: `Good session at ${r1(facts.tideFt)} ft tide (${facts.tideVsBand} of the provisional band)`,
    })
  }

  return out
}

export type CalibrationSummary = {
  reports: number
  findings: Finding[]
  /** Mean (reported midpoint − estimate) over reports with both, ft. Positive = estimate too pessimistic. */
  clarityBiasFt: number | null
  clarityModelVersion: string
}

export function summarize(reports: readonly StoredReport[]): CalibrationSummary {
  const diffs: number[] = []
  for (const r of reports) {
    const est = r.forecast.facts?.clarity?.ft
    if (est === undefined) continue
    const [lo, hi] = VISIBILITY_FT[r.report.visibility]
    diffs.push((lo + Math.min(hi, 40)) / 2 - est)
  }
  return {
    reports: reports.length,
    findings: reports.flatMap(findingsFor),
    clarityBiasFt: diffs.length ? Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10 : null,
    clarityModelVersion: CLARITY_MODEL.version,
  }
}
