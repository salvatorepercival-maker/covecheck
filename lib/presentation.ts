import {
  DEFAULT_USABLE_HOURS,
  type CandidateWindow,
  type Confidence,
  type DaySummary,
  type ForecastEvaluation,
  type HourAssessment,
  type ReasonCode,
  type Verdict,
} from './engine'
import { formatClockTime, formatCompass, formatDayShort, formatHour, formatWindowRange } from './format'
import { windExposureFor } from './geo'
import type { TideExtreme } from './providers/tides'
import { sunTimesFor, formatSunTime } from './sun'
import { honoluluDateOf, honoluluHourOf, honoluluLocalToUtc, toHonoluluLocal, utcToHonoluluLocal } from './time'
import type { BeachProfile, HourlyBeachConditions } from './types'

/**
 * Screen-level view models for the beach page.
 *
 * Everything here is a pure reading of the engine's output — it never re-judges
 * conditions. Chips and tones come from the engine's reason codes, not from a
 * second copy of the thresholds, so the page cannot disagree with the verdict.
 * The thresholds are read only to place a bar's limit marker.
 */

export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

/** Verdict → the three-word vocabulary the page speaks in. */
export const VERDICT_TONE: Record<Verdict, 'go' | 'close' | 'skip' | 'unknown'> = {
  great: 'go',
  caution: 'close',
  not_recommended: 'skip',
  insufficient_data: 'unknown',
}

export const HERO_TITLE: Record<Verdict, string> = {
  great: 'Good to go',
  caution: 'Use caution',
  not_recommended: 'Skip it',
  insufficient_data: "Can't call it",
}

const WEEK_TITLE: Record<Verdict, string> = {
  great: 'Good',
  caution: 'Close',
  not_recommended: 'Skip',
  insufficient_data: 'Too early to call',
}

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
}

export const confidenceLabel = (confidence: Confidence) => CONFIDENCE_LABEL[confidence]

const codesOf = (hour: HourAssessment) => new Set<ReasonCode>(hour.reasons.map((entry) => entry.code))

/** "3.5 ft", "1 ft" — one decimal, trailing ".0" dropped. */
export function feet(value: number): string {
  return `${Number(value.toFixed(1))} ft`
}

const isUsable = (hour: HourAssessment) => {
  const local = honoluluHourOf(hour.timestamp)
  return local >= DEFAULT_USABLE_HOURS.earliest && local <= DEFAULT_USABLE_HOURS.latest
}

const VERDICT_RANK: Record<Verdict, number> = { great: 3, caution: 2, insufficient_data: 1, not_recommended: 0 }

/** The hour that best represents a day: its window's first hour, else its best usable hour. */
export function representativeHour(day: DaySummary, window: CandidateWindow | null): HourAssessment | undefined {
  if (window) return window.hours[0]
  const usable = day.hours.filter(isUsable)
  const pool = usable.length > 0 ? usable : day.hours
  return [...pool].sort((a, b) => VERDICT_RANK[b.verdict] - VERDICT_RANK[a.verdict] || a.timestamp.localeCompare(b.timestamp))[0]
}

// ---------------------------------------------------------------------------
// "What's deciding it"
// ---------------------------------------------------------------------------

export type FactorRow = {
  key: 'waves' | 'wind' | 'tide' | 'water' | 'advisories'
  label: string
  detail: string
  chip: string
  tone: Tone
  /** Value and limit marker as fractions of the bar's full width. */
  bar?: { fraction: number; marker: number }
  note?: string
  /** Shown in the caution colour — a caveat the engine requires to stay visible. */
  caveat?: string
}

function wavesRow(hour: HourAssessment, conditions: HourlyBeachConditions | undefined, profile: BeachProfile): FactorRow {
  const codes = codesOf(hour)
  const height = hour.metrics.exposedSwellHeightFt
  const direction = conditions?.exposedPartitions[0]?.directionDeg ?? null
  const limits = profile.thresholds.exposedSwellFt

  let chip = 'No data'
  let tone: Tone = 'neutral'
  if (codes.has('EXCESSIVE_SWELL') || codes.has('SRF_EXCEEDS_THRESHOLD')) [chip, tone] = ['Too big', 'bad']
  else if (codes.has('MARGINAL_SWELL')) [chip, tone] = ['Borderline', 'warn']
  else if (codes.has('LOW_WAVE_ENERGY')) [chip, tone] = [height !== null && height <= 2 ? 'Small' : 'OK', 'good']

  const srf = hour.metrics.srfSouthFacingMaxFt
  const showSrf = srf !== null && (tone !== 'good' || codes.has('SRF_DISAGREES_WITH_MODEL'))
  const scale = limits.caution * 1.5

  return {
    key: 'waves',
    label: 'Waves',
    detail:
      height === null
        ? 'Not available'
        : direction !== null
          ? `${feet(height)} from the ${formatCompass(direction)}`
          : feet(height),
    chip,
    tone,
    bar: height === null ? undefined : { fraction: Math.min(1, height / scale), marker: limits.great / scale },
    note: showSrf
      ? `Marker is the family limit. Weather Service: up to ${srf} ft on ${profile.shoreAspect} shores`
      : undefined,
  }
}

function windRow(
  hour: HourAssessment,
  conditions: HourlyBeachConditions | undefined,
  profile: BeachProfile,
  laterHours: readonly HourAssessment[],
): FactorRow {
  const codes = codesOf(hour)
  const { windSpeedMph: speed, windGustMph: gust } = hour.metrics
  const direction = conditions?.windDirectionDeg ?? null
  const exposure = direction === null ? null : windExposureFor(direction, profile.shoreAspect)
  // Cross-shore uses the onshore limits, exactly as the engine does.
  const limits = exposure === 'offshore' ? profile.thresholds.windSpeedMph.offshore : profile.thresholds.windSpeedMph.onshore

  let chip = 'No data'
  let tone: Tone = 'neutral'
  if (speed !== null) {
    if (codes.has('WIND_NOT_CALIBRATED')) [chip, tone] = ['Not calibrated', 'warn']
    else if (codes.has('STRONG_GUSTS')) [chip, tone] = ['Too strong', 'bad']
    else if (codes.has('ONSHORE_WIND')) [chip, tone] = ['Onshore', 'warn']
    else if (codes.has('MARGINAL_WIND')) [chip, tone] = ['Breezy', 'warn']
    else if (codes.has('CALM_WIND')) [chip, tone] = ['Light', 'good']
    else [chip, tone] = [exposure === 'offshore' ? 'Offshore' : 'OK', 'good']
  }

  // "Picks up after 1 PM": the first later hour at least 5 mph windier than this one.
  const pickup =
    speed === null
      ? undefined
      : laterHours.find((later) => later.metrics.windSpeedMph !== null && later.metrics.windSpeedMph >= speed + 5)

  const parts: string[] = []
  if (speed !== null) {
    parts.push(
      `${Math.round(speed)} mph${gust !== null && gust - speed >= 5 ? `, gusts ${Math.round(gust)}` : ''}`,
    )
    if (pickup) parts.push(`picks up after ${formatHour(honoluluHourOf(pickup.timestamp))}`)
    else if (direction !== null) parts.push(`from the ${formatCompass(direction)}`)
  }

  const scale = limits.caution * 1.5
  return {
    key: 'wind',
    label: 'Wind',
    detail: parts.length > 0 ? parts.join(' · ') : 'Not available',
    chip,
    tone,
    bar: speed === null ? undefined : { fraction: Math.min(1, speed / scale), marker: limits.great / scale },
  }
}

/** Contiguous span of usable hours with the tide inside the band, as "9 AM – 5 PM". */
function inRangeSpan(dayHours: readonly HourAssessment[]): string | null {
  const good = dayHours.filter((hour) => isUsable(hour) && (hour.metrics.tideFavorability ?? 0) >= 1)
  if (good.length === 0) return null
  let end = good[0]
  for (const hour of good.slice(1)) {
    if (honoluluHourOf(hour.timestamp) !== honoluluHourOf(end.timestamp) + 1) break
    end = hour
  }
  return formatWindowRange(good[0].timestamp, end.timestamp)
}

function tideRow(
  hour: HourAssessment,
  dayHours: readonly HourAssessment[],
  dayExtremes: readonly TideExtreme[],
  tideBandProvisional: boolean,
): FactorRow {
  const codes = codesOf(hour)
  const height = hour.metrics.tideHeightFt

  let chip = 'No data'
  let tone: Tone = 'neutral'
  if (height !== null) {
    if (codes.has('TIDE_NOT_CALIBRATED')) [chip, tone] = ['Not set', 'neutral']
    else if (codes.has('LOW_TIDE_OVER_REEF')) [chip, tone] = ['Too low', 'warn']
    else if (codes.has('HIGH_TIDE_LESS_SHALLOW')) [chip, tone] = ['Too high', 'warn']
    else if (codes.has('FAVORABLE_TIDE')) [chip, tone] = ['Good', 'good']
  }

  const daylightLow = dayExtremes.find((extreme) => {
    const local = honoluluHourOf(extreme.timestamp)
    return extreme.kind === 'low' && extreme.heightFt !== null && local >= DEFAULT_USABLE_HOURS.earliest && local <= DEFAULT_USABLE_HOURS.latest
  })
  const span = inRangeSpan(dayHours)

  return {
    key: 'tide',
    label: 'Tide',
    detail: daylightLow
      ? `Low at ${formatClockTime(daylightLow.timestamp)} · ${daylightLow.heightFt!.toFixed(1)} ft`
      : span
        ? `In range ${span}`
        : height !== null
          ? `${height.toFixed(1)} ft`
          : 'Not available',
    chip,
    tone,
    caveat: tideBandProvisional ? 'Good range is provisional — set from a single session' : undefined,
  }
}

/** What to wear, from sea temperature. At these temperatures a rashguard is sun and reef cover, not warmth. */
export function waterCue(seaTempF: number | null): { chip: string; tone: Tone; wear: string } | null {
  if (seaTempF === null) return null
  if (seaTempF >= 78) return { chip: 'Warm', tone: 'good', wear: 'rashguard, no wetsuit' }
  if (seaTempF >= 74) return { chip: 'Mild', tone: 'good', wear: 'rashguard' }
  if (seaTempF >= 70) return { chip: 'Cool', tone: 'neutral', wear: 'rashguard or a light wetsuit top' }
  return { chip: 'Cold', tone: 'neutral', wear: 'wetsuit recommended' }
}

function waterRow(conditions: HourlyBeachConditions | undefined): FactorRow {
  const temp = conditions?.seaSurfaceTempF ?? null
  const cue = waterCue(temp)
  return {
    key: 'water',
    label: 'Water',
    detail: cue && temp !== null ? `${Math.round(temp)}°F · ${cue.wear}` : 'Not available',
    chip: cue?.chip ?? 'No data',
    tone: cue?.tone ?? 'neutral',
  }
}

function advisoriesRow(conditions: HourlyBeachConditions | undefined): FactorRow {
  const known = conditions?.sourceFreshness.alerts?.status === 'ok'
  const hazards = conditions?.activeHazards ?? []
  if (!known) return { key: 'advisories', label: 'Advisories', detail: "Couldn't check — treat as unconfirmed", chip: 'Unknown', tone: 'warn' }
  if (hazards.length === 0) return { key: 'advisories', label: 'Advisories', detail: 'None in effect', chip: 'Clear', tone: 'good' }
  return {
    key: 'advisories',
    label: 'Advisories',
    detail: hazards.map((hazard) => hazard.event).join(', '),
    chip: 'In effect',
    tone: hazards.some((hazard) => hazard.isBlocking) ? 'bad' : 'warn',
  }
}

export function factorRows(options: {
  hour: HourAssessment
  conditionsByTimestamp: Record<string, HourlyBeachConditions>
  profile: BeachProfile
  dayHours: readonly HourAssessment[]
  dayExtremes: readonly TideExtreme[]
}): FactorRow[] {
  const { hour, conditionsByTimestamp, profile, dayHours, dayExtremes } = options
  const conditions = conditionsByTimestamp[hour.timestamp]
  const later = dayHours.filter((entry) => entry.timestamp > hour.timestamp && isUsable(entry))
  const tideBandProvisional = profile.calibration.some(
    (gap) => gap.status === 'provisional' && gap.affectedThresholds.some((t) => t.toLowerCase().includes('tide')),
  )
  return [
    wavesRow(hour, conditions, profile),
    windRow(hour, conditions, profile, later),
    tideRow(hour, dayHours, dayExtremes, tideBandProvisional),
    waterRow(conditions),
    advisoriesRow(conditions),
  ]
}

// ---------------------------------------------------------------------------
// Hero sentence
// ---------------------------------------------------------------------------

const GOOD_PHRASE: Partial<Record<FactorRow['key'], string>> = {
  waves: 'small waves',
  wind: 'light wind',
  tide: 'a good tide',
}

const BAD_PHRASE: Partial<Record<FactorRow['key'], string>> = {
  waves: 'the waves are too big',
  wind: 'the wind is too strong',
  tide: 'the tide is out of range',
  advisories: 'an advisory is in effect',
}

const WARN_PHRASE: Partial<Record<FactorRow['key'], string>> = {
  waves: 'the waves are borderline',
  wind: 'the wind is a bit much',
  tide: 'the tide is out of range',
  advisories: "advisories couldn't be checked",
}

function joinList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export function heroSentence(verdict: Verdict, rows: readonly FactorRow[], allDay: boolean): string {
  const pick = (table: Partial<Record<FactorRow['key'], string>>, tones: Tone[]) =>
    rows.filter((row) => tones.includes(row.tone) && table[row.key]).map((row) => table[row.key]!)

  if (verdict === 'great') {
    const good = pick(GOOD_PHRASE, ['good'])
    return good.length > 0
      ? `${capitalise(joinList(good))} — a favourable forecast for calm water.`
      : 'A favourable forecast for calm water.'
  }
  if (verdict === 'not_recommended') {
    const bad = pick(BAD_PHRASE, ['bad'])
    const lead = bad.length > 0 ? capitalise(joinList(bad)) : 'Conditions are rough'
    return `${lead} for little snorkelers${allDay ? ' all day' : ''}.`
  }
  if (verdict === 'caution') {
    const warn = pick({ ...WARN_PHRASE, ...BAD_PHRASE }, ['warn', 'bad'])
    return warn.length > 0
      ? `Close, but ${joinList(warn)}. Watch the water closely before anyone goes in.`
      : 'Close to a good window. Watch the water closely before anyone goes in.'
  }
  return "CoveCheck can't get a clear enough read on conditions to call it."
}

// ---------------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------------

/**
 * 0-1: how close a day's best hour gets to a good family window.
 *
 * Verdict sets the band; within a band, the bar moves with how far the worst of
 * swell and wind sits over its limit. Bar length is never the only signal — every
 * row also says its verdict in words.
 */
export function closeness(hour: HourAssessment | undefined, profile: BeachProfile, conditions?: HourlyBeachConditions): number {
  if (!hour) return 0
  if (hour.verdict === 'great') return 0.9
  if (hour.verdict === 'insufficient_data') return 0
  const ratios: number[] = []
  const swell = hour.metrics.exposedSwellHeightFt
  if (swell !== null && swell > 0) ratios.push(profile.thresholds.exposedSwellFt.great / swell)
  const speed = hour.metrics.windSpeedMph
  const direction = conditions?.windDirectionDeg ?? null
  const exposure = direction === null ? null : windExposureFor(direction, profile.shoreAspect)
  const windLimit = (exposure === 'offshore' ? profile.thresholds.windSpeedMph.offshore : profile.thresholds.windSpeedMph.onshore).great
  if (speed !== null && speed > 0) ratios.push(windLimit / speed)
  const ratio = Math.max(0, Math.min(1, ratios.length > 0 ? Math.min(...ratios) : 0.5))
  return hour.verdict === 'caution' ? 0.45 + 0.3 * ratio : 0.08 + 0.27 * ratio
}

/** The one thing holding a day back, in a few words: "Waves 3.2 ft", "Wind 14 mph". */
export function limitingFactor(hour: HourAssessment | undefined): string {
  if (!hour) return 'No forecast'
  const codes = codesOf(hour)
  const swell = hour.metrics.exposedSwellHeightFt
  const speed = hour.metrics.windSpeedMph
  const parts: string[] = []
  if (codes.has('ACTIVE_BEACH_HAZARD')) return 'Advisory in effect'
  if (codes.has('SRF_EXCEEDS_THRESHOLD') && hour.metrics.srfSouthFacingMaxFt !== null)
    parts.push(`Surf up to ${hour.metrics.srfSouthFacingMaxFt} ft`)
  else if ((codes.has('EXCESSIVE_SWELL') || codes.has('MARGINAL_SWELL')) && swell !== null) parts.push(`Waves ${feet(swell)}`)
  if ((codes.has('STRONG_GUSTS') || codes.has('ONSHORE_WIND') || codes.has('MARGINAL_WIND')) && speed !== null)
    parts.push(`${parts.length > 0 ? 'wind' : 'Wind'} ${Math.round(speed)} mph`)
  if (parts.length === 0 && (codes.has('LOW_TIDE_OVER_REEF') || codes.has('HIGH_TIDE_LESS_SHALLOW'))) parts.push('Tide out of range')
  if (parts.length === 0 && codes.has('HAZARD_STATE_UNKNOWN')) parts.push("Advisories couldn't be checked")
  if (parts.length === 0 && (codes.has('MISSING_CRITICAL_DATA') || codes.has('STALE_DATA'))) parts.push('Missing forecast data')
  if (parts.length === 0 && codes.has('WIND_NOT_CALIBRATED')) parts.push('Wind not calibrated')
  if (parts.length === 0 && codes.has('INSUFFICIENT_WINDOW')) parts.push('Only a short good stretch')
  return parts.length > 0 ? parts.join(' · ') : 'Borderline conditions'
}

export type WeekRow = {
  date: string
  dayLabel: string
  verdict: Verdict
  title: string
  subtitle: string
  closeness: number
}

export function weekRows(
  evaluation: ForecastEvaluation,
  profile: BeachProfile,
  conditionsByTimestamp: Record<string, HourlyBeachConditions>,
  todayDate: string,
): WeekRow[] {
  return evaluation.days.map((day) => {
    const window = day.recommendedWindow
    const hour = representativeHour(day, window)
    const conditions = hour ? conditionsByTimestamp[hour.timestamp] : undefined
    const lowConfidence = day.verdict === 'insufficient_data' || hour?.confidence === 'low'
    const early = window !== null && honoluluHourOf(window.startTimestamp) < 10

    let title = WEEK_TITLE[day.verdict]
    let subtitle = limitingFactor(hour)
    if (lowConfidence) {
      title = WEEK_TITLE.insufficient_data
      subtitle = day.verdict === 'insufficient_data' ? 'Not enough data to say' : 'Low confidence that far out'
    } else if (day.verdict === 'great' && window) {
      title = early ? 'Good, early' : 'Good'
      subtitle = `${formatWindowRange(window.startTimestamp, window.endTimestamp)} window`
    }

    return {
      date: day.date,
      dayLabel: formatDayShort(day.date, todayDate),
      verdict: lowConfidence ? 'insufficient_data' : day.verdict,
      title,
      subtitle,
      closeness: lowConfidence ? 0 : closeness(hour, profile, conditions),
    }
  })
}

// ---------------------------------------------------------------------------
// Which day the page leads with, and the hero's window line
// ---------------------------------------------------------------------------

export type Focus = {
  day: DaySummary
  isToday: boolean
  /** Set when the evening has ended today's usable hours and the page shows tomorrow. */
  evening: { dark: boolean; firstLight: string | null } | null
}

/** Today, unless today's usable hours are over — then tomorrow, with a banner saying so. */
export function focusDay(evaluation: ForecastEvaluation, profile: BeachProfile, nowUtc: Date): Focus | null {
  const nowLocal = utcToHonoluluLocal(nowUtc)
  const today = honoluluDateOf(nowLocal)
  const todayIndex = evaluation.days.findIndex((day) => day.date === today)
  const todayDay = evaluation.days[todayIndex]
  if (!todayDay) return evaluation.days[0] ? { day: evaluation.days[0], isToday: false, evening: null } : null

  const hourNow = honoluluHourOf(nowLocal)
  const tomorrow = evaluation.days[todayIndex + 1]
  if (hourNow <= DEFAULT_USABLE_HOURS.latest || !tomorrow) return { day: todayDay, isToday: true, evening: null }

  const minutesNow = hourNow * 60 + Number(nowLocal.slice(14, 16))
  const sunToday = sunTimesFor(today, profile.latitude, profile.longitude)
  const sunTomorrow = sunTimesFor(tomorrow.date, profile.latitude, profile.longitude)
  return {
    day: tomorrow,
    isToday: false,
    evening: {
      dark: sunToday.lastLight === null || minutesNow >= sunToday.lastLight,
      firstLight: formatSunTime(sunTomorrow.firstLight)?.replace(/(am|pm)$/, (m) => ` ${m.toUpperCase()}`) ?? null,
    },
  }
}

export type HeroWindow = {
  range: string
  /** { label: 'Starts in', value: '1 hr 20 min' } or { label: 'On now', value: 'until 11 AM' }. */
  timing: { label: string; value: string } | null
}

function durationText(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}

/**
 * The window the hero should offer, and the verdict that goes with it.
 *
 * On today a window that has already ended is not offered: the hero falls back
 * to a later window that day, or to the best verdict among the hours still left.
 */
export function heroState(focus: Focus, evaluation: ForecastEvaluation, nowUtc: Date): { verdict: Verdict; window: CandidateWindow | null } {
  const { day, isToday } = focus
  if (!isToday) return { verdict: day.verdict, window: day.recommendedWindow }

  const nowMs = nowUtc.getTime()
  const endMs = (window: CandidateWindow) => honoluluLocalToUtc(window.endTimestamp).getTime() + 3_600_000
  if (day.recommendedWindow && endMs(day.recommendedWindow) > nowMs) return { verdict: day.verdict, window: day.recommendedWindow }

  const later = evaluation.windows
    .filter((window) => window.date === day.date && endMs(window) > nowMs)
    .sort((a, b) => VERDICT_RANK[b.verdict] - VERDICT_RANK[a.verdict] || a.startTimestamp.localeCompare(b.startTimestamp))[0]
  if (later) return { verdict: later.verdict, window: later }

  const remaining = day.hours.filter((hour) => isUsable(hour) && honoluluLocalToUtc(hour.timestamp).getTime() + 3_600_000 > nowMs)
  const best = [...remaining].sort((a, b) => VERDICT_RANK[b.verdict] - VERDICT_RANK[a.verdict])[0]
  // A lone good hour is not a window; never let it headline as one.
  const verdict = best ? (best.verdict === 'great' ? 'caution' : best.verdict) : day.verdict
  return { verdict, window: null }
}

export function heroWindow(window: CandidateWindow, nowUtc: Date, isToday: boolean): HeroWindow {
  const range = formatWindowRange(window.startTimestamp, window.endTimestamp)
  if (!isToday) return { range, timing: null }
  const startMs = honoluluLocalToUtc(window.startTimestamp).getTime()
  const endMs = honoluluLocalToUtc(window.endTimestamp).getTime() + 3_600_000
  const now = nowUtc.getTime()
  if (now < startMs) return { range, timing: { label: 'Starts in', value: durationText(Math.round((startMs - now) / 60_000)) } }
  if (now < endMs) return { range, timing: { label: 'On now', value: `until ${formatHour(honoluluHourOf(window.endTimestamp) + 1)}` } }
  return { range, timing: null }
}

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const weekdayLong = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return WEEKDAY_LONG[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
}

/** For a day that is not good: the next good day, or the closest one. */
export function nextGoodDay(rows: readonly WeekRow[], afterDate: string): { headline: string; detail: string | null } {
  const later = rows.filter((row) => row.date > afterDate)
  const good = later.find((row) => row.verdict === 'great')
  if (good) return { headline: `${weekdayLong(good.date)} · ${good.subtitle}`, detail: null }
  const closest = [...later].filter((row) => row.closeness > 0).sort((a, b) => b.closeness - a.closeness)[0]
  return {
    headline: `None in the next ${later.length} day${later.length === 1 ? '' : 's'}`,
    detail: closest ? `${weekdayLong(closest.date)} is closest — ${closest.subtitle.charAt(0).toLowerCase()}${closest.subtitle.slice(1)}.` : null,
  }
}

export { weekdayLong }

// ---------------------------------------------------------------------------
// Hour by hour
// ---------------------------------------------------------------------------

export type HourBlock = { hour: number; timestamp: string; verdict: Verdict }

export function hourBlocks(day: DaySummary): HourBlock[] {
  return day.hours
    .filter(isUsable)
    .map((hour) => ({ hour: honoluluHourOf(hour.timestamp), timestamp: hour.timestamp, verdict: hour.verdict }))
}

/** One plain sentence under the hourly strip. Built from reason codes, never free text. */
export function hourlyCaption(day: DaySummary, window: CandidateWindow | null): string {
  const usable = day.hours.filter(isUsable)
  if (usable.length === 0) return ''
  const parts: string[] = []
  if (window) parts.push(`Best from ${formatWindowRange(window.startTimestamp, window.endTimestamp)}.`)

  const after = window ? usable.filter((hour) => hour.timestamp > window.endTimestamp && hour.verdict !== 'great') : []
  const firstWith = (test: (codes: Set<ReasonCode>) => boolean) =>
    after.find((hour) => test(codesOf(hour)))
  const windy = firstWith((codes) => codes.has('STRONG_GUSTS') || codes.has('MARGINAL_WIND') || codes.has('ONSHORE_WIND'))
  const tide = firstWith((codes) => codes.has('HIGH_TIDE_LESS_SHALLOW') || codes.has('LOW_TIDE_OVER_REEF'))
  if (windy) parts.push(`Wind builds after ${formatHour(honoluluHourOf(windy.timestamp))}.`)
  if (tide) parts.push(`Tide leaves the good range by ${formatHour(honoluluHourOf(tide.timestamp))}.`)

  if (!window) {
    const swellAllDay = usable.every((hour) => {
      const codes = codesOf(hour)
      return codes.has('EXCESSIVE_SWELL') || codes.has('MARGINAL_SWELL') || codes.has('SRF_EXCEEDS_THRESHOLD')
    })
    const tideSpan = inRangeSpan(day.hours)
    if (swellAllDay && tideSpan) parts.push(`Tide is right from ${tideSpan}, but waves stay over the family limit all day.`)
    else if (swellAllDay) parts.push('Waves stay over the family limit all day.')
    else parts.push('No stretch long enough to recommend.')
  }
  return parts.join(' ')
}

/** Tide heights for the drawn hours, plus the day's daylight extremes. */
export function dayTide(
  day: DaySummary,
  conditionsByTimestamp: Record<string, HourlyBeachConditions>,
  extremes: readonly TideExtreme[],
): { points: { hour: number; heightFt: number }[]; extremes: { hour: number; heightFt: number; kind: 'high' | 'low'; label: string }[] } {
  const points = day.hours
    .map((hour) => ({ hour: honoluluHourOf(hour.timestamp), heightFt: conditionsByTimestamp[hour.timestamp]?.tideHeightFt ?? null }))
    .filter((point): point is { hour: number; heightFt: number } =>
      point.heightFt !== null && point.hour >= DEFAULT_USABLE_HOURS.earliest && point.hour <= DEFAULT_USABLE_HOURS.latest + 1)
  return {
    points,
    extremes: extremes
      .filter((extreme) => extreme.heightFt !== null)
      .map((extreme) => {
        const local = toHonoluluLocal(extreme.timestamp)
        const hour = honoluluHourOf(local) + Number(local.slice(14, 16)) / 60
        return {
          hour,
          heightFt: extreme.heightFt!,
          kind: extreme.kind,
          label: `${extreme.kind === 'low' ? 'Low' : 'High'} ${formatClockTime(local)} · ${extreme.heightFt!.toFixed(1)} ft`,
        }
      })
      .filter((extreme) => extreme.hour >= DEFAULT_USABLE_HOURS.earliest && extreme.hour <= DEFAULT_USABLE_HOURS.latest + 1),
  }
}
