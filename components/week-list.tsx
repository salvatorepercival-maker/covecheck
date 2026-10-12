import type { DayFacts } from '@/lib/facts'
import { formatClockTime } from '@/lib/format'
import type { DayFit } from '@/lib/lenses/evaluate'
import { weekSummary } from '@/lib/conditions/describe'

/**
 * The week: day and date set big, the best window in mono, the numbers that
 * decide it, and a fit pill. In the raw view the pill drops away.
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const short = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`
const PILL = {
  good: ['Good', 'bg-go-tint text-go-ink'],
  mixed: ['Mixed', 'bg-close-tint text-close-ink'],
  poor: ['Poor', 'bg-skip-tint text-skip-ink'],
  early: ['Too early', 'bg-unknown-tint text-muted'],
} as const

export function WeekList({
  days,
  fits,
  highlightDate,
}: {
  days: DayFacts[]
  /** Lens fit per day, or null in the raw view. */
  fits: (DayFit | null)[]
  highlightDate: string
}) {
  return (
    <section id="week" aria-labelledby="week-heading" className="scroll-mt-4">
      <h2 id="week-heading" className="font-display text-[2rem] font-extrabold leading-none">
        The week
      </h2>
      <ul className="mt-3 space-y-2">
        {days.map((d, i) => {
          const fit = fits[i]
          const daylight = d.hours.filter((h) => h.hour >= 6 && h.hour <= 18)
          const swell = Math.max(0, ...daylight.map((h) => h.swellFt ?? 0))
          const winds = daylight.map((h) => h.windMph).filter((w): w is number => w !== null)
          const wind = winds.length ? Math.round(winds.reduce((a, b) => a + b, 0) / winds.length) : null
          const low = d.tideExtremes.find((e) => e.kind === 'low' && Number(e.timestamp.slice(11, 13)) >= 6 && Number(e.timestamp.slice(11, 13)) <= 18)
          const lowLabel = low ? formatClockTime(low.timestamp).replace(':00', '').replace(' AM', 'a').replace(' PM', 'p') : null
          const early = daylight.find((h) => h.hour === 9)?.confidence.level === 'low'
          const pill = fit ? (early || fit.fit === 'unknown' ? PILL.early : PILL[fit.fit]) : null
          const summary = weekSummary(d)
          const [y, m, dd] = d.date.split('-').map(Number)
          return (
            <li
              key={d.date}
              className={`flex items-center gap-4 rounded-[18px] bg-surface px-4 py-3 ${d.date === highlightDate ? 'ring-2 ring-foreground' : ''}`}
            >
              <span className="w-11 shrink-0 leading-none">
                <span className="block font-display text-[1.45rem] font-extrabold">{DAYS[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]}</span>
                <span className="block font-mono text-[10px] text-muted">{dd}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[13px] font-bold">
                  {fit ? (fit.bestHours ? `Best ${short(fit.bestHours.start)} – ${short(fit.bestHours.end + 1)}` : 'No good window') : summary.title}
                </span>
                <span className="block truncate text-[12px] text-muted">
                  {fit
                    ? [`Swell ${Number(swell.toFixed(1))} ft`, wind !== null ? `wind ${wind}` : null, lowLabel ? `low ${lowLabel}` : null].filter(Boolean).join(' · ')
                    : summary.detail}
                </span>
              </span>
              {pill ? <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${pill[1]}`}>{pill[0]}</span> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
