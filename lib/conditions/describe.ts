import type { DayFacts, HourFacts } from '../facts'
import { formatClockTime, formatCompass, formatHour } from '../format'
import type { FactorId } from '../lenses/schema'
import { formatCompassWord } from '../lenses/words'
import { formatSunTime } from '../sun'
import { dominantSky, SKY_WORDS } from './sky'
import { WIND_CLASS_WORDS } from './wind'
import type { BuoyComparison } from './buoy'

/**
 * The neutral view: what the day is like, in words and tiles, with no judgement.
 * Lenses add fit tags on top; nothing in here says good or bad.
 */

const DAY_FIRST = 6
const DAY_LAST = 18
const daylight = (hours: readonly HourFacts[]) => hours.filter((h) => h.hour >= DAY_FIRST && h.hour <= DAY_LAST)
const num = (v: number) => String(Number(v.toFixed(1)))
const nonNull = <T,>(values: readonly (T | null)[]): T[] => values.filter((v): v is T => v !== null)
const max = (values: readonly number[]) => (values.length ? Math.max(...values) : null)
const mean = (values: readonly number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

/** "trades" for the NE-ESE winds that dominate Oahu; "Kona winds" from the south and west. */
function windName(fromDeg: number | null): 'trades' | 'Kona winds' | 'winds' {
  if (fromDeg === null) return 'winds'
  if (fromDeg >= 30 && fromDeg <= 130) return 'trades'
  if (fromDeg >= 160 && fromDeg <= 290) return 'Kona winds'
  return 'winds'
}

const circularMeanDeg = (degs: readonly number[]) => {
  if (!degs.length) return null
  const x = degs.reduce((s, d) => s + Math.cos((d * Math.PI) / 180), 0)
  const y = degs.reduce((s, d) => s + Math.sin((d * Math.PI) / 180), 0)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** "Big south swell, breezy trades, mostly sunny." */
export function dayHeadline(day: DayFacts): string {
  const hours = daylight(day.hours)
  const parts: string[] = []

  const peak = [...hours].filter((h) => h.swellFt !== null).sort((a, b) => b.swellFt! - a.swellFt!)[0]
  if (peak) {
    const size = peak.swellFt! < 1 ? 'Flat water' : peak.swellFt! < 2 ? 'Small' : peak.swellFt! < 3 ? 'Moderate' : 'Big'
    const dir = formatCompassWord(peak.swellFromDeg)
    parts.push(size === 'Flat water' ? 'Flat water' : `${size}${dir ? ` ${dir}` : ''} swell`)
  }

  const wind = mean(nonNull(hours.map((h) => h.windMph)))
  if (wind !== null) {
    const name = windName(circularMeanDeg(nonNull(hours.map((h) => h.windFromDeg))))
    const strength = wind < 8 ? 'light' : wind < 15 ? 'breezy' : wind < 22 ? 'windy' : 'strong'
    parts.push(strength === 'light' ? `light ${name === 'trades' ? 'trades' : 'winds'}` : `${strength} ${name}`)
  }

  const sky = dominantSky(hours.map((h) => h.sky))
  if (sky) parts.push(SKY_WORDS[sky].toLowerCase())

  if (parts.length === 0) return 'Forecast unavailable.'
  const text = parts.join(', ')
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}

export type Tile = {
  id: string
  label: string
  value: string
  detail: string
  /** A second, quieter line — e.g. the buoy reading against the forecast. */
  note?: string
  /** The lens factor this tile shows a fit tag for. */
  factor: FactorId
}

/** What to wear, from sea temperature. At these temperatures a rashguard is sun and reef cover, not warmth. */
export function wearFor(seaF: number): string {
  if (seaF >= 78) return 'Rashguard, no wetsuit'
  if (seaF >= 74) return 'Rashguard'
  if (seaF >= 70) return 'Rashguard or a light wetsuit top'
  return 'Wetsuit recommended'
}

function uvWord(uv: number): string {
  if (uv >= 11) return 'Extreme'
  if (uv >= 8) return 'Very high'
  if (uv >= 6) return 'High'
  if (uv >= 3) return 'Moderate'
  return 'Low'
}

/** Hours within 15% of the day's peak UV, as "11 AM – 2 PM". */
export function uvPeakWindow(day: DayFacts): { peak: number; range: string } | null {
  const hours = daylight(day.hours).filter((h) => h.uv !== null)
  const peak = max(hours.map((h) => h.uv!))
  if (peak === null || peak < 1) return null
  const near = hours.filter((h) => h.uv! >= peak * 0.85)
  const start = near[0].hour
  const end = near[near.length - 1].hour + 1
  return { peak: Math.round(peak), range: `${formatHour(start)} – ${formatHour(end)}` }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDate = (date: string) => {
  const [, m, d] = date.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}
const dateRange = (start: string, end: string) => {
  const [, sm, sd] = start.split('-').map(Number)
  const [, em, ed] = end.split('-').map(Number)
  return sm === em ? `${MONTHS[sm - 1]} ${sd}–${ed}` : `${shortDate(start)} – ${shortDate(end)}`
}

/** "Forecast 3.7 ft · Buoy 2.3 ft now", or why the buoy can't be compared. */
export function buoyNote(b: BuoyComparison): string {
  const ago = b.ageMinutes < 90 ? 'now' : `${Math.round(b.ageMinutes / 60)} h ago`
  if (b.stale) return `Buoy hasn't reported for ${Math.round(b.ageMinutes / 60)} h`
  if (b.buoySwellFt === null) return 'Buoy: no swell reading'
  if (!b.inWindow) return `Buoy ${num(b.buoySwellFt)} ft from ${b.buoyFromText ?? '?'} — outside the cove's window`
  return `Forecast ${b.forecastSwellFt === null ? '—' : num(b.forecastSwellFt)} ft · Buoy ${num(b.buoySwellFt)} ft${b.buoyPeriodSec ? ` at ${Math.round(b.buoyPeriodSec)} s` : ''} ${ago}`
}

export function conditionTiles(day: DayFacts, h: HourFacts, shore: string, buoy: BuoyComparison | null = null): Tile[] {
  const later = daylight(day.hours).filter((x) => x.hour > h.hour)
  const tiles: Tile[] = []

  // Waves
  const dir = formatCompassWord(h.swellFromDeg)
  tiles.push({
    id: 'waves',
    factor: 'waves',
    label: 'Waves',
    value: h.swellFt === null ? '—' : `${num(h.swellFt)} ft${h.swellPeriodSec !== null && h.swellFt > 0 ? ` at ${Math.round(h.swellPeriodSec)} s` : ''}`,
    detail: [
      dir ? `From the ${dir}` : 'Swell reaching the cove',
      h.swellEnergy !== null ? `energy ${Math.round(h.swellEnergy)}` : null,
      h.nwsSurfMaxFt !== null ? `NWS up to ${h.nwsSurfMaxFt} ft on ${shore} shores` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    note: [buoy ? buoyNote(buoy) : null, h.buoyCorrection !== null ? 'Buoy-corrected' : null].filter(Boolean).join(' · ') || undefined,
  })

  // Chop
  tiles.push({
    id: 'chop',
    factor: 'chop',
    label: 'Chop',
    value: h.chopFt === null ? '—' : `${num(h.chopFt)} ft`,
    detail: h.chopFt === null ? 'Wind waves unavailable' : h.chopFt === 0 ? 'Wind waves aren’t reaching the cove' : 'Wind waves reaching the cove',
  })

  // Wind
  const pickup = h.windMph === null ? undefined : later.find((x) => x.windMph !== null && x.windMph >= h.windMph! + 5)
  const name = windName(h.windFromDeg)
  tiles.push({
    id: 'wind',
    factor: 'wind',
    label: 'Wind',
    // "13 mph E" — the compass point sits with the number; the class leads the detail.
    value: h.windMph === null ? '—' : `${Math.round(h.windMph)} mph${h.windFromDeg !== null ? ` ${formatCompass(h.windFromDeg)}` : ''}`,
    detail: [
      h.windClass ? `${WIND_CLASS_WORDS[h.windClass].charAt(0).toUpperCase()}${WIND_CLASS_WORDS[h.windClass].slice(1)}` : null,
      name !== 'winds' ? name : null,
      pickup ? `stronger after ${pickup.hour === 12 ? 'noon' : formatHour(pickup.hour)}` : null,
      h.gustMph !== null && h.windMph !== null && h.gustMph - h.windMph >= 8 ? `gusts ${Math.round(h.gustMph)}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || '—',
  })

  // Tide
  const nextTurn = day.tideExtremes.find((e) => e.timestamp.slice(11, 13) >= String(h.hour).padStart(2, '0'))
  const stageWord =
    h.tideStage === 'near-low' ? 'low' : h.tideStage === 'near-high' ? 'high' : h.tideStage === 'unknown' ? '' : h.tideStage
  tiles.push({
    id: 'tide',
    factor: 'tide',
    label: 'Tide',
    value: h.tideFt === null ? '—' : `${num(h.tideFt)} ft${stageWord ? ` ${stageWord}` : ''}`,
    detail: nextTurn ? `${nextTurn.kind === 'low' ? 'Low' : 'High'} at ${formatClockTime(nextTurn.timestamp)}` : 'Tide times unavailable',
  })

  // Clarity (estimate)
  const cause = h.clarity?.mainCause
  tiles.push({
    id: 'clarity',
    factor: 'clarity',
    label: 'Water clarity',
    value: h.clarity ? `~${h.clarity.ft} ft` : '—',
    detail: h.clarity
      ? `Estimate · ${cause ? `stirred up by ${cause === 'rain' ? 'recent rain' : cause}` : `${h.clarity.confidence} confidence`}`
      : 'No estimate without swell data',
  })

  // Weather
  tiles.push({
    id: 'weather',
    factor: 'storms',
    label: 'Weather',
    value: h.airF === null ? '—' : `${Math.round(h.airF)}°F`,
    detail: h.sky ? SKY_WORDS[h.sky] : 'Sky unavailable',
  })

  // Rain
  const rainNote =
    h.rain48hIn === null ? null : h.rain48hIn < 0.05 ? 'none in last 48 hrs' : `${num(h.rain48hIn)} in in last 48 hrs`
  tiles.push({
    id: 'rain',
    factor: 'rain',
    label: 'Rain',
    value: h.rainPct === null ? '—' : `${Math.round(h.rainPct)}%`,
    detail:
      [h.rainPct !== null && h.rainPct >= 10 && h.rainPct < 50 ? 'Passing showers possible' : null, rainNote]
        .filter(Boolean)
        .join(' · ') || '—',
  })

  // UV
  const uvPeak = uvPeakWindow(day)
  tiles.push({
    id: 'uv',
    factor: 'uv',
    label: 'UV index',
    value: uvPeak ? String(uvPeak.peak) : '—',
    detail: uvPeak ? `${uvWord(uvPeak.peak)} · peaks ${uvPeak.range}` : 'UV unavailable',
  })

  // Water temp
  tiles.push({
    id: 'waterTemp',
    factor: 'waterTemp',
    label: 'Water temp',
    value: h.seaF === null ? '—' : `${Math.round(h.seaF)}°F`,
    detail: h.seaF === null ? '—' : wearFor(h.seaF),
  })

  // Water quality (Health Dept.)
  const wq = h.waterQuality
  tiles.push({
    id: 'waterQuality',
    factor: 'waterQuality',
    label: 'Water quality',
    value:
      wq.status === 'clear'
        ? 'No advisories'
        : wq.status === 'advisory'
          ? wq.advisories.length === 1
            ? wq.advisories[0].type.replace(/ Advisory$/i, ' advisory')
            : `${wq.advisories.length} advisories`
          : "Couldn't check",
    detail:
      wq.status === 'clear'
        ? 'Brown water, bacteria and closures'
        : wq.status === 'advisory'
          ? `${wq.advisories[0].title} · ${wq.advisories[0].distanceKm} km away`
          : 'Health Dept. source unreachable',
  })

  // Box jellyfish
  tiles.push({
    id: 'jellyfish',
    factor: 'jellyfish',
    label: 'Box jellyfish',
    value: h.jelly.expected ? 'Expected' : 'Not expected',
    detail: h.jelly.window
      ? h.jelly.expected
        ? `Through ${shortDate(h.jelly.window.end)} · 8–10 days after full moon`
        : `Next window around ${dateRange(h.jelly.window.start, h.jelly.window.end)}`
      : 'Calendar unavailable',
  })

  return tiles
}

/** Neutral week row: "Swell to 3.5 ft · wind 13 mph" / "Mostly sunny · clarity ~15 ft". */
export function weekSummary(day: DayFacts): { title: string; detail: string } {
  const hours = daylight(day.hours)
  const swell = max(nonNull(hours.map((h) => h.swellFt)))
  const wind = mean(nonNull(hours.map((h) => h.windMph)))
  const sky = dominantSky(hours.map((h) => h.sky))
  const clarity = mean(nonNull(hours.map((h) => h.clarity?.ft ?? null)))
  const rain = max(nonNull(hours.map((h) => h.rainPct)))

  const title = [swell !== null ? `Swell to ${num(swell)} ft` : null, wind !== null ? `wind ${Math.round(wind)} mph` : null]
    .filter(Boolean)
    .join(' · ')
  const detail = [
    sky ? SKY_WORDS[sky] : null,
    clarity !== null ? `clarity ~${Math.round(clarity / 5) * 5} ft` : null,
    rain !== null && rain >= 20 ? `${Math.round(rain)}% rain` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return { title: title || 'Forecast unavailable', detail }
}

export function sunLine(day: DayFacts): string {
  const fmt = (m: number | null) => formatSunTime(m)?.replace(/(am|pm)$/, (s) => ` ${s.toUpperCase()}`)
  const uv = uvPeakWindow(day)
  return [
    day.sunrise !== null ? `Sunrise ${fmt(day.sunrise)}` : null,
    day.sunset !== null ? `Sunset ${fmt(day.sunset)}` : null,
    uv ? `UV peaks ${uv.range}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
