import type { Verdict } from '@/lib/engine'
import type { HourBlock } from '@/lib/presentation'

/**
 * One day, hour by hour: the tide curve against this beach's good tide range,
 * and a Go / Close / Skip block per daylight hour underneath.
 *
 * Hand-rolled SVG — one path, a band and a marker do not justify a chart library.
 */

const W = 320
const H = 104
const PAD_X = 6
const PAD_TOP = 10
const PAD_BOTTOM = 22

const BLOCK: Record<Verdict, string> = {
  great: 'bg-go',
  caution: 'bg-close',
  not_recommended: 'bg-unknown',
  insufficient_data: 'border border-dashed border-muted/50 bg-transparent',
}

const BLOCK_WORD: Record<Verdict, string> = {
  great: 'go',
  caution: 'close',
  not_recommended: 'skip',
  insufficient_data: 'no call',
}

const tick = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'a' : 'p'}`

export function DayChart({
  title,
  blocks,
  tide,
  band,
  bandProvisional,
  caption,
}: {
  title: string
  blocks: readonly HourBlock[]
  tide: { points: { hour: number; heightFt: number }[]; extremes: { hour: number; heightFt: number; kind: 'high' | 'low'; label: string }[] }
  /** The beach's favourable tide band, or null while it is unset. */
  band: { minFt: number; maxFt: number } | null
  bandProvisional: boolean
  caption: string
}) {
  if (blocks.length === 0) return null
  const first = blocks[0].hour
  const last = blocks[blocks.length - 1].hour + 1

  const heights = [...tide.points.map((p) => p.heightFt), ...(band ? [band.minFt, band.maxFt] : [])]
  const lo = Math.min(...heights)
  const hi = Math.max(...heights)
  const pad = Math.max(0.2, (hi - lo) * 0.15)
  const yMin = lo - pad
  const yMax = hi + pad
  const x = (hour: number) => PAD_X + ((hour - first) / (last - first)) * (W - PAD_X * 2)
  const y = (ft: number) => PAD_TOP + (1 - (ft - yMin) / (yMax - yMin)) * (H - PAD_TOP - PAD_BOTTOM)

  const curve = tide.points.length >= 2 ? tide.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.hour).toFixed(1)},${y(p.heightFt).toFixed(1)}`).join(' ') : null
  const low = tide.extremes.find((e) => e.kind === 'low') ?? tide.extremes[0]

  const hasUnknown = blocks.some((b) => b.verdict === 'insufficient_data')

  return (
    <section aria-labelledby="hourly-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="hourly-heading" className="text-[17px] font-semibold tracking-tight">
          {title}
        </h2>
        <span className="text-xs text-muted">Daylight only</span>
      </div>

      <div className="mt-2.5 rounded-2xl bg-surface p-4">
        {curve ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Tide through the day${low ? `; ${low.label}` : ''}`}>
            {band ? (
              <>
                <rect x={PAD_X} width={W - PAD_X * 2} y={y(band.maxFt)} height={y(band.minFt) - y(band.maxFt)} fill="var(--tide-band)" rx="3" />
                <text x={PAD_X + 4} y={y(band.maxFt) + 11} fontSize="9" fill="var(--muted)">
                  Good tide range{bandProvisional ? ' (provisional)' : ''}
                </text>
              </>
            ) : null}
            <path d={curve} fill="none" stroke="var(--foreground)" strokeOpacity="0.75" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            {low ? (
              <g>
                <circle cx={x(low.hour)} cy={y(low.heightFt)} r="3" fill="var(--foreground)" />
                <text
                  x={Math.min(W - 4, Math.max(4, x(low.hour)))}
                  y={Math.min(H - 6, y(low.heightFt) + 13)}
                  textAnchor={x(low.hour) > W - 60 ? 'end' : x(low.hour) < 60 ? 'start' : 'middle'}
                  fontSize="9"
                  fill="var(--muted)"
                >
                  {low.label}
                </text>
              </g>
            ) : null}
          </svg>
        ) : (
          <p className="text-xs text-muted">Tide curve unavailable for this day.</p>
        )}

        <ol className="mt-2 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${blocks.length}, minmax(0, 1fr))` }}>
          {blocks.map((block) => (
            <li key={block.timestamp} className="flex flex-col items-center gap-1">
              <span className={`h-5 w-full rounded-[4px] ${BLOCK[block.verdict]}`} aria-hidden />
              <span aria-hidden className="text-[9px] leading-none text-muted">{tick(block.hour)}</span>
              <span className="sr-only">
                {tick(block.hour)}: {BLOCK_WORD[block.verdict]}
              </span>
            </li>
          ))}
        </ol>

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-go" />Go</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-close" />Close</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-unknown" />Skip</li>
          {hasUnknown ? (
            <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border border-dashed border-muted/50" />No call</li>
          ) : null}
        </ul>

        {caption ? <p className="mt-2 text-sm leading-snug text-muted">{caption}</p> : null}
      </div>
    </section>
  )
}
