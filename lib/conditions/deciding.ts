import type { DayFacts, HourFacts } from '../facts'
import { formatHour } from '../format'
import { tideSwellLimits, windLimitsFor } from '../lenses/evaluate'
import type { Lens } from '../lenses/schema'
import type { BuoyComparison } from './buoy'
import { WIND_CLASS_WORDS } from './wind'

/**
 * Gauges and notes for the Waves and Wind cards. The zones come straight from
 * the active lens's own rule at this hour — the wave limits move with the tide,
 * the wind limits with the wind's direction class — so a gauge can never
 * disagree with the fit it sits beside.
 */

export type Gauge = {
  /** Zones as fractions of the gauge width. */
  goodTo: number
  mixedTo: number
  /** Where the reading sits, 0-1. */
  at: number
  caption: string
  /** Range rules (surf) are good in the middle, not at the low end. */
  goodFrom?: number
  mixedFrom?: number
}

const clamp = (v: number) => Math.min(1, Math.max(0, v))

export function waveGauge(lens: Lens, h: HourFacts): Gauge | null {
  const rule = lens.factors.waves
  if (h.swellEnergy === null) return null
  const e = Math.round(h.swellEnergy)
  if (rule.kind === 'tideSwell' || rule.kind === 'ceiling') {
    const limits = rule.kind === 'tideSwell' ? tideSwellLimits(rule, h.tideFt) : rule
    const mixed = limits.mixed ?? limits.good * 1.8
    const max = Math.max(mixed * 1.4, e * 1.05)
    return { goodTo: limits.good / max, mixedTo: mixed / max, at: clamp(e / max), caption: `Energy ${e} of ${limits.good} limit${rule.kind === 'tideSwell' ? ' at this tide' : ''}` }
  }
  if (rule.kind === 'range') {
    const max = Math.max(rule.mixed[1] * 1.1, e * 1.05)
    return {
      mixedFrom: rule.mixed[0] / max,
      goodFrom: rule.good[0] / max,
      goodTo: rule.good[1] / max,
      mixedTo: rule.mixed[1] / max,
      at: clamp(e / max),
      caption: `Energy ${e}; good ${rule.good[0]}–${rule.good[1]}`,
    }
  }
  return null
}

export function windGauge(lens: Lens, h: HourFacts): Gauge | null {
  const rule = lens.factors.wind
  if (rule.kind !== 'wind' || h.windMph === null) return null
  const { sustained } = windLimitsFor(rule, h.windClass ?? 'onshore')
  const mixed = sustained.mixed ?? sustained.good * 1.6
  const max = Math.max(mixed * 1.4, h.windMph * 1.05)
  return { goodTo: sustained.good / max, mixedTo: mixed / max, at: clamp(h.windMph / max), caption: `Good up to ${sustained.good} mph${h.windClass ? ` ${WIND_CLASS_WORDS[h.windClass]}` : ''}` }
}

/** "Buoy 2.3 ft · model 3.6 ft · trusting the buoy", or the NWS figure, or the direction. */
export function wavesNote(h: HourFacts, buoy: BuoyComparison | null, shore: string): string {
  if (h.buoyCorrection !== null && buoy?.buoySwellFt != null && buoy.forecastSwellFt != null) {
    return `Buoy ${buoy.buoySwellFt.toFixed(1)} ft · model ${buoy.forecastSwellFt.toFixed(1)} ft · trusting the buoy`
  }
  if (h.nwsSurfMaxFt !== null) return `NWS up to ${h.nwsSurfMaxFt} ft on ${shore} shores`
  return 'Model forecast, no buoy check this hour'
}

/** "Builds to 15 after 3 PM", "Eases to 6 after 2 PM", or "Steady through the day". */
export function windNote(day: DayFacts, h: HourFacts): string {
  if (h.windMph === null) return 'Wind unavailable'
  const later = day.hours.filter((x) => x.hour > h.hour && x.hour <= 18 && x.windMph !== null)
  const up = later.find((x) => x.windMph! >= h.windMph! + 5)
  if (up) {
    const peak = Math.max(...later.filter((x) => x.hour >= up.hour).map((x) => x.windMph!))
    return `Builds to ${Math.round(peak)} after ${formatHour(up.hour)}`
  }
  const down = later.find((x) => x.windMph! <= h.windMph! - 5)
  if (down) return `Eases to ${Math.round(down.windMph!)} after ${formatHour(down.hour)}`
  return 'Steady through the day'
}
