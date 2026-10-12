import type { LongRangeDay } from '@/lib/planning/long-range'
import type { SwellTrain } from '@/lib/planning/swell-trains'
import { formatCompassWord } from '@/lib/lenses/words'

/**
 * Planning views: the outlook sentences, a 10-day swell timeline, and days 8-16
 * as trends. Swell here comes from the GFS-Wave model (the only one with every
 * partition for 16 days), which can differ slightly from the day tiles.
 */

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayLabel = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return `${DAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`
}

export function Outlook({ lines }: { lines: string[] }) {
  if (!lines.length) return null
  return (
    <section aria-labelledby="outlook-heading" className="rounded-2xl bg-surface p-4">
      <h2 id="outlook-heading" className="text-[17px] font-semibold tracking-tight">
        Outlook
      </h2>
      <ul className="mt-2 space-y-1.5 text-sm leading-snug">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  )
}

export function SwellTimeline({ trains, startDate, days = 10 }: { trains: SwellTrain[]; startDate: string; days?: number }) {
  const start = Date.parse(`${startDate}T00:00:00-10:00`)
  const span = days * 86_400_000
  const x = (local: string) => ((Date.parse(`${local}:00-10:00`) - start) / span) * 100
  const visible = trains.filter((t) => x(t.fades) > 0 && x(t.arrives) < 100)
  const maxFt = Math.max(1, ...visible.map((t) => t.peakFt))
  const dates = Array.from({ length: days }, (_, i) => new Date(start + i * 86_400_000 + 12 * 3_600_000).toISOString().slice(0, 10))

  return (
    <section aria-labelledby="timeline-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="timeline-heading" className="text-[17px] font-semibold tracking-tight">
          Swell timeline
        </h2>
        <span className="text-xs text-muted">Next {days} days · south window</span>
      </div>
      <div className="mt-2.5 rounded-2xl bg-surface p-4">
        {visible.length === 0 ? (
          <p className="text-sm text-muted">No swell over 0.5 ft from the cove&rsquo;s window in the next {days} days.</p>
        ) : (
          <ul className="space-y-3">
            {visible.map((t) => {
              const left = Math.max(0, x(t.arrives))
              const right = Math.min(100, x(t.fades))
              const peak = Math.min(100, Math.max(0, x(t.peaks)))
              const dir = formatCompassWord(t.directionDeg)
              return (
                <li key={`${t.arrives}-${t.directionDeg}`}>
                  <p className="text-xs">
                    <span className="font-semibold">
                      {dir ? `${dir.charAt(0).toUpperCase()}${dir.slice(1)}` : 'Swell'} · {t.peakPeriodSec} s
                    </span>{' '}
                    <span className="text-muted">
                      arrives {dayLabel(t.arrives.slice(0, 10))}, peaks {dayLabel(t.peaks.slice(0, 10))} near {t.peakFt} ft, fades{' '}
                      {dayLabel(t.fades.slice(0, 10))}
                    </span>
                  </p>
                  <div className="relative mt-1.5 h-2.5 rounded-full bg-track" aria-hidden>
                    <span
                      className="absolute top-0 h-full rounded-full bg-[#6f93ad]"
                      style={{ left: `${left}%`, width: `${Math.max(1.5, right - left)}%`, opacity: 0.35 + 0.65 * (t.peakFt / maxFt) }}
                    />
                    <span className="absolute -top-0.5 h-3.5 w-1 rounded-full bg-foreground" style={{ left: `${peak}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <ol className="mt-3 grid text-center text-[9px] text-muted" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }} aria-hidden>
          {dates.map((d) => (
            <li key={d}>{dayLabel(d).split(' ')[0]}</li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] text-muted">GFS-Wave model; can differ slightly from the day tiles above.</p>
      </div>
    </section>
  )
}

const TREND = { building: '↑ building', easing: '↓ easing', steady: '→ steady' } as const

export function LongRangeList({ days }: { days: LongRangeDay[] }) {
  if (!days.length) return null
  return (
    <section aria-labelledby="long-range-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="long-range-heading" className="text-[17px] font-semibold tracking-tight">
          Long range
        </h2>
        <span className="rounded-full bg-skip-tint px-2 py-0.5 text-[11px] font-semibold text-skip-ink">Low confidence</span>
      </div>
      <p className="mt-1 px-1 text-xs text-muted">Days 8–16 as trends only. Expect these to change.</p>
      <ul className="mt-2.5 divide-y divide-border rounded-2xl bg-surface px-4">
        {days.map((d) => (
          <li key={d.date} className="flex items-center gap-4 py-2.5 text-sm">
            <span className="w-14 shrink-0 font-semibold">{dayLabel(d.date)}</span>
            <span className="min-w-0 flex-1 text-muted">
              Swell {d.swellFt ?? '—'} ft{d.periodSec ? ` · ${d.periodSec} s` : ''} · wind {d.windMph ?? '—'} mph
            </span>
            {d.trend ? <span className="shrink-0 text-xs text-muted">{TREND[d.trend]}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
