import { CLARITY_MODEL } from '../conditions/clarity'
import { windExposureFor } from '../geo'
import { DEFAULT_LENSES } from '../lenses/defaults'
import type { LensId } from '../lenses/schema'
import { VISIBILITY_FT, type StoredReport } from './schema'

/**
 * Suggestions from Sal's visit reports. Every one is a suggestion with the
 * evidence behind it — nothing here changes a threshold or a model. Each comes
 * as decision-ready options with a recommended default.
 */

/** Reports per lens before thresholds are suggested. */
export const MIN_REPORTS_FOR_THRESHOLDS = 8
/** Reports before clarity coefficients are fitted (Sal, 2026-10-11). */
export const MIN_REPORTS_FOR_CLARITY = 10

export type Option = { label: string; detail: string; recommended?: boolean }
export type Suggestion = { id: string; title: string; evidence: string; options: Option[] }

const lensOf = (activity: StoredReport['report']['activity']): LensId => (activity === 'swim' ? 'beach' : activity)

// ---------------------------------------------------------------------------
// Lens agreement and threshold suggestions
// ---------------------------------------------------------------------------

export type LensAgreement = { lens: LensId; reports: number; agree: number; tooStrict: number; tooLoose: number }

/** "Would go again" against the lens's fit for the activity they reported. */
export function lensAgreement(reports: readonly StoredReport[]): LensAgreement[] {
  const out = new Map<LensId, LensAgreement>()
  for (const r of reports) {
    const lens = lensOf(r.report.activity)
    const fit = r.forecast.lenses.find((l) => l.lens === lens)?.fit
    if (!fit || fit === 'unknown') continue
    const a = out.get(lens) ?? { lens, reports: 0, agree: 0, tooStrict: 0, tooLoose: 0 }
    a.reports++
    const want = r.report.again === 'yes' ? 'good' : r.report.again === 'maybe' ? 'mixed' : 'poor'
    const rank = { good: 0, mixed: 1, poor: 2 } as const
    if (rank[fit] === rank[want]) a.agree++
    else if (rank[fit] > rank[want]) a.tooStrict++
    else a.tooLoose++
    out.set(lens, a)
  }
  return [...out.values()]
}

/**
 * The cut that best separates "yes" (value ≤ cut) from the rest, by accuracy.
 * Candidates are midpoints between observed values.
 */
export function bestCeiling(points: readonly { value: number; positive: boolean }[]): { cut: number; accuracy: number } | null {
  const pos = points.filter((p) => p.positive).length
  if (pos === 0 || pos === points.length) return null
  const values = [...new Set(points.map((p) => p.value))].sort((a, b) => a - b)
  let best: { cut: number; accuracy: number } | null = null
  for (let i = 0; i < values.length - 1; i++) {
    const cut = (values[i] + values[i + 1]) / 2
    const correct = points.filter((p) => (p.value <= cut) === p.positive).length
    const accuracy = correct / points.length
    if (!best || accuracy > best.accuracy) best = { cut, accuracy }
  }
  return best
}

const FACTORS = [
  { id: 'waves', label: 'Swell energy', unit: 'ft²·s', get: (r: StoredReport) => r.forecast.facts?.swellEnergy ?? null },
  { id: 'wind', label: 'Wind', unit: 'mph', get: (r: StoredReport) => r.forecast.facts?.windMph ?? null },
  { id: 'chop', label: 'Chop', unit: 'ft', get: (r: StoredReport) => r.forecast.facts?.chopFt ?? null },
] as const

export function thresholdSuggestions(reports: readonly StoredReport[]): Suggestion[] {
  const out: Suggestion[] = []
  const byLens = new Map<LensId, StoredReport[]>()
  for (const r of reports) {
    const lens = lensOf(r.report.activity)
    ;(byLens.get(lens) ?? byLens.set(lens, []).get(lens)!).push(r)
  }
  for (const [lens, rs] of byLens) {
    if (rs.length < MIN_REPORTS_FOR_THRESHOLDS) continue
    for (const f of FACTORS) {
      const pts = rs.map((r) => ({ value: f.get(r), again: r.report.again })).filter((p): p is { value: number; again: typeof p.again } => p.value !== null)
      if (pts.length < MIN_REPORTS_FOR_THRESHOLDS) continue
      const good = bestCeiling(pts.map((p) => ({ value: p.value, positive: p.again === 'yes' })))
      const mixed = bestCeiling(pts.map((p) => ({ value: p.value, positive: p.again !== 'no' })))
      if (!good) continue
      const rule = DEFAULT_LENSES[lens].factors[f.id]
      const current = rule.kind === 'ceiling' ? `${rule.good} / ${rule.mixed ?? '—'}` : rule.kind === 'wind' ? `${rule.cross.good} cross-shore` : 'n/a'
      const round = (v: number) => (f.unit === 'ft' ? Math.round(v * 10) / 10 : Math.round(v))
      const strong = good.accuracy >= 0.8 && pts.length >= 12
      out.push({
        id: `threshold:${lens}:${f.id}`,
        title: `${DEFAULT_LENSES[lens].name}: ${f.label.toLowerCase()} limits`,
        evidence: `${pts.length} reports. "Would go again: yes" splits best at ${round(good.cut)} ${f.unit} (${Math.round(good.accuracy * 100)}% of reports agree)${mixed ? `; yes-or-maybe at ${round(mixed.cut)} ${f.unit}` : ''}. Current default: ${current}.`,
        options: [
          { label: `Set good ≤ ${round(good.cut)}${mixed ? `, mixed ≤ ${round(mixed.cut)}` : ''} ${f.unit}`, detail: 'Follows your reports.', recommended: strong },
          { label: 'Keep the current default', detail: `Wait for more reports (${pts.length} so far).`, recommended: !strong },
        ],
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Clarity: fitted coefficients
// ---------------------------------------------------------------------------

/** Solve a small linear system by Gaussian elimination. Null when singular. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r
    if (Math.abs(m[p][c]) < 1e-9) return null
    ;[m[c], m[p]] = [m[p], m[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const k = m[r][c] / m[c][c]
      for (let j = c; j <= n; j++) m[r][j] -= k * m[c][j]
    }
  }
  return m.map((row, i) => row[n] / row[i])
}

export type ClarityFit = {
  reports: number
  clearDayFt: number
  ftLostPerEnergy: number
  ftLostPerWindMph: number
  ftLostPerRainInch: number
  maeBeforeFt: number
  maeAfterFt: number
}

/**
 * Least-squares fit of reported visibility (bucket midpoint, 30+ read as 35)
 * on the clarity model's own inputs. Losses are constrained to be ≥ 0 by
 * dropping any feature that fits negative and refitting.
 */
export function fitClarity(reports: readonly StoredReport[]): ClarityFit | null {
  const m = CLARITY_MODEL
  const rows = reports
    .map((r) => {
      const c = r.forecast.facts?.clarity
      if (!c || c.inputs.swellEnergy === null) return null
      const [lo, hi] = VISIBILITY_FT[r.report.visibility]
      const onshore = c.inputs.windDirectionDeg !== null && windExposureFor(c.inputs.windDirectionDeg, 'south') !== 'offshore'
      return {
        y: r.report.visibility === '30+' ? 35 : (lo + hi) / 2,
        x: [
          Math.max(0, c.inputs.swellEnergy - m.swellFreeEnergy),
          Math.max(0, (c.inputs.windMph ?? 0) - m.windFreeMph) * (onshore ? m.onshoreFactor : 1),
          c.inputs.rain48hIn ?? 0,
        ],
        estimate: c.ft,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  if (rows.length < MIN_REPORTS_FOR_CLARITY) return null

  // An input that never varies across the reports can't be fitted (and makes
  // the system singular) — leave its loss at zero rather than invent one.
  let active = [0, 1, 2].filter((j) => {
    const xs = rows.map((r) => r.x[j])
    return Math.max(...xs) - Math.min(...xs) > 1e-9
  })
  let coef: number[] | null = null
  for (let pass = 0; pass < 3; pass++) {
    const k = active.length + 1
    const ata = Array.from({ length: k }, () => Array(k).fill(0))
    const aty = Array(k).fill(0)
    for (const r of rows) {
      const v = [1, ...active.map((j) => r.x[j])]
      for (let i = 0; i < k; i++) {
        aty[i] += v[i] * r.y
        for (let j = 0; j < k; j++) ata[i][j] += v[i] * v[j]
      }
    }
    coef = solve(ata, aty)
    if (!coef) return null
    // Losses enter negatively: a positive coefficient means "more of this, clearer", which is wrong — drop it.
    const bad = active.filter((_, i) => coef![i + 1] > 0)
    if (!bad.length) break
    active = active.filter((j) => !bad.includes(j))
  }
  if (!coef) return null
  const loss = [0, 0, 0]
  active.forEach((j, i) => (loss[j] = -coef![i + 1]))
  const predict = (x: number[]) => coef![0] - loss[0] * x[0] - loss[1] * x[1] - loss[2] * x[2]
  const mae = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + Math.abs(f(r) - r.y), 0) / rows.length
  return {
    reports: rows.length,
    clearDayFt: Math.round(coef[0]),
    ftLostPerEnergy: Math.round(loss[0] * 1000) / 1000,
    ftLostPerWindMph: Math.round(loss[1] * 100) / 100,
    ftLostPerRainInch: Math.round(loss[2] * 10) / 10,
    maeBeforeFt: Math.round(mae((r) => r.estimate) * 10) / 10,
    maeAfterFt: Math.round(mae((r) => predict(r.x)) * 10) / 10,
  }
}

export function claritySuggestion(reports: readonly StoredReport[]): Suggestion {
  const fit = fitClarity(reports)
  const withClarity = reports.filter((r) => r.forecast.facts?.clarity).length
  if (!fit) {
    return {
      id: 'clarity',
      title: 'Clarity model',
      evidence: `${withClarity} of ${MIN_REPORTS_FOR_CLARITY} reports needed before coefficients can be fitted. Clarity stays out of every fit until then.`,
      options: [{ label: 'Keep logging', detail: 'Nothing to decide yet.', recommended: true }],
    }
  }
  const good = fit.maeAfterFt <= 5 && fit.maeAfterFt < fit.maeBeforeFt
  return {
    id: 'clarity',
    title: 'Clarity model',
    evidence: `Fitted on ${fit.reports} reports: clear-day ${fit.clearDayFt} ft (now ${CLARITY_MODEL.clearDayFt}), ${fit.ftLostPerEnergy} ft per unit of swell energy (now ${CLARITY_MODEL.ftLostPerEnergy}), ${fit.ftLostPerWindMph} ft per mph of wind (now ${CLARITY_MODEL.ftLostPerWindMph}), ${fit.ftLostPerRainInch} ft per inch of rain (now ${CLARITY_MODEL.ftLostPerRainInch}). Average miss: ${fit.maeBeforeFt} ft now, ${fit.maeAfterFt} ft fitted.`,
    options: [
      { label: 'Adopt the fitted coefficients and set clarity affectsFit: true', detail: 'Clarity starts counting toward fit.', recommended: good },
      { label: 'Adopt the coefficients, keep affectsFit: false', detail: 'Better estimate, still display-only.', recommended: !good && fit.maeAfterFt < fit.maeBeforeFt },
      { label: 'Keep the current model', detail: `The fit doesn't help enough yet (average miss ${fit.maeAfterFt} ft).`, recommended: !good && fit.maeAfterFt >= fit.maeBeforeFt },
    ],
  }
}

// ---------------------------------------------------------------------------
// Tide band
// ---------------------------------------------------------------------------

export function tideSuggestion(reports: readonly StoredReport[], band: { minFt: number; maxFt: number }): Suggestion | null {
  const good = reports
    .filter((r) => r.report.again === 'yes' && r.report.surge !== 'strong' && r.forecast.facts?.tideFt != null)
    .map((r) => r.forecast.facts!.tideFt!)
  const bad = reports.filter((r) => r.report.again === 'no' && r.forecast.facts?.tideFt != null).map((r) => r.forecast.facts!.tideFt!)
  if (good.length < 5) return null
  const lo = Math.round(Math.min(...good) * 10) / 10
  const hi = Math.round(Math.max(...good) * 10) / 10
  const outside = good.filter((t) => t < band.minFt || t > band.maxFt).length
  return {
    id: 'tide-band',
    title: 'Tide band (provisional)',
    evidence: `${good.length} good sessions between ${lo} and ${hi} ft (${outside} outside the current ${band.minFt}–${band.maxFt} ft band); ${bad.length} "wouldn't go again" reports.`,
    options: [
      { label: `Set the band to ${lo}–${hi} ft`, detail: 'Matches where your good sessions happened.', recommended: outside >= 2 },
      { label: 'Keep the band, mark it less provisional', detail: 'Reports sit inside it.', recommended: outside < 2 },
      { label: 'Keep it as is', detail: 'Wait for sessions at a dead low and near high tide.' },
    ],
  }
}
