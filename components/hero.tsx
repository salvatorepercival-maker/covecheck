import type { BuoyComparison } from '@/lib/conditions/buoy'
import { CONFIDENCE_WORDS, type Confidence } from '@/lib/conditions/confidence'
import { formatCompass } from '@/lib/format'
import type { DayFacts, HourFacts } from '@/lib/facts'
import type { DayFit } from '@/lib/lenses/evaluate'
import type { HeroCopy } from '@/lib/lenses/hero'
import type { Fit } from '@/lib/lenses/schema'

/**
 * The lens hero: the call in big type, its fit pill, one sentence, the day's tide
 * with the best window and "now", an hourly fit strip, four readings, and the
 * confidence with its reason.
 */

const FIRST = 6
const LAST = 18
const W = 320
const H = 120

const PILL: Record<Fit | 'unknown', string> = {
  good: 'bg-go-strong text-[#0e3a2c]',
  mixed: 'bg-now text-[#3d2c00]',
  poor: 'bg-skip text-white',
  unknown: 'bg-white/20 text-hero-ink',
}
const BLOCK: Record<Fit | 'unknown', string> = {
  good: 'bg-go-strong',
  mixed: 'bg-now',
  poor: 'bg-skip',
  unknown: 'bg-white/15',
}

const tick = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`
const num = (v: number) => String(Number(v.toFixed(1)))

function TideChart({
  day,
  best,
  nowHour,
  band,
}: {
  day: DayFacts
  best: { start: number; end: number } | null
  nowHour: number | null
  band: { minFt: number; maxFt: number } | null
}) {
  const pts = day.hours.filter((h) => h.hour >= FIRST && h.hour <= LAST + 1 && h.tideFt !== null).map((h) => ({ hour: h.hour, ft: h.tideFt! }))
  if (pts.length < 2) return <p className="text-xs text-hero-ink/60">Tide curve unavailable.</p>
  const values = [...pts.map((p) => p.ft), ...(band ? [band.maxFt] : [])]
  const lo = Math.min(...values) - 0.3
  const hi = Math.max(...values) + 0.3
  const x = (hour: number) => ((hour - FIRST) / (LAST + 1 - FIRST)) * W
  const y = (ft: number) => 8 + (1 - (ft - lo) / (hi - lo)) * (H - 16)
  // A smooth curve through the hourly points.
  const path = pts
    .map((p, i) => {
      if (i === 0) return `M${x(p.hour)},${y(p.ft)}`
      const prev = pts[i - 1]
      const cx = (x(prev.hour) + x(p.hour)) / 2
      return `C${cx},${y(prev.ft)} ${cx},${y(p.ft)} ${x(p.hour)},${y(p.ft)}`
    })
    .join(' ')
  const low = pts.reduce((a, b) => (b.ft < a.ft ? b : a))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`Tide through the day; lowest ${num(low.ft)} ft around ${tick(low.hour)}`}>
      {best ? <rect x={x(best.start)} width={x(best.end + 1) - x(best.start)} y="0" height={H} rx="6" fill="var(--hero-raised)" /> : null}
      {band ? (
        <line x1="0" x2={W} y1={y(band.maxFt)} y2={y(band.maxFt)} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="3 4" />
      ) : null}
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx={x(low.hour)} cy={y(low.ft)} r="5" fill="var(--now)" stroke="var(--hero)" strokeWidth="2" />
      {nowHour !== null && nowHour >= FIRST && nowHour <= LAST + 1 ? (
        <g>
          <line x1={x(nowHour)} x2={x(nowHour)} y1="0" y2={H} stroke="var(--now)" strokeWidth="2" />
          <text x={x(nowHour) + 4} y={H - 4} fontSize="8" fontFamily="var(--font-mono-face)" fill="var(--now)">
            NOW
          </text>
        </g>
      ) : null}
    </svg>
  )
}

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-hero-ink/55">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[15px] font-bold">{value}</p>
    </div>
  )
}

export function Hero({
  eyebrow,
  timeLabel,
  copy,
  fit,
  stripFit,
  day,
  nowHour,
  band,
  reading,
  confidence,
  buoy,
  edited,
  onEdit,
}: {
  /** "MONDAY · SNORKEL" */
  eyebrow: string
  /** "6:51 AM" */
  timeLabel: string
  copy: HeroCopy
  fit: DayFit
  /** The whole day's hourly fits, for the strip. */
  stripFit: DayFit
  day: DayFacts
  nowHour: number | null
  band: { minFt: number; maxFt: number } | null
  /** The hour the four readings describe. */
  reading: HourFacts | undefined
  confidence: Confidence | undefined
  buoy: BuoyComparison | null
  edited: boolean
  onEdit: () => void
}) {
  const hours = stripFit.hours
  const tideArrow = reading?.tide.direction === 'rising' ? '↑' : reading?.tide.direction === 'falling' ? '↓' : ''
  const buoyLine =
    buoy && buoy.divergencePct !== null && Math.abs(buoy.divergencePct) >= 15 && buoy.buoySwellFt !== null && buoy.forecastSwellFt !== null
      ? `Buoy reads ${num(buoy.buoySwellFt)} ft, ${buoy.divergencePct < 0 ? 'lower' : 'higher'} than the model's ${num(buoy.forecastSwellFt)} ft, so the next few hours follow the buoy.`
      : null

  return (
    <section aria-labelledby="hero-heading" className="rounded-[28px] bg-hero p-5 text-hero-ink shadow-xl shadow-black/15">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-hero-ink/70">
        <span>{eyebrow}</span>
        <span>{timeLabel}</span>
      </div>
      <h2 id="hero-heading" className="mt-3 font-display text-[3.4rem] font-extrabold leading-[0.9] tracking-[-0.01em]">
        {copy.title}
      </h2>
      <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-[13px] font-semibold ${PILL[fit.fit]}`}>{copy.pill}</span>
      <p className="mt-3 text-[16px] leading-snug text-hero-ink/90">{copy.sentence}</p>

      <div className="mt-4">
        <TideChart day={day} best={fit.bestHours} nowHour={nowHour} band={band} />
        <ol className="mt-3 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
          {hours.map((h) => (
            <li key={h.timestamp}>
              <span className={`block h-2.5 rounded-[3px] ${BLOCK[h.fit]}`} aria-hidden />
              <span className="sr-only">
                {tick(h.hour)}: {h.fit}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-1.5 flex justify-between font-mono text-[9px] text-hero-ink/55" aria-hidden>
          {[6, 9, 12, 15, 18].map((h) => (
            <span key={h}>{tick(h)}</span>
          ))}
        </div>
      </div>

      {reading ? (
        <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/10 pt-3">
          <Reading
            label="Waves"
            value={reading.swellFt === null ? '—' : `${num(reading.swellFt)}ft${reading.swellPeriodSec ? `·${Math.round(reading.swellPeriodSec)}s` : ''}`}
          />
          <Reading
            label="Wind"
            value={reading.windMph === null ? '—' : `${Math.round(reading.windMph)} ${reading.windFromDeg !== null ? formatCompass(reading.windFromDeg) : ''}`.trim()}
          />
          <Reading label="Tide" value={reading.tideFt === null ? '—' : `${num(reading.tideFt)} ${tideArrow}`.trim()} />
          <Reading label="Water" value={reading.seaF === null ? '—' : `${Math.round(reading.seaF)}°F`} />
        </div>
      ) : null}

      {confidence ? (
        <p className="mt-3 text-[13px] leading-snug text-hero-ink/80">
          <strong className="font-semibold text-now">{CONFIDENCE_WORDS[confidence.level]}.</strong>{' '}
          {buoyLine ?? (confidence.reasons.length ? `Because ${confidence.reasons.join('; ')}.` : 'Sources agree and the data is fresh.')}
        </p>
      ) : null}

      <div className="mt-3 flex justify-end">
        <button type="button" onClick={onEdit} className="text-xs font-semibold text-hero-ink/70 underline underline-offset-2">
          Edit settings{edited ? ' (edited)' : ''}
        </button>
      </div>
    </section>
  )
}
