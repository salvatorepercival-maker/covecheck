'use client'

import { useState } from 'react'
import { coveredByCheck } from '@/lib/beach/closure-coverage'
import type { BuoyComparison } from '@/lib/conditions/buoy'
import { waveGauge, wavesNote, windGauge, windNote, type Gauge } from '@/lib/conditions/deciding'
import { uvPeakWindow, wearFor } from '@/lib/conditions/describe'
import { SKY_WORDS } from '@/lib/conditions/sky'
import { WIND_CLASS_WORDS } from '@/lib/conditions/wind'
import type { DayFacts, HourFacts } from '@/lib/facts'
import { formatCompass, formatHour } from '@/lib/format'
import { affectsFit, type FactorId, type FactorTag, type Lens } from '@/lib/lenses/schema'
import type { HistoryDay } from '@/lib/providers/advisory-history'
import { AdvisoriesDetail, ClarityDetail, ClosuresDetail, HourlyDetail, JellyDetail, SwellDetail, UvDetail, WaterTempDetail, WeatherDetail } from './metric-details'

/**
 * "What's deciding it": the two factors that decide most days (waves, wind) as
 * big cards with a gauge drawn from the lens's own limits, chop as a strip, and
 * everything else as one "Also checked" list. Raw mode shows the same readings
 * with no gauges, chips or ticks.
 */

type Status = 'good' | 'mixed' | 'poor' | 'unknown' | 'info' | null
const RANK = { good: 0, mixed: 1, unknown: 2, poor: 3 } as const
const worst = (tags: (FactorTag | undefined)[]): Status => {
  const t = tags.filter((x): x is 'good' | 'mixed' | 'poor' | 'unknown' => x !== undefined && x !== 'off')
  return t.length ? t.reduce((a, b) => (RANK[b] > RANK[a] ? b : a)) : null
}

const CHIP: Record<Exclude<Status, null>, [string, string]> = {
  good: ['Good', 'bg-go-tint text-go-ink'],
  mixed: ['Mixed', 'bg-close-tint text-close-ink'],
  poor: ['Poor', 'bg-skip-tint text-skip-ink'],
  unknown: ['Unknown', 'bg-unknown-tint text-muted'],
  info: ['Info', 'bg-unknown-tint text-muted'],
}

function Chip({ status }: { status: Status }) {
  if (!status) return null
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${CHIP[status][1]}`}>{CHIP[status][0]}</span>
}

/** A tick for "checked and clear", a chip for everything that needs a look. */
function Mark({ status }: { status: Status }) {
  if (!status) return null
  if (status === 'good')
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-go" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label="Clear">
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    )
  return <Chip status={status} />
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

const ICONS: Record<string, React.ReactNode> = {
  waves: <path d="M3 9c2 0 2-1.5 4.5-1.5S9.5 9 12 9s2-1.5 4.5-1.5S19 9 21 9M3 15c2 0 2-1.5 4.5-1.5S9.5 15 12 15s2-1.5 4.5-1.5S19 15 21 15" />,
  wind: <path d="M3 8h11a2.6 2.6 0 1 0-2.6-2.6M3 13h15a2.6 2.6 0 1 1-2.6 2.6M3 18h7" />,
  chop: <path d="M4 13c2-2.5 4-2.5 6 0s4 2.5 6 0 3-2 4-1" />,
  clarity: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  weather: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  uv: <path d="M4 17h16M7 17a5 5 0 0 1 10 0M12 7V5M6.3 9.3 5 8M17.7 9.3 19 8M3 21h18" />,
  water: <path d="M10 13.6V5.2a2 2 0 1 1 4 0v8.4a4.2 4.2 0 1 1-4 0Z" />,
  advisories: <path d="M12 3.5 21.5 19.5H2.5L12 3.5ZM12 9.5v4.2M12 16.7h.01" />,
  jelly: <path d="M5 11a7 7 0 0 1 14 0Zm2 0v6m3.3-6v8m3.4-8v8M17 11v6" />,
  closures: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </>
  ),
}
const TINT: Record<string, string> = {
  waves: 'bg-go-tint text-go-ink',
  wind: 'bg-go-tint text-go-ink',
  chop: 'bg-go-tint text-go-ink',
  clarity: 'bg-[#dbe9f1] text-[#2e5d77]',
  weather: 'bg-close-tint text-close-ink',
  uv: 'bg-skip-tint text-skip-ink',
  water: 'bg-[#dbe9f1] text-[#2e5d77]',
  advisories: 'bg-unknown-tint text-foreground/70',
  jelly: 'bg-[#ebe3fb] text-[#5b3fa6]',
  closures: 'bg-unknown-tint text-foreground/70',
}

function Icon({ id, size = 'h-9 w-9' }: { id: string; size?: string }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-[10px] ${TINT[id]}`} aria-hidden>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[id]}
      </svg>
    </span>
  )
}

function GaugeBar({ g }: { g: Gauge }) {
  const pct = (v: number) => `${(Math.max(0, Math.min(1, v)) * 100).toFixed(1)}%`
  const ranged = g.goodFrom !== undefined
  return (
    <div className="mt-3" aria-hidden>
      <div className="relative h-2 overflow-hidden rounded-full bg-skip-tint">
        {ranged ? (
          <>
            <span className="absolute inset-y-0 bg-close-tint" style={{ left: pct(g.mixedFrom!), width: pct(g.mixedTo - g.mixedFrom!) }} />
            <span className="absolute inset-y-0 bg-go-tint" style={{ left: pct(g.goodFrom!), width: pct(g.goodTo - g.goodFrom!) }} />
          </>
        ) : (
          <>
            <span className="absolute inset-y-0 left-0 bg-close-tint" style={{ width: pct(g.mixedTo) }} />
            <span className="absolute inset-y-0 left-0 bg-go-tint" style={{ width: pct(g.goodTo) }} />
          </>
        )}
      </div>
      <span className="relative -mt-3.5 block h-5">
        <span className="absolute top-0 h-5 w-[3px] -translate-x-1/2 rounded-full bg-foreground" style={{ left: pct(g.at) }} />
      </span>
    </div>
  )
}

function BigCard({
  id,
  label,
  value,
  unit,
  sub,
  status,
  gauge,
  note,
  open,
  onToggle,
}: {
  open: boolean
  onToggle: () => void
  id: string
  label: string
  value: string
  unit: string
  sub: string
  status: Status
  gauge: Gauge | null
  note: string
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`detail-${id}`}
        className={`flex h-full w-full flex-col rounded-[20px] bg-surface p-4 text-left transition-shadow ${open ? 'ring-2 ring-foreground/70' : ''}`}
      >
      <div className="flex items-start justify-between gap-2">
        <Icon id={id} />
        <span className="flex items-center gap-1.5">
          <Chip status={status} />
          <Chevron open={open} />
        </span>
      </div>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 font-mono leading-none">
        <span className="text-[2rem] font-bold">{value}</span>
        <span className="ml-1 text-[14px] font-bold">{unit}</span>
      </p>
      <p className="mt-2 font-mono text-[12px] text-foreground/80">{sub}</p>
      {gauge ? (
        <>
          <GaugeBar g={gauge} />
          <p className="text-[11px] text-muted">{gauge.caption}</p>
        </>
      ) : null}
      <p className="mt-3 border-t border-border pt-2.5 text-[12px] leading-snug text-foreground/80">{note}</p>
      </button>
    </li>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDate = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`

export function DecidingPanel({
  lens,
  day,
  h,
  tags,
  buoy,
  shore,
  label,
  days,
  todayDate,
  advisoryHistory,
  closuresLastChecked,
}: {
  /** The forecast week, for the opened details. */
  days: DayFacts[]
  todayDate: string
  advisoryHistory: HistoryDay[] | null
  /** The last date closures were checked by hand. */
  closuresLastChecked: string | null
  /** Null in raw mode: readings only. */
  lens: Lens | null
  day: DayFacts
  h: HourFacts
  /** The lens's tags for this hour. */
  tags: Partial<Record<FactorId, FactorTag>> | null
  buoy: BuoyComparison | null
  shore: string
  /** "Now" or "At 9 AM". */
  label: string
}) {
  const [open, setOpen] = useState<string | null>(null)
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id))
  const tag = (...ids: FactorId[]): Status => (lens && tags ? worst(ids.map((id) => tags[id])) : null)
  const num = (v: number) => String(Number(v.toFixed(1)))

  // Also checked
  const wq = h.waterQuality
  const advisoryItems = [...h.nwsHazards.map((x) => x.event), ...(wq.status === 'advisory' ? wq.advisories.map((a) => `${a.type}, ${a.distanceKm} km`) : [])]
  const advisoryUnknown = !h.nwsHazardsKnown || wq.status === 'unknown'
  const uv = uvPeakWindow(day)
  const clarityStatus: Status = lens && tags?.clarity && tags.clarity !== 'off' ? (affectsFit(lens.factors.clarity) ? tag('clarity') : 'info') : null
  const checkedNow = coveredByCheck(closuresLastChecked, day.date)
  const closureStatus: Status = lens ? (h.closures.length ? 'poor' : checkedNow ? 'good' : 'unknown') : null

  const rows: { id: string; title: string; sub: string; value: string; status: Status }[] = [
    {
      id: 'clarity',
      title: 'Water clarity',
      sub: 'Estimate · not used until 10 visits',
      value: h.clarity ? `~${h.clarity.ft} ft` : '—',
      status: clarityStatus,
    },
    {
      id: 'weather',
      title: 'Weather',
      sub: [h.sky ? SKY_WORDS[h.sky] : null, h.rainPct !== null ? `${Math.round(h.rainPct)}% rain` : null, h.rain48hIn === null ? null : h.rain48hIn < 0.05 ? 'dry 48 hrs' : `${num(h.rain48hIn)} in last 48 hrs`, h.thunder.expected ? 'thunderstorms possible' : null]
        .filter(Boolean)
        .join(' · '),
      value: h.airF === null ? '—' : `${Math.round(h.airF)}°F`,
      status: tag('storms', 'rain'),
    },
    {
      id: 'uv',
      title: 'UV index',
      sub: uv ? `${uv.peak >= 11 ? 'Extreme' : uv.peak >= 8 ? 'Very high' : uv.peak >= 6 ? 'High' : uv.peak >= 3 ? 'Moderate' : 'Low'} · peaks ${uv.range.replace(/ PM – /, ' – ').replace(/ AM – /, ' – ')}` : 'UV unavailable',
      value: uv ? String(uv.peak) : '—',
      status: tag('uv'),
    },
    {
      id: 'water',
      title: 'Water temp',
      sub: h.seaF === null ? '—' : wearFor(h.seaF),
      value: h.seaF === null ? '—' : `${Math.round(h.seaF)}°F`,
      status: tag('waterTemp'),
    },
    {
      id: 'advisories',
      title: 'Advisories',
      sub: advisoryItems.length ? advisoryItems.join(' · ') : advisoryUnknown ? `Couldn't check ${[!h.nwsHazardsKnown ? 'Weather Service' : null, wq.status === 'unknown' ? 'Health Dept.' : null].filter(Boolean).join(' or ')}` : 'Weather Service · Health Dept.',
      value: advisoryItems.length ? String(advisoryItems.length) : advisoryUnknown ? '—' : 'None',
      status: tag('advisories', 'waterQuality'),
    },
    {
      id: 'jelly',
      title: 'Box jellyfish',
      sub: h.jelly.window ? (h.jelly.expected ? `Expected through ${shortDate(h.jelly.window.end)}` : `Next window ~${shortDate(h.jelly.window.start)} – ${Number(h.jelly.window.end.slice(8))}`) : 'Calendar unavailable',
      value: h.jelly.expected ? 'Expected' : 'None',
      status: tag('jellyfish') ?? (lens ? 'good' : null),
    },
    {
      id: 'closures',
      title: 'Closures',
      sub: h.closures.length
        ? h.closures.map((c) => c.title).join(' · ')
        : `Not monitored · ${closuresLastChecked ? `checked by hand ${shortDate(closuresLastChecked)}` : 'not checked by hand yet'}`,
      value: h.closures.length ? 'Closed' : checkedNow ? 'None' : '—',
      status: closureStatus,
    },
  ]
  const clear = rows.filter((r) => r.status === 'good').length
  const note = rows.filter((r) => r.status !== null && r.status !== 'good').length

  const advisoryNow: 'clear' | 'in effect' | 'unknown' = advisoryItems.length ? 'in effect' : advisoryUnknown ? 'unknown' : 'clear'
  const week = days.filter((d) => d.date >= todayDate).slice(0, 7)
  const detail = (id: string): React.ReactNode => {
    switch (id) {
      case 'clarity':
        return <ClarityDetail days={week} today={todayDate} lens={lens} />
      case 'weather':
        return <WeatherDetail days={week} today={todayDate} />
      case 'uv':
        return <UvDetail days={week} today={todayDate} />
      case 'water':
        return <WaterTempDetail days={week} today={todayDate} />
      case 'advisories':
        return <AdvisoriesDetail days={week} today={todayDate} current={advisoryNow} history={advisoryHistory} />
      case 'jelly':
        return <JellyDetail today={todayDate} />
      case 'closures':
        return <ClosuresDetail days={week} today={todayDate} lastChecked={closuresLastChecked} />
      case 'waves':
        return <SwellDetail days={week} today={todayDate} />
      case 'wind':
        return <HourlyDetail title="Wind through the day" day={day} value={(x) => x.windMph} unit="mph" digits={0} note={hourlyNote(day, (x) => x.windMph, 'mph', 'Lightest', 'strongest')} />
      case 'chop':
        return <HourlyDetail title="Chop through the day" day={day} value={(x) => x.chopFt} unit="ft, inside the cove" note={hourlyNote(day, (x) => x.chopFt, 'ft', 'Calmest', 'choppiest')} />
      default:
        return null
    }
  }

  const waveStatus = tag('waves')
  const windStatus = tag('wind')
  const chopStatus = tag('chop')

  return (
    <section aria-labelledby="tiles-heading" className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="tiles-heading" className="font-display text-[2rem] font-extrabold leading-none">
          {lens ? 'What’s deciding it' : 'Conditions'}
        </h2>
        <span className="font-mono text-[10px] text-muted">{label}</span>
      </div>

      <ul className="grid grid-cols-2 gap-2.5">
        <BigCard
          id="waves"
          label="Waves"
          value={h.swellFt === null ? '—' : num(h.swellFt)}
          unit="ft"
          sub={[h.swellPeriodSec ? `${Math.round(h.swellPeriodSec)} s` : null, h.swellFromDeg !== null ? `from ${formatCompass(h.swellFromDeg)}` : null].filter(Boolean).join(' · ') || '—'}
          status={waveStatus}
          open={open === 'waves'}
          onToggle={() => toggle('waves')}
          gauge={lens ? waveGauge(lens, h) : null}
          note={wavesNote(h, buoy, shore)}
        />
        <BigCard
          id="wind"
          label="Wind"
          value={h.windMph === null ? '—' : String(Math.round(h.windMph))}
          unit="mph"
          sub={[h.windFromDeg !== null ? formatCompass(h.windFromDeg) : null, h.windClass ? WIND_CLASS_WORDS[h.windClass] : null].filter(Boolean).join(' · ') || '—'}
          status={windStatus}
          open={open === 'wind'}
          onToggle={() => toggle('wind')}
          gauge={lens ? windGauge(lens, h) : null}
          note={windNote(day, h)}
        />
      </ul>
      {open === 'waves' || open === 'wind' ? <div id={`detail-${open}`}>{detail(open)}</div> : null}

      <button
        type="button"
        onClick={() => toggle('chop')}
        aria-expanded={open === 'chop'}
        aria-controls="detail-chop"
        className={`flex w-full items-center gap-3 rounded-[20px] bg-surface p-3.5 text-left ${open === 'chop' ? 'ring-2 ring-foreground/70' : ''}`}
      >
        <Icon id="chop" />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Chop</span>
          <span className="block text-[14px]">
            {h.chopFt === null ? 'Wind waves unavailable' : h.chopFt === 0 ? 'Calm inside the cove' : h.chopFt < 1 ? 'Light chop inside the cove' : 'Choppy inside the cove'}
          </span>
        </span>
        <span className="font-mono text-[1.35rem] font-bold">{h.chopFt === null ? '—' : `${num(h.chopFt)} ft`}</span>
        <Chip status={chopStatus} />
        <Chevron open={open === 'chop'} />
      </button>
      {open === 'chop' ? <div id="detail-chop">{detail('chop')}</div> : null}

      <div className="rounded-[20px] bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Also checked</p>
          {lens ? (
            <p className="font-mono text-[11px] font-bold text-go-ink">
              {clear} clear · {note} to note
            </p>
          ) : null}
        </div>
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => toggle(r.id)}
                aria-expanded={open === r.id}
                aria-controls={`detail-${r.id}`}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <Icon id={r.id} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-tight">{r.title}</span>
                  <span className="block text-[12px] leading-snug text-muted">{r.sub}</span>
                </span>
                <span className="shrink-0 font-mono text-[1.05rem] font-bold">{r.value}</span>
                <Mark status={r.status} />
                <Chevron open={open === r.id} />
              </button>
              {open === r.id ? (
                <div id={`detail-${r.id}`} className="pb-3">
                  {detail(r.id)}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** "Lightest 8 mph at 7 AM, strongest 19 mph at 2 PM." */
export function hourlyNote(day: DayFacts, value: (h: HourFacts) => number | null, unit: string, low: string, high: string): string {
  const hrs = day.hours.filter((x) => x.hour >= 6 && x.hour <= 18 && value(x) !== null)
  if (!hrs.length) return 'No hourly readings for this day.'
  const lo = hrs.reduce((a, b) => (value(b)! < value(a)! ? b : a))
  const hi = hrs.reduce((a, b) => (value(b)! > value(a)! ? b : a))
  const v = (x: HourFacts) => Number(value(x)!.toFixed(unit === 'mph' ? 0 : 1))
  if (v(lo) === v(hi)) return `Holds at ${v(lo)} ${unit} all day.`
  return `${low} ${v(lo)} ${unit} at ${formatHour(lo.hour)}, ${high} ${v(hi)} ${unit} at ${formatHour(hi.hour)}.`
}
