import { isDirectionInAnyRange, type DirectionRange } from '../geo'

/**
 * Swell trains: when each in-window swell arrives, peaks and fades, with its
 * direction and period.
 *
 * The model's partitions are not stable identities — a swell moves between the
 * primary, secondary and tertiary slots hour to hour. What stays stable is its
 * direction and period band, which is how swells are named ("a 17 s south
 * swell"). So partitions are pooled by direction sector (SE / S–SW) × period
 * band (short / mid / long), each pool smoothed over 5 h, and cut into runs
 * above MIN_TRAIN_FT. The most energetic MAX_TRAINS are shown.
 */

export const MIN_TRAIN_FT = 0.5
/** A train must last this long and reach this height to be worth showing. */
export const MIN_TRAIN_HOURS = 12
export const MIN_PEAK_FT = 1
/** Gaps up to this long inside a run are bridged. */
const MAX_GAP_HOURS = 6

/**
 * Two sectors, not three: the model's direction for one swell wobbles by 20-30°
 * (a 17 s swell reads 181° one hour and 212° the next), so a south / southwest
 * split cuts real swells in half. Southeast swells are a distinct source.
 */
const SECTORS = [
  { name: 'SE', from: 135, to: 170 },
  { name: 'S', from: 170, to: 226 },
] as const

export type SwellTrain = {
  arrives: string
  peaks: string
  fades: string
  peakFt: number
  peakPeriodSec: number
  directionDeg: number
}

type Part = { heightFt: number | null; periodSec: number | null; directionDeg: number | null }
type Hour = { i: number; ft: number; p: number; d: number }

const sectorOf = (deg: number) => SECTORS.findIndex((s) => deg >= s.from && deg < s.to)

/** Period bands, the way swells are named ("a 17 s south swell"). Half-second edges avoid jitter at whole seconds. */
const BANDS = [
  { name: 'short', min: 0, max: 10.5 },
  { name: 'mid', min: 10.5, max: 13.5 },
  { name: 'long', min: 13.5, max: 99 },
] as const
const bandOf = (p: number) => BANDS.findIndex((b) => p >= b.min && p < b.max)
/** Show at most this many swells, the most energetic first, then by arrival. */
export const MAX_TRAINS = 8

export function swellTrains(times: readonly string[], partitions: readonly (readonly Part[])[], window: readonly DirectionRange[]): SwellTrain[] {
  const found: (SwellTrain & { energy: number })[] = []
  SECTORS.forEach((_, sector) => {
    BANDS.forEach((__, band) => {
      // 1. The strongest partition in this sector and period band, each hour.
      const raw: (Hour | null)[] = times.map((___, i) => {
        let best: Hour | null = null
        for (const p of partitions[i]) {
          if (p.heightFt === null || p.periodSec === null || p.directionDeg === null) continue
          if (!isDirectionInAnyRange(p.directionDeg, window) || sectorOf(p.directionDeg) !== sector || bandOf(p.periodSec) !== band) continue
          if (!best || p.heightFt > best.ft) best = { i, ft: p.heightFt, p: p.periodSec, d: p.directionDeg }
        }
        return best
      })
      // 2. Smooth with a 5-hour median so a partition dropping out for an hour doesn't end a swell.
      const smoothed = raw.map((h, i) => {
        const ft = [-2, -1, 0, 1, 2].map((k) => raw[i + k]?.ft ?? 0).sort((a, b) => a - b)[2]
        return h ? { ...h, ft } : ft >= MIN_TRAIN_FT ? { i, ft, p: raw[i - 1]?.p ?? raw[i + 1]?.p ?? 0, d: raw[i - 1]?.d ?? raw[i + 1]?.d ?? 0 } : null
      })
      // 3. Runs above the threshold, bridging short gaps.
      let run: Hour[] = []
      const flush = () => {
        if (run.length) emit(run)
        run = []
      }
      for (const h of smoothed) {
        if (!h || h.ft < MIN_TRAIN_FT) continue
        const last = run[run.length - 1]
        if (last && h.i - last.i > MAX_GAP_HOURS) flush()
        run.push(h)
      }
      flush()
    })
  })

  function emit(hours: Hour[]) {
    const peak = hours.reduce((a, b) => (b.ft > a.ft ? b : a))
    const first = hours[0]
    const last = hours[hours.length - 1]
    if (last.i - first.i + 1 < MIN_TRAIN_HOURS || peak.ft < MIN_PEAK_FT) return
    found.push({
      arrives: times[first.i],
      peaks: times[peak.i],
      fades: times[last.i],
      peakFt: Math.round(peak.ft * 10) / 10,
      peakPeriodSec: Math.round(peak.p),
      directionDeg: Math.round(peak.d),
      energy: peak.ft ** 2 * peak.p,
    })
  }

  return found
    .sort((a, b) => b.energy - a.energy)
    .slice(0, MAX_TRAINS)
    .sort((a, b) => a.arrives.localeCompare(b.arrives))
    .map((t) => ({ arrives: t.arrives, peaks: t.peaks, fades: t.fades, peakFt: t.peakFt, peakPeriodSec: t.peakPeriodSec, directionDeg: t.directionDeg }))
}
