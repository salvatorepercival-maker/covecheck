import type { DayFacts } from '@/lib/facts'
import type { DayFit } from '@/lib/lenses/evaluate'
import { FIT_BLOCK } from './fit'

/**
 * The day, 6 AM – 6 PM: tide curve, hourly wind, and — only when a lens is on —
 * an hourly fit strip. Hand-rolled SVG; no chart library for one line and bars.
 */

const FIRST = 6
const LAST = 18
const tick = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'a' : 'p'}`

function TideCurve({ day, band }: { day: DayFacts; band: { minFt: number; maxFt: number } | null }) {
  const W = 320
  const H = 70
  const pts = day.hours
    .filter((h) => h.hour >= FIRST && h.hour <= LAST + 1 && h.tideFt !== null)
    .map((h) => ({ hour: h.hour, ft: h.tideFt! }))
  if (pts.length < 2) return <p className="text-xs text-muted">Tide curve unavailable.</p>

  const values = [...pts.map((p) => p.ft), ...(band ? [band.maxFt] : [])]
  const lo = Math.min(...values) - 0.2
  const hi = Math.max(...values) + 0.2
  const x = (hour: number) => 4 + ((hour - FIRST) / (LAST + 1 - FIRST)) * (W - 8)
  const y = (ft: number) => 6 + (1 - (ft - lo) / (hi - lo)) * (H - 20)
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.hour).toFixed(1)},${y(p.ft).toFixed(1)}`).join(' ')

  const low = day.tideExtremes
    .map((e) => ({ ...e, hour: Number(e.timestamp.slice(11, 13)) + Number(e.timestamp.slice(14, 16)) / 60 }))
    .find((e) => e.kind === 'low' && e.hour >= FIRST && e.hour <= LAST + 1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Tide through the day${low ? `, low ${low.heightFt.toFixed(1)} ft` : ''}`}>
      {band ? (
        <>
          <line x1="4" x2={W - 4} y1={y(band.maxFt)} y2={y(band.maxFt)} stroke="var(--border)" strokeDasharray="3 3" />
          <text x="6" y={y(band.maxFt) - 3} fontSize="8" fill="var(--muted)">
            {band.maxFt} ft
          </text>
        </>
      ) : null}
      <path d={path} fill="none" stroke="var(--foreground)" strokeOpacity="0.75" strokeWidth="1.8" strokeLinecap="round" />
      {low ? (
        <g>
          <circle cx={x(low.hour)} cy={y(low.heightFt)} r="3" fill="var(--foreground)" />
          <text x={x(low.hour)} y={Math.min(H - 2, y(low.heightFt) + 12)} textAnchor="middle" fontSize="8.5" fill="var(--muted)">
            Low {low.timestamp.slice(11, 16).replace(/^0/, '')} · {low.heightFt.toFixed(1)} ft
          </text>
        </g>
      ) : null}
    </svg>
  )
}

export function DaySection({
  title,
  day,
  band,
  dayFit,
  activity,
  sunLine,
}: {
  title: string
  day: DayFacts
  band: { minFt: number; maxFt: number } | null
  dayFit: DayFit | null
  /** "snorkeling" — names the fit strip. */
  activity: string | null
  sunLine: string
}) {
  const hours = day.hours.filter((h) => h.hour >= FIRST && h.hour <= LAST)
  if (hours.length === 0) return null
  const windMax = Math.max(10, ...hours.map((h) => h.windMph ?? 0))
  const cols = { gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }

  return (
    <section aria-labelledby="day-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="day-heading" className="text-[17px] font-semibold tracking-tight">
          {title}
        </h2>
        <span className="text-xs text-muted">6 AM – 6 PM</span>
      </div>
      <div className="mt-2.5 space-y-4 rounded-2xl bg-surface p-4">
        <div>
          <p className="text-xs font-semibold">Tide</p>
          <TideCurve day={day} band={band} />
        </div>

        <div>
          <p className="text-xs font-semibold">Wind</p>
          <ol className="mt-2 grid items-end gap-[3px]" style={cols}>
            {hours.map((h) => (
              <li key={h.timestamp} className="flex h-14 flex-col justify-end">
                <span
                  className="block w-full rounded-t-[3px] bg-[#9fb3c2] dark:bg-[#4f6475]"
                  style={{ height: `${Math.max(8, ((h.windMph ?? 0) / windMax) * 100)}%` }}
                  aria-hidden
                />
                <span className="sr-only">
                  {tick(h.hour)}: {h.windMph === null ? 'no data' : `${Math.round(h.windMph)} mph`}
                </span>
              </li>
            ))}
          </ol>
          <ol className="mt-1 grid gap-[3px]" style={cols} aria-hidden>
            {hours.map((h) => (
              <li key={h.timestamp} className="text-center text-[9px] tabular-nums text-muted">
                {h.windMph === null ? '–' : Math.round(h.windMph)}
              </li>
            ))}
          </ol>
        </div>

        {dayFit ? (
          <div>
            <p className="text-xs font-semibold">Fit for {activity}</p>
            <ol className="mt-2 grid gap-[3px]" style={cols}>
              {dayFit.hours.map((h) => (
                <li key={h.timestamp} className="flex flex-col items-center gap-1">
                  <span className={`h-5 w-full rounded-[4px] ${FIT_BLOCK[h.fit]}`} aria-hidden />
                  <span className="sr-only">
                    {tick(h.hour)}: {h.fit}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <ol className="grid gap-[3px]" style={cols} aria-hidden>
          {hours.map((h) => (
            <li key={h.timestamp} className="text-center text-[9px] text-muted">
              {tick(h.hour)}
            </li>
          ))}
        </ol>

        {dayFit ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
            <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-go" />Good fit</li>
            <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-close" />Mixed</li>
            <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-unknown" />Poor fit</li>
          </ul>
        ) : null}

        {sunLine ? <p className="text-xs text-muted">{sunLine}</p> : null}
      </div>
    </section>
  )
}
