import type { LongRangeDay } from '@/lib/planning/long-range'
import type { SwellTrain } from '@/lib/planning/swell-trains'

/**
 * Planning views: the outlook sentences, a 10-day swell timeline, and days 8-16
 * as trends. Swell here comes from the GFS-Wave model (the only one with every
 * partition for 16 days), which can differ slightly from the day tiles.
 */

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dayLabel = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return `${DAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`
}

export function Outlook({ lines }: { lines: string[] }) {
  if (!lines.length) return null
  return (
    <section aria-labelledby="outlook-heading" className="rounded-[22px] bg-outlook p-5">
      <h2 id="outlook-heading" className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/70">
        Outlook
      </h2>
      <p className="mt-2 text-[17px] leading-snug">{lines.join(' ')}</p>
    </section>
  )
}

export function SwellTimeline({
  trains,
  startDate,
  days = 10,
  modelGaps = [],
}: {
  trains: SwellTrain[]
  startDate: string
  days?: number
  modelGaps?: { date: string; tilesFt: number; timelineFt: number }[]
}) {
  const start = Date.parse(`${startDate}T00:00:00-10:00`)
  const span = days * 86_400_000
  const x = (local: string) => ((Date.parse(`${local}:00-10:00`) - start) / span) * 100
  const visible = trains.filter((t) => x(t.fades) > 0 && x(t.arrives) < 100)
  const lastDate = new Date(start + (days - 1) * 86_400_000 + 12 * 3_600_000).toISOString().slice(0, 10)
  const day = (date: string) => (date === startDate ? 'today' : WEEKDAY_LONG[new Date(`${date}T00:00:00Z`).getUTCDay()])
  const phrase = (t: SwellTrain) => {
    const arrived = t.arrives.slice(0, 10) <= startDate
    const parts = [
      arrived ? `peaks ${day(t.peaks.slice(0, 10))} near ${t.peakFt} ft` : `${t.peakPeriodSec >= 15 ? 'lands' : 'arrives'} ${day(t.arrives.slice(0, 10))}, peaks ${day(t.peaks.slice(0, 10))} near ${t.peakFt} ft`,
    ]
    if (arrived) parts.push(t.fades.slice(0, 10) === startDate ? 'fading today' : `gone by ${day(t.fades.slice(0, 10))}`)
    return parts.join(', ')
  }

  return (
    <section aria-labelledby="timeline-heading" className="rounded-[22px] bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="timeline-heading" className="font-display text-[1.6rem] font-extrabold leading-none">
          Swells coming
        </h2>
        <span className="font-mono text-[10px] text-muted">{days} days</span>
      </div>
      {visible.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No swell over 0.5 ft from the cove&rsquo;s window in the next {days} days.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {visible.map((t) => {
            const left = Math.max(0, x(t.arrives))
            const right = Math.min(100, x(t.fades))
            const peak = Math.min(100, Math.max(0, x(t.peaks)))
            const long = t.peakPeriodSec >= 15
            return (
              <li key={`${t.arrives}-${t.directionDeg}-${t.peakPeriodSec}`}>
                <p className="text-[13px] leading-snug">
                  <span className="font-mono font-bold">{t.peakPeriodSec} s</span>
                  <span className="text-foreground/80"> · {phrase(t)}</span>
                </p>
                <div className="relative mt-1.5 h-3 rounded-full bg-track" aria-hidden>
                  <span className={`absolute top-0 h-full rounded-full ${long ? 'bg-now' : 'bg-go-strong'}`} style={{ left: `${left}%`, width: `${Math.max(2, right - left)}%` }} />
                  <span className="absolute -top-1 h-5 w-[3px] rounded-full bg-foreground" style={{ left: `${peak}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-3 flex justify-between font-mono text-[10px] text-muted" aria-hidden>
        <span>{dayLabel(startDate)}</span>
        <span>{dayLabel(lastDate)}</span>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Each row is one swell on its own, from the GFS-Wave model; amber marks long-period swell (15 s+), which carries more
        surge. The Waves tile is all in-window swell combined, from Open-Meteo&rsquo;s default model, so the two can read
        differently.
        {modelGaps.length
          ? ` Where they differ most: ${modelGaps.map((g) => `${dayLabel(g.date)} — tiles ${g.tilesFt} ft, GFS-Wave ${g.timelineFt} ft`).join('; ')}.`
          : ''}
      </p>
    </section>
  )
}


export function LongRangeList({ days }: { days: LongRangeDay[] }) {
  const shown = days.filter((d) => d.swellFt !== null)
  if (!shown.length) return null
  const max = Math.max(...shown.map((d) => d.swellFt!))
  const sorted = shown.map((d) => d.swellFt!).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  return (
    <section aria-labelledby="long-range-heading" className="rounded-[22px] bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="long-range-heading" className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/70">
          Days 8–16 · swell trend
        </h2>
        <span className="rounded-full bg-skip-tint px-2 py-0.5 text-[11px] font-semibold text-skip-ink">Low confidence</span>
      </div>
      <ol className="mt-4 grid items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map((d) => {
          const standout = d.swellFt === max && max >= median * 1.4
          return (
            <li key={d.date} className="flex flex-col items-center gap-1">
              <span className="font-mono text-[10px]">{d.swellFt}</span>
              <span
                className={`w-full rounded-[4px] ${standout ? 'bg-report' : 'bg-go-strong'}`}
                style={{ height: `${Math.max(8, (d.swellFt! / max) * 72)}px` }}
                title={`${dayLabel(d.date)}: ${d.swellFt} ft${d.periodSec ? ` at ${d.periodSec} s` : ''}, wind ${d.windMph ?? '—'} mph`}
              />
              <span className="font-mono text-[10px] text-muted">{Number(d.date.slice(8))}</span>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-[11px] text-muted">Peak in-window swell each day, ft. A direction of travel, not a reading.</p>
    </section>
  )
}
