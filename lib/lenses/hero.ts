import type { DayFacts } from '../facts'
import { formatHour } from '../format'
import { affectsFit, type Lens } from './schema'
import type { DayFit } from './evaluate'

/**
 * The hero's words for a lens and a day: a short call ("Go at low tide."), the
 * fit pill, and one sentence. All derived from the lens result — nothing here
 * re-judges conditions, and none of it speaks about safety (tested).
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
const range = (start: number, endInclusive: number) => `${formatHour(start)} – ${formatHour(endInclusive + 1)}`

/** The day's lowest daylight tide hour, or null. */
export function lowTideHour(day: DayFacts): number | null {
  const tides = day.hours.filter((h) => h.hour >= 6 && h.hour <= 18 && h.tideFt !== null)
  if (!tides.length) return null
  return tides.reduce((a, b) => (b.tideFt! < a.tideFt! ? b : a)).hour
}

export type HeroCopy = { title: string; pill: string; sentence: string }

export function heroCopy(lens: Lens, fit: DayFit, day: DayFacts, isToday: boolean): HeroCopy {
  const tideFirst = lens.factors.waves.kind === 'tideSwell'
  const low = lowTideHour(day)
  const best = fit.bestHours
  const nearLow = best !== null && low !== null && low >= best.start - 1 && low <= best.end + 1
  const when = isToday ? 'today' : weekday(day.date)

  let title: string
  if (fit.fit === 'good') {
    if (tideFirst && nearLow) title = 'Go at low tide.'
    else if (best && best.start < 11) title = 'Go early.'
    else if (best && best.start < 14) title = 'Go midday.'
    else title = 'Go this afternoon.'
  } else if (fit.fit === 'mixed') {
    title = tideFirst ? 'Maybe, at low tide.' : 'Marginal.'
  } else if (fit.fit === 'poor') {
    title = isToday ? 'Not today.' : `Not ${weekday(day.date)}.`
  } else {
    title = "Can't call it."
  }

  // "Best 9 AM – 2 PM, while the outer reef breaks the swell and the trades stay light."
  let sentence = fit.reason
  if (fit.fit === 'good' && best && fit.keyHour && fit.keyHourFit) {
    const h = fit.keyHour
    const tags = fit.keyHourFit.tags
    const why: string[] = []
    if (tideFirst && nearLow && affectsFit(lens.factors.waves)) why.push('the outer reef breaks the swell')
    else if (tags.waves === 'good') why.push('the swell stays small')
    if (tags.wind === 'good' && h.windMph !== null) {
      const trades = h.windFromDeg !== null && h.windFromDeg >= 30 && h.windFromDeg <= 130
      why.push(trades ? 'the trades stay light' : 'the wind stays light')
    }
    sentence = `Best ${range(best.start, best.end)}${why.length ? `, while ${why.join(' and ')}` : ''}.`
  } else if (fit.fit !== 'good' && fit.fit !== 'unknown' && !best) {
    sentence = `${fit.reason.replace(/\.$/, '')}. No good window ${when}.`.replace(/\.\. /, '. ')
  }

  return { title, pill: fit.headline, sentence }
}
