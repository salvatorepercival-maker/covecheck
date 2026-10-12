import type { DayFacts } from '../facts'
import { formatHour } from '../format'
import { formatCompassWord } from '../lenses/words'
import type { SwellTrain } from './swell-trains'

/**
 * The week in a few plain sentences, generated from the data.
 *
 * Factual and dry on purpose: what changes, and when. No hype ("epic", "firing"),
 * and never a claim about safety — the fit-language test guards both.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const weekday = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const nn = <T,>(xs: readonly (T | null)[]) => xs.filter((x): x is T => x !== null)

/** A calm morning: light wind and below-the-week's-median swell energy, 6-11 AM. */
function calmMornings(days: readonly DayFacts[]) {
  const energies = days.flatMap((d) => nn(d.hours.filter((h) => h.hour >= 6 && h.hour <= 11).map((h) => h.swellEnergy))).sort((a, b) => a - b)
  const median = energies.length ? energies[Math.floor(energies.length / 2)] : null
  return days
    .map((d) => {
      const morning = d.hours.filter((h) => h.hour >= 6 && h.hour <= 11)
      const wind = mean(nn(morning.map((h) => h.windMph)))
      const energy = mean(nn(morning.map((h) => h.swellEnergy)))
      const afternoon = mean(nn(d.hours.filter((h) => h.hour >= 12 && h.hour <= 17).map((h) => h.windMph)))
      return { date: d.date, wind, energy, windFills: wind !== null && afternoon !== null && afternoon - wind >= 5 }
    })
    .filter((m) => m.wind !== null && m.energy !== null && m.wind <= 12 && median !== null && m.energy <= median)
    .sort((a, b) => a.wind! + a.energy! / 10 - (b.wind! + b.energy! / 10))
}

export function weekOutlook(
  days: readonly DayFacts[],
  trains: readonly SwellTrain[],
  todayDate: string,
  lensBest: { date: string; start: number; end: number }[] | null = null,
  activity: string | null = null,
): string[] {
  const out: string[] = []
  const label = (date: string) => (date === todayDate ? 'Today' : weekday(date))

  // 1. Days to watch.
  if (lensBest && activity) {
    const picks = lensBest.slice(0, 3).map((b) => `${label(b.date)} ${formatHour(b.start).replace(' ', '')}–${formatHour(b.end + 1).replace(' ', '')}`)
    out.push(picks.length ? `Best for ${activity}: ${picks.join(', ')}.` : `No stretch fits your ${activity} settings in the next ${days.length} days.`)
  } else {
    const calm = calmMornings(days).slice(0, 2)
    if (calm.length) {
      const morning = (date: string) => (date === todayDate ? 'this morning' : `${weekday(date)} morning`)
      const text = calm.map((c) => `${morning(c.date)}${c.windFills ? ' before the wind fills in' : ''}`).join('; ')
      out.push(`Days to watch: ${text}.`)
    } else {
      out.push(`No calm mornings in the next ${days.length} days.`)
    }
  }

  // 2. Swell arriving or fading.
  const last = days[days.length - 1]?.date ?? todayDate
  // The notable arrival: long-period swell first (14 s+ carries the surge), then the most energetic.
  const arriving = trains
    .filter((t) => t.arrives.slice(0, 10) > todayDate && t.arrives.slice(0, 10) <= last && t.peakFt >= 1)
    .sort((a, b) => Number(b.peakPeriodSec >= 14) - Number(a.peakPeriodSec >= 14) || b.peakFt ** 2 * b.peakPeriodSec - a.peakFt ** 2 * a.peakPeriodSec)[0]
  if (arriving) {
    const dir = formatCompassWord(arriving.directionDeg)
    const arriveDay = label(arriving.arrives.slice(0, 10))
    const peakDay = label(arriving.peaks.slice(0, 10))
    out.push(
      `New ${dir ? `${dir} ` : ''}swell (${arriving.peakPeriodSec} s) arrives ${arriveDay}${peakDay !== arriveDay ? `, peaking ${peakDay} near ${arriving.peakFt} ft` : ` near ${arriving.peakFt} ft`}.`,
    )
  } else {
    const fading = trains.find((t) => t.peaks.slice(0, 10) <= todayDate && t.fades.slice(0, 10) > todayDate && t.fades.slice(0, 10) <= last && t.peakFt >= 1)
    if (fading) out.push(`The ${formatCompassWord(fading.directionDeg) ?? ''} swell fades by ${label(fading.fades.slice(0, 10))}.`.replace('The  ', 'The '))
  }

  // 3. The biggest day-to-day wind change.
  const winds = days.map((d) => ({ date: d.date, wind: mean(nn(d.hours.filter((h) => h.hour >= 6 && h.hour <= 18).map((h) => h.windMph))) }))
  let change: { date: string; delta: number; wind: number } | null = null
  for (let i = 1; i < winds.length; i++) {
    const a = winds[i - 1].wind
    const b = winds[i].wind
    if (a === null || b === null) continue
    if (!change || Math.abs(b - a) > Math.abs(change.delta)) change = { date: winds[i].date, delta: b - a, wind: b }
  }
  if (change && Math.abs(change.delta) >= 6) {
    out.push(change.delta > 0 ? `Wind picks up ${label(change.date)}, to around ${Math.round(change.wind)} mph.` : `Wind eases ${label(change.date)}, to around ${Math.round(change.wind)} mph.`)
  }

  // 4. Rain.
  const wet = days.find((d) => d.hours.some((h) => h.hour >= 6 && h.hour <= 18 && (h.rainPct ?? 0) >= 50))
  if (wet) out.push(`Showers likely ${label(wet.date)}.`)

  return out.slice(0, 4)
}
