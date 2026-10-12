import { isDirectionInAnyRange, type DirectionRange } from '../geo'
import type { LongRange } from '../providers/long-range'

/**
 * Days 8-16 as trends only. One row per day: the day's peak in-window swell
 * (height, period, energy) and daylight wind, with a building / easing / steady
 * word against the day before. Always shown as low confidence — at this range
 * a forecast is a direction of travel, not a reading.
 */

export type LongRangeDay = {
  date: string
  swellFt: number | null
  periodSec: number | null
  energy: number | null
  windMph: number | null
  trend: 'building' | 'easing' | 'steady' | null
}

export function longRangeDays(lr: LongRange, window: readonly DirectionRange[]): LongRangeDay[] {
  const byDate = new Map<string, { energy: number; ft: number; p: number | null }[]>()
  const windByDate = new Map<string, number[]>()
  lr.times.forEach((t, i) => {
    const hour = Number(t.slice(11, 13))
    if (hour < 6 || hour > 18) return
    const date = t.slice(0, 10)
    const parts = lr.partitions[i].filter(
      (p): p is { heightFt: number; periodSec: number; directionDeg: number } =>
        p.heightFt !== null && p.periodSec !== null && p.directionDeg !== null && isDirectionInAnyRange(p.directionDeg, window),
    )
    const energy = parts.reduce((s, p) => s + p.heightFt ** 2 * p.periodSec, 0)
    const ft = Math.sqrt(parts.reduce((s, p) => s + p.heightFt ** 2, 0))
    const strongest = [...parts].sort((a, b) => b.heightFt ** 2 * b.periodSec - a.heightFt ** 2 * a.periodSec)[0]
    ;(byDate.get(date) ?? byDate.set(date, []).get(date)!).push({ energy, ft, p: strongest?.periodSec ?? null })
    const w = lr.windMph[t]
    if (w !== undefined) (windByDate.get(date) ?? windByDate.set(date, []).get(date)!).push(w)
  })

  const days: LongRangeDay[] = [...byDate.entries()].map(([date, hours]) => {
    const peak = hours.reduce((a, b) => (b.energy > a.energy ? b : a))
    const winds = windByDate.get(date) ?? []
    return {
      date,
      swellFt: Math.round(peak.ft * 10) / 10,
      periodSec: peak.p === null ? null : Math.round(peak.p),
      energy: Math.round(peak.energy),
      windMph: winds.length ? Math.round(winds.reduce((a, b) => a + b, 0) / winds.length) : null,
      trend: null,
    }
  })
  days.forEach((d, i) => {
    const prev = days[i - 1]
    if (!prev || prev.energy === null || d.energy === null) return
    const change = prev.energy === 0 ? (d.energy > 0 ? 1 : 0) : (d.energy - prev.energy) / prev.energy
    d.trend = change >= 0.25 ? 'building' : change <= -0.25 ? 'easing' : 'steady'
  })
  return days
}
