import type { DayFacts, HourFacts } from '../facts'
import { formatCompassWord, formatRange } from './words'
import type { FactorId, FactorRule, FactorTag, Fit, Lens, LensOverrides } from './schema'
import { FACTOR_IDS, affectsFit, type Limits, type WindRule } from './schema'
import { WIND_CLASS_WORDS, type WindClass } from '../conditions/wind'

/**
 * Runs a lens over hourly facts.
 *
 * Pure and deterministic. Never judges safety — only how well conditions fit the
 * activity, against thresholds the viewer can see and change.
 */

/** Usable daylight hours for an outing, matching the engine's window bounds. */
export const DAY_HOURS = { first: 6, last: 18 } as const

/**
 * NWS surf this big on the beach's shore makes calm-water lenses poor whatever
 * the cove-filtered swell says — the engine's one unilateral surf gate
 * (`srfExtremeSurfFaceFt`, 6 ft at Cromwell's).
 */
export const NWS_EXTREME_SURF_FT = 6

export function withOverrides(lens: Lens, overrides: LensOverrides | undefined): Lens {
  if (!overrides) return lens
  return { ...lens, factors: { ...lens.factors, ...overrides } }
}

const RANK: Record<Fit, number> = { good: 0, mixed: 1, poor: 2 }
const worse = (a: Fit, b: Fit): Fit => (RANK[a] >= RANK[b] ? a : b)

/** The sustained and gust limits that apply to a wind class, with the offshore cap applied. */
export function windLimitsFor(rule: WindRule, windClass: WindClass): { sustained: Limits; gust: Limits } {
  const tighter = (a: Limits, b: Limits): Limits => ({
    good: Math.min(a.good, b.good),
    mixed: a.mixed === null ? b.mixed : b.mixed === null ? a.mixed : Math.min(a.mixed, b.mixed),
  })
  if (windClass === 'cross') return { sustained: rule.cross, gust: rule.gustCross }
  if (windClass === 'onshore') return { sustained: rule.onshore, gust: rule.gustOnshore }
  return rule.offshoreNoLooserThanCross
    ? { sustained: tighter(rule.offshore, rule.cross), gust: tighter(rule.gustOffshore, rule.gustCross) }
    : { sustained: rule.offshore, gust: rule.gustOffshore }
}

function ceiling(value: number, t: { good: number; mixed: number | null }): Fit {
  if (value <= t.good) return 'good'
  if (t.mixed === null || value <= t.mixed) return 'mixed'
  return 'poor'
}

function floor(value: number, t: { good: number; mixed: number | null }): Fit {
  if (value >= t.good) return 'good'
  if (t.mixed === null || value >= t.mixed) return 'mixed'
  return 'poor'
}

export function tagFactor(id: FactorId, rule: FactorRule, f: HourFacts): FactorTag {
  if (rule.kind === 'off') return 'off'

  const numeric = (value: number | null) => {
    if (value === null) return 'unknown' as const
    if (rule.kind === 'ceiling') return ceiling(value, rule)
    if (rule.kind === 'floor') return floor(value, rule)
    if (rule.kind === 'range') {
      if (value >= rule.good[0] && value <= rule.good[1]) return 'good'
      if (value >= rule.mixed[0] && value <= rule.mixed[1]) return 'mixed'
      return 'poor'
    }
    return 'unknown' as const
  }

  switch (id) {
    case 'waves': {
      const tag = numeric(f.swellEnergy)
      // Calm-water lenses only: a range lens (surf) wants the big day.
      if (rule.kind === 'ceiling' && f.nwsSurfMaxFt !== null && f.nwsSurfMaxFt >= NWS_EXTREME_SURF_FT) return 'poor'
      return tag
    }
    case 'wind': {
      if (rule.kind !== 'wind') return numeric(f.windMph)
      if (f.windMph === null) return 'unknown'
      // Unknown direction: judge on the strictest class rather than guess.
      const limits = f.windClass
        ? windLimitsFor(rule, f.windClass)
        : (['offshore', 'cross', 'onshore'] as const)
            .map((c) => windLimitsFor(rule, c))
            .sort((a, b) => a.sustained.good - b.sustained.good)[0]
      let fit = ceiling(f.windMph, limits.sustained)
      if (f.gustMph !== null) fit = worse(fit, ceiling(f.gustMph, limits.gust))
      return fit
    }
    case 'tide': {
      if (rule.kind !== 'tideBand') return numeric(f.tideFt)
      if (f.tideVsBand === null) return f.tideFt === null ? 'unknown' : 'off'
      return f.tideVsBand === 'in' ? 'good' : rule.outside
    }
    case 'chop':
      return numeric(f.chopFt)
    case 'clarity':
      return numeric(f.clarity?.ft ?? null)
    case 'uv':
      return numeric(f.uv)
    case 'rain':
      return numeric(f.rainPct)
    case 'waterTemp':
      return numeric(f.seaF)
    case 'storms':
      if (rule.kind !== 'flag') return 'off'
      if (f.sky === null) return 'unknown'
      return f.sky === 'storms' ? rule.whenPresent : 'good'
    case 'waterQuality':
      if (rule.kind !== 'flag') return 'off'
      if (f.waterQuality.status === 'unknown') return 'unknown'
      return f.waterQuality.status === 'advisory' ? rule.whenPresent : 'good'
    case 'jellyfish':
      if (rule.kind !== 'flag') return 'off'
      return f.jelly.expected ? rule.whenPresent : 'good'
    case 'advisories': {
      if (!f.nwsHazardsKnown) return 'unknown'
      if (f.nwsHazards.length === 0) return 'good'
      if (rule.kind === 'flag') return rule.whenPresent
      if (rule.kind !== 'hazard') return 'off'
      return f.nwsHazards.some((h) => h.level === 'warning') ? rule.warning : rule.advisory
    }
  }
}

/** Factors without which no lens should call an hour. */
const CRITICAL: readonly FactorId[] = ['waves', 'wind', 'advisories', 'waterQuality']

export type HourFit = {
  timestamp: string
  hour: number
  /** `unknown` when a critical factor or the engine's data check says so. */
  fit: Fit | 'unknown'
  tags: Record<FactorId, FactorTag>
}

export function evaluateHour(lens: Lens, f: HourFacts): HourFit {
  const tags = Object.fromEntries(FACTOR_IDS.map((id) => [id, tagFactor(id, lens.factors[id], f)])) as Record<
    FactorId,
    FactorTag
  >
  let fit: Fit = 'good'
  for (const id of FACTOR_IDS) {
    // Tagged for display, but not trusted to decide anything yet.
    if (!affectsFit(lens.factors[id])) continue
    const tag = tags[id]
    if (tag === 'good' || tag === 'mixed' || tag === 'poor') fit = worse(fit, tag)
  }
  // A known poor stands even with gaps elsewhere; anything better needs the
  // critical inputs and trustworthy data.
  const missingCritical = CRITICAL.some((id) => affectsFit(lens.factors[id]) && tags[id] === 'unknown')
  const unknown = fit !== 'poor' && (f.dataIssue !== null || missingCritical)
  return { timestamp: f.timestamp, hour: f.hour, fit: unknown ? 'unknown' : fit, tags }
}

export type DayFit = {
  date: string
  fit: Fit | 'unknown'
  hours: HourFit[]
  /** Best stretch of good hours, inclusive local hours; null when none. */
  bestHours: { start: number; end: number } | null
  /** Hour whose factors explain the day: the best stretch's first hour, or the least-bad hour. */
  keyHour: HourFacts | undefined
  keyHourFit: HourFit | undefined
  headline: string
  reason: string
}

const daylight = (hours: readonly HourFacts[]) => hours.filter((h) => h.hour >= DAY_HOURS.first && h.hour <= DAY_HOURS.last)

/** Longest run of `good` hours ≥ min length, earliest on ties. */
export function bestRun(fits: readonly HourFit[], min: number): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null
  let runStart: number | null = null
  let prev: number | null = null
  const close = (end: number) => {
    if (runStart === null) return
    const len = end - runStart + 1
    if (len >= min && (!best || len > best.end - best.start + 1)) best = { start: runStart, end }
  }
  for (const h of fits) {
    const contiguous = prev !== null && h.hour === prev + 1
    if (h.fit === 'good') {
      if (runStart === null || !contiguous) {
        if (runStart !== null && prev !== null) close(prev)
        runStart = h.hour
      }
    } else if (runStart !== null && prev !== null) {
      close(prev)
      runStart = null
    }
    prev = h.hour
  }
  if (runStart !== null && prev !== null) close(prev)
  return best
}

const FIT_RANK: Record<Fit | 'unknown', number> = { good: 0, mixed: 1, unknown: 2, poor: 3 }

export function evaluateDay(lens: Lens, day: DayFacts, options: { fromHour?: number } = {}): DayFit {
  const usable = daylight(day.hours).filter((h) => h.hour >= (options.fromHour ?? 0))
  const fits = usable.map((h) => evaluateHour(lens, h))
  const bestHours = bestRun(fits, lens.minGoodHours)

  let fit: Fit | 'unknown'
  if (bestHours) fit = 'good'
  else if (fits.some((h) => h.fit === 'good' || h.fit === 'mixed')) fit = 'mixed'
  else if (fits.length > 0 && fits.every((h) => h.fit === 'unknown')) fit = 'unknown'
  else fit = fits.length > 0 ? 'poor' : 'unknown'

  const keyIndex = bestHours
    ? fits.findIndex((h) => h.hour === bestHours.start)
    : fits.reduce((best, h, i) => (best < 0 || FIT_RANK[h.fit] < FIT_RANK[fits[best].fit] ? i : best), -1)
  const keyHour = keyIndex >= 0 ? usable[keyIndex] : undefined
  const keyHourFit = keyIndex >= 0 ? fits[keyIndex] : undefined

  return {
    date: day.date,
    fit,
    hours: fits,
    bestHours,
    keyHour,
    keyHourFit,
    headline: lensHeadline(lens, fit),
    reason: keyHour && keyHourFit ? lensReason(lens, keyHour, keyHourFit, fit) : 'Not enough forecast data for this day.',
  }
}

export function lensHeadline(lens: Lens, fit: Fit | 'unknown'): string {
  switch (fit) {
    case 'good':
      return `Good for ${lens.activity}`
    case 'mixed':
      return `Mixed for ${lens.activity}`
    case 'poor':
      return `Rough for ${lens.activity}`
    default:
      return `Can't call ${lens.activity}`
  }
}

// ---------------------------------------------------------------------------
// The one-sentence reason
// ---------------------------------------------------------------------------

const num = (v: number) => String(Number(v.toFixed(1)))

/** Why one factor is not good, as a clause. */
function problemClause(id: FactorId, f: HourFacts, lens: Lens): string | null {
  const rule = lens.factors[id]
  switch (id) {
    case 'waves': {
      if (f.swellFt === null) return null
      if (rule.kind === 'ceiling' && f.nwsSurfMaxFt !== null && f.nwsSurfMaxFt >= NWS_EXTREME_SURF_FT)
        return `the Weather Service has surf up to ${f.nwsSurfMaxFt} ft on this shore`
      const dir = formatCompassWord(f.swellFromDeg)
      const period = f.swellPeriodSec !== null ? ` at ${Math.round(f.swellPeriodSec)} s` : ''
      if (rule.kind === 'range' && f.swellEnergy !== null && f.swellEnergy < rule.good[0])
        return `only ${num(f.swellFt)} ft${period} of swell is reaching the break`
      if (rule.kind === 'range') return `a ${num(f.swellFt)} ft${dir ? ` ${dir}` : ''} swell${period} is bigger than your range`
      return `a ${num(f.swellFt)} ft${dir ? ` ${dir}` : ''} swell${period} is pushing surge over the reef`
    }
    case 'chop': {
      return f.chopFt !== null ? `${num(f.chopFt)} ft of wind chop is reaching the cove` : null
    }
    case 'wind': {
      if (f.windMph === null) return null
      const side = f.windClass ? WIND_CLASS_WORDS[f.windClass] : ''
      const gust = f.gustMph !== null && f.gustMph - f.windMph >= 5 ? `, gusting ${Math.round(f.gustMph)}` : ''
      if (f.windClass === 'offshore') return `${Math.round(f.windMph)} mph offshore wind${gust} is pushing out to sea`
      return `${Math.round(f.windMph)} mph ${side ? `${side} ` : ''}wind${gust} is chopping the surface`
    }
    case 'tide':
      return f.tideVsBand === 'low' ? 'the tide is low over the reef' : f.tideVsBand === 'high' ? 'the tide is high for the entry' : null
    case 'clarity':
      return f.clarity ? `visibility is estimated around ${f.clarity.ft} ft` : null
    case 'uv':
      return f.uv !== null ? `UV reaches ${Math.round(f.uv)}` : null
    case 'rain':
      return f.rainPct !== null ? `there's a ${Math.round(f.rainPct)}% chance of rain` : null
    case 'storms':
      return 'thunderstorms are possible'
    case 'waterTemp':
      return f.seaF !== null ? `the water is ${Math.round(f.seaF)}°F` : null
    case 'waterQuality':
      return f.waterQuality.status === 'advisory'
        ? `the Health Dept. has a ${f.waterQuality.advisories[0].type.toLowerCase()} nearby`
        : null
    case 'jellyfish':
      return 'box jellyfish are expected (8–10 days after the full moon)'
    case 'advisories':
      return f.nwsHazards[0] ? `a ${f.nwsHazards[0].event} is in effect` : null
  }
}

/** What is going well, as a short list. */
function goodClause(lens: Lens, f: HourFacts, tags: Record<FactorId, FactorTag>): string {
  const parts: string[] = []
  if (tags.waves === 'good' && f.swellFt !== null) parts.push(`${num(f.swellFt)} ft swell`)
  if (tags.wind === 'good' && f.windMph !== null) parts.push(`${Math.round(f.windMph)} mph wind`)
  if (tags.clarity === 'good' && f.clarity && affectsFit(lens.factors.clarity)) parts.push(`an estimated ${f.clarity.ft} ft of visibility`)
  if (tags.tide === 'good') parts.push('a good tide')
  if (parts.length === 0) return 'Conditions line up with your settings.'
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `${list.charAt(0).toUpperCase()}${list.slice(1)}.`
}

/** Most severe problems first, waves and wind before the rest. */
const PROBLEM_ORDER: readonly FactorId[] = [
  'advisories',
  'waterQuality',
  'storms',
  'waves',
  'chop',
  'wind',
  'clarity',
  'tide',
  'jellyfish',
  'rain',
  'uv',
  'waterTemp',
]

export function lensReason(lens: Lens, f: HourFacts, hourFit: HourFit, dayFit: Fit | 'unknown'): string {
  if (hourFit.fit === 'unknown' || dayFit === 'unknown') {
    return f.dataIssue === 'stale'
      ? 'The forecast data is older than CoveCheck will rely on.'
      : "Some conditions couldn't be retrieved, so CoveCheck won't call it."
  }
  if (dayFit === 'good') return goodClause(lens, f, hourFit.tags)
  // A mixed day whose best hour is good: good hours exist, just never long enough in a row.
  if (dayFit === 'mixed' && hourFit.fit === 'good') {
    return `Some hours fit, but none for ${lens.minGoodHours} hours in a row.`
  }
  const severity = dayFit === 'poor' ? ['poor'] : ['poor', 'mixed']
  const clauses = PROBLEM_ORDER.filter((id) => affectsFit(lens.factors[id]) && severity.includes(hourFit.tags[id]))
    .map((id) => problemClause(id, f, lens))
    .filter((clause): clause is string => clause !== null)
    .slice(0, 2)
  if (clauses.length === 0) return 'Close to your settings, but not all the way there.'
  const text = clauses.join(', and ')
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}

// ---------------------------------------------------------------------------
// "Judged against your settings: …"
// ---------------------------------------------------------------------------

export function settingsSummary(lens: Lens): string {
  const parts: string[] = []
  const w = lens.factors.waves
  // Energy reads badly as a bare number, so name it by its 10 s height equivalent.
  const at10 = (energy: number) => num(Math.sqrt(energy / 10))
  if (w.kind === 'ceiling') parts.push(`swell energy under ${w.good} (≈ ${at10(w.good)} ft at 10 s)`)
  if (w.kind === 'range') parts.push(`swell energy ${formatRange(w.good)} (≈ ${at10(w.good[0])}–${at10(w.good[1])} ft at 10 s)`)
  const wind = lens.factors.wind
  if (wind.kind === 'wind') {
    const off = windLimitsFor(wind, 'offshore').sustained.good
    const cross = wind.cross.good
    const on = wind.onshore.good
    parts.push(
      off === cross && cross === on
        ? `wind under ${on} mph`
        : off === cross
          ? `wind under ${on} mph onshore, ${cross} otherwise`
          : `wind under ${on} mph onshore, ${cross} cross-shore, ${off} offshore`,
    )
  }
  const c = lens.factors.clarity
  if (c.kind === 'floor' && affectsFit(c)) parts.push(`clarity over ${c.good} ft`)
  const uv = lens.factors.uv
  if (uv.kind === 'ceiling') parts.push(`UV under ${uv.good}`)
  const rain = lens.factors.rain
  if (rain.kind === 'ceiling') parts.push(`rain chance under ${rain.good}%`)
  return parts.join(', ')
}
