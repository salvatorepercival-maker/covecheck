'use client'

import { useState } from 'react'
import { CHECK_VALID_DAYS, coveredByCheck } from '@/lib/beach/closure-coverage'
import { fullMoonsBetween, jellyWindowsFrom } from '@/lib/conditions/jellyfish'
import type { SkyKind } from '@/lib/conditions/sky'
import { dominantSky, SKY_WORDS } from '@/lib/conditions/sky'
import { wearFor } from '@/lib/conditions/describe'
import type { DayFacts } from '@/lib/facts'
import { formatHour } from '@/lib/format'
import type { Lens } from '@/lib/lenses/schema'
import type { HistoryDay } from '@/lib/providers/advisory-history'

/**
 * The opened view of each "What's deciding it" metric: the week (or the day)
 * behind the single number on the row.
 */

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()
const short = (date: string, today: string) => (date === today ? 'Today' : DAY[dow(date)])
const daylight = (d: DayFacts) => d.hours.filter((h) => h.hour >= 6 && h.hour <= 18)
const nn = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export function DetailShell({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] bg-surface-sunk/70 p-4">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/70">
        <span className="font-bold">{title}</span>
        {aside ? <span className="normal-case tracking-normal text-muted">{aside}</span> : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

const Note = ({ children }: { children: React.ReactNode }) => <p className="mt-3 text-[14px] leading-snug text-foreground/85">{children}</p>

// ---------------------------------------------------------------------------

export function ClarityDetail({ days, today, lens }: { days: DayFacts[]; today: string; lens: Lens | null }) {
  const rows = days.map((d) => {
    const hrs = daylight(d)
    const ft = mean(nn(hrs.map((h) => h.clarity?.ft ?? null)))
    const nine = hrs.find((h) => h.hour === 9) ?? hrs[0]
    return { date: d.date, ft: ft === null ? null : Math.round(ft / 5) * 5, cause: nine?.clarity?.mainCause ?? null, wind: nine?.windMph ?? null, trades: nine?.windFromDeg != null && nine.windFromDeg >= 30 && nine.windFromDeg <= 130 }
  })
  const max = Math.max(30, ...nn(rows.map((r) => r.ft)))
  const rule = lens?.factors.clarity
  const line = rule && rule.kind === 'floor' ? rule.good : null
  const worst = rows.filter((r) => r.ft !== null).reduce((a, b) => (b.ft! < a.ft! ? b : a), rows[0])
  const steady = new Set(rows.map((r) => r.ft)).size <= 1
  const why =
    worst.cause === 'wind' && worst.wind !== null
      ? ` as ${Math.round(worst.wind)} mph ${worst.trades ? 'trades' : 'wind'} stir the water`
      : worst.cause === 'swell'
        ? ' as swell stirs the bottom'
        : worst.cause === 'rain'
          ? ' after rain'
          : ''
  return (
    <DetailShell title="Visibility this week" aside="daytime average · estimate, ft">
      <div className="relative pr-12">
        <ol className="grid h-28 items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
          {rows.map((r) => (
            <li key={r.date} className="flex h-full flex-col items-center justify-end gap-1">
              <span className="font-mono text-[10px]">{r.ft === null ? '—' : `~${r.ft}`}</span>
              <span
                className={`w-full rounded-[6px] ${r.date === today ? 'bg-[#2e5d77]' : 'border-2 border-[#6f98ad] bg-surface'}`}
                style={{ height: `${r.ft === null ? 4 : Math.max(10, (r.ft / max) * 80)}px` }}
              />
            </li>
          ))}
        </ol>
        {line ? (
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#2e5d77]" style={{ bottom: `${(line / max) * 80}px` }}>
            <span className="absolute right-0 -top-[7px] bg-surface-sunk pl-1 font-mono text-[10px] leading-none text-[#2e5d77]">your {line}</span>
          </div>
        ) : null}
      </div>
      <div className="pr-12">
        <DayAxis days={rows.map((r) => r.date)} today={today} />
      </div>
      <Note>
        {steady ? `Steady around ~${worst.ft} ft all week.` : `Drops to ~${worst.ft} ft ${worst.date === today ? 'today' : WEEKDAY[dow(worst.date)]}${why}.`} Hollow bars are
        guesses; they firm up as you log visits.
      </Note>
    </DetailShell>
  )
}

function DayAxis({ days, today, values }: { days: string[]; today: string; values?: string[] }) {
  return (
    <ol className="mt-1.5 grid gap-1.5 text-center" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
      {days.map((d, i) => (
        <li key={d} className="leading-tight">
          <span className={`block font-mono text-[11px] ${d === today ? 'font-bold' : 'text-foreground/75'}`}>{short(d, today)}</span>
          {values ? <span className="block font-mono text-[11px] font-bold">{values[i]}</span> : null}
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------

const SKY_ICON: Record<SkyKind, string> = {
  clear: '☀️',
  mostly_sunny: '🌤️',
  partly_cloudy: '⛅',
  cloudy: '☁️',
  fog: '🌫️',
  showers: '🌦️',
  rain: '🌧️',
  storms: '⛈️',
}

export function WeatherDetail({ days, today }: { days: DayFacts[]; today: string }) {
  const rows = days.map((d) => {
    const hrs = daylight(d)
    return { date: d.date, sky: dominantSky(hrs.map((h) => h.sky)), high: Math.max(...nn(hrs.map((h) => h.airF))), rain: Math.max(0, ...nn(hrs.map((h) => h.rainPct))) }
  })
  const weekSky = dominantSky(rows.map((r) => r.sky))
  const wetFrom = rows.find((r) => r.rain >= 30)
  const stirs = rows.find((r) => r.rain >= 40)
  const wettest = rows.reduce((a, b) => (b.rain > a.rain ? b : a))
  const when = (d: string) => (d === today ? 'today' : WEEKDAY[dow(d)])
  return (
    <DetailShell title="Highs and rain chance">
      <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
        {rows.map((r) => (
          <li key={r.date} className={`flex flex-col items-center gap-1 rounded-xl py-2 ${r.date === today ? 'bg-surface' : ''}`}>
            <span className={`font-mono text-[11px] ${r.date === today ? 'font-bold' : 'text-foreground/75'}`}>{short(r.date, today)}</span>
            <span className="text-[18px] leading-none" aria-label={r.sky ? SKY_WORDS[r.sky] : 'unknown'}>
              {r.sky ? SKY_ICON[r.sky] : '·'}
            </span>
            <span className="font-mono text-[14px] font-bold">{Number.isFinite(r.high) ? `${Math.round(r.high)}°` : '—'}</span>
            <span className="relative h-10 w-2.5 overflow-hidden rounded-full bg-surface ring-1 ring-border" aria-hidden>
              <span className="absolute inset-x-0 bottom-0 bg-[#4f7f99]" style={{ height: `${Math.max(4, r.rain)}%` }} />
            </span>
            <span className="font-mono text-[10px] text-[#2e5d77]">{Math.round(r.rain)}%</span>
          </li>
        ))}
      </ol>
      <Note>
        {weekSky ? `${SKY_WORDS[weekSky]}` : 'Mixed skies'}
        {wetFrom
          ? `. Showers become more likely from ${when(wetFrom.date)}`
          : wettest.rain < 15
            ? ' and dry all week'
            : `, mostly dry; rain chance tops out at ${Math.round(wettest.rain)}% ${when(wettest.date)}`}
        {stirs ? `, so rain may stir up clarity ${when(stirs.date)}.` : '.'}
      </Note>
    </DetailShell>
  )
}

// ---------------------------------------------------------------------------

const uvClass = (uv: number) =>
  uv >= 11 ? ['bg-[#7c4fd0]', 'Extreme'] : uv >= 8 ? ['bg-[#d95f43]', 'Very high'] : uv >= 6 ? ['bg-[#e9a660]', 'High'] : ['bg-unknown', 'Moderate or lower']

export function UvDetail({ days, today }: { days: DayFacts[]; today: string }) {
  const rows = days.map((d) => ({ date: d.date, peak: Math.round(Math.max(0, ...nn(daylight(d).map((h) => h.uv)))), early: Math.max(0, ...nn(d.hours.filter((h) => h.hour >= 6 && h.hour < 10).map((h) => h.uv))) }))
  const max = Math.max(11, ...rows.map((r) => r.peak))
  const allVeryHigh = rows.every((r) => r.peak >= 8)
  const earlyMax = Math.round(Math.max(...rows.map((r) => r.early)))
  return (
    <DetailShell title="Daily peak UV">
      <ol className="grid h-28 items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
        {rows.map((r) => (
          <li key={r.date} className="flex h-full flex-col items-center justify-end gap-1">
            <span className="font-mono text-[12px] font-bold">{Math.round(r.peak)}</span>
            <span className={`w-full rounded-[6px] ${uvClass(r.peak)[0]}`} style={{ height: `${Math.max(8, (r.peak / max) * 84)}px` }} />
          </li>
        ))}
      </ol>
      <DayAxis days={rows.map((r) => r.date)} today={today} />
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted" aria-hidden>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#e9a660]" />High 6–7</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#d95f43]" />Very high 8–10</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#7c4fd0]" />Extreme 11+</li>
      </ul>
      <Note>
        {allVeryHigh ? 'Very high every day this week.' : `Peaks range ${Math.round(Math.min(...rows.map((r) => r.peak)))}–${Math.round(Math.max(...rows.map((r) => r.peak)))} this week.`} Before 10 AM it stays at {earlyMax} or below.
      </Note>
    </DetailShell>
  )
}

// ---------------------------------------------------------------------------

export function WaterTempDetail({ days, today }: { days: DayFacts[]; today: string }) {
  const rows = days.map((d) => ({ date: d.date, t: mean(nn(daylight(d).map((h) => h.seaF))) }))
  const vals = nn(rows.map((r) => r.t))
  if (!vals.length) return <DetailShell title="Sea surface temp"><p className="text-sm text-muted">Not available.</p></DetailShell>
  const lo = Math.floor(Math.min(...vals) - 1)
  const hi = Math.ceil(Math.max(...vals) + 1)
  const W = 300
  const H = 70
  const x = (i: number) => 8 + (i / Math.max(1, rows.length - 1)) * (W - 16)
  const y = (t: number) => 8 + (1 - (t - lo) / (hi - lo)) * (H - 16)
  const pts = rows.map((r, i) => (r.t === null ? null : { x: x(i), y: y(r.t) })).filter((p): p is { x: number; y: number } => p !== null)
  const minV = Math.min(...vals)
  const maxV = Math.max(...vals)
  return (
    <DetailShell title="Sea surface temp" aside={`${lo} – ${hi} °F scale`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Sea temperature ${minV.toFixed(1)} to ${maxV.toFixed(1)} °F this week`}>
        <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} fill="none" stroke="#2e5d77" strokeWidth="2.4" strokeLinecap="round" />
        {pts[0] ? <circle cx={pts[0].x} cy={pts[0].y} r="5" fill="var(--now)" stroke="var(--foreground)" strokeWidth="1.5" /> : null}
      </svg>
      <DayAxis days={rows.map((r) => r.date)} today={today} values={rows.map((r) => (r.t === null ? '—' : r.t.toFixed(1)))} />
      <Note>
        {maxV - minV < 1.5 ? `Barely moves: ${minV.toFixed(1)} – ${maxV.toFixed(1)} °F.` : `Ranges ${minV.toFixed(1)} – ${maxV.toFixed(1)} °F this week.`} {wearFor(minV)} all week.
      </Note>
    </DetailShell>
  )
}

// ---------------------------------------------------------------------------

export function AdvisoriesDetail({
  days,
  today,
  current,
  history,
}: {
  days: DayFacts[]
  today: string
  /** "clear", "in effect" or "unknown" right now. */
  current: 'clear' | 'in effect' | 'unknown'
  history: HistoryDay[] | null
}) {
  const ahead = days.map((d, i) => ({ date: d.date, state: i <= 1 ? current : ('not issued' as const) }))
  const counted = history?.filter((h) => h.nws.length || h.doh.length) ?? []
  return (
    <DetailShell title="Ahead · from issued forecasts">
      <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${ahead.length}, minmax(0, 1fr))` }}>
        {ahead.map((a) => (
          <li
            key={a.date}
            className={`rounded-xl px-1 py-2 text-center leading-tight ${a.state === 'clear' ? 'bg-go-tint text-go-ink' : a.state === 'in effect' ? 'bg-skip-tint text-skip-ink' : 'ring-1 ring-border text-muted'}`}
          >
            <span className="block font-mono text-[11px] font-bold">{short(a.date, today)}</span>
            <span className="block text-[12px] font-semibold">{a.state === 'clear' ? 'Clear' : a.state === 'in effect' ? 'In effect' : a.state === 'unknown' ? 'Unknown' : 'Not issued'}</span>
          </li>
        ))}
      </ol>
      <Note>The Weather Service issues surf advisories 1–2 days ahead, so later days stay &ldquo;not issued&rdquo; rather than clear.</Note>
      <div className="mt-4 border-t border-border pt-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] font-bold text-foreground/70">Last 30 days</p>
        {history ? (
          <>
            <ol className="mt-2 grid grid-cols-15 gap-1" style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}>
              {history.map((h) => (
                <li
                  key={h.date}
                  title={`${h.date}: ${[...h.nws, ...h.doh].join(', ') || 'none'}`}
                  className={`aspect-square rounded-[4px] ${h.date === today ? 'bg-go-ink' : h.doh.length ? 'bg-skip' : h.nws.length ? 'bg-now' : 'bg-go-tint'}`}
                />
              ))}
            </ol>
            <p className="mt-2 font-mono text-[11px] text-muted">
              {MONTHS[Number(history[0].date.slice(5, 7)) - 1]} {Number(history[0].date.slice(8))} → today ·{' '}
              {counted.length === 0
                ? 'no advisories near Black Point'
                : `${counted.length} day${counted.length === 1 ? '' : 's'} with an advisory (amber: Weather Service, coral: Health Dept.)`}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[13px] text-muted">Couldn&rsquo;t load the history right now.</p>
        )}
      </div>
    </DetailShell>
  )
}

// ---------------------------------------------------------------------------

export function JellyDetail({ today }: { today: string }) {
  const windows = jellyWindowsFrom(addDays(today, -30), 4)
  const prev = [...windows].reverse().find((w) => w.end < today) ?? null
  const next = windows.find((w) => w.end >= today) ?? null
  const first = prev ? prev.start : today
  const last = next ? next.end : addDays(today, 30)
  // Monday-start weeks from the earlier window to the later.
  const start = addDays(first, -((dow(first) + 6) % 7))
  const end = addDays(last, (7 - dow(last)) % 7)
  const cells: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) cells.push(d)
  const moons = fullMoonsBetween(Date.parse(`${start}T00:00:00Z`), Date.parse(`${end}T23:59:59Z`)).map((ms) => new Date(ms - 10 * 3_600_000).toISOString().slice(0, 10))
  const inWindow = (d: string) => [prev, next].some((w) => w && d >= w.start && d <= w.end)
  const nextMoon = moons.find((m) => m <= (next?.start ?? last) && m >= addDays(next?.start ?? last, -12))
  const fmt = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8))}`
  return (
    <DetailShell title="Moon calendar" aside={`${fmt(start)} – ${fmt(end)}`}>
      <ol className="grid grid-cols-7 gap-1.5 text-center">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <li key={i} className="font-mono text-[10px] font-bold text-muted">
            {d}
          </li>
        ))}
        {cells.map((d) => {
          const jelly = inWindow(d)
          const past = d < today
          const isFirst = d.slice(8) === '01'
          return (
            <li
              key={d}
              className={`flex aspect-square flex-col items-center justify-center rounded-xl text-[13px] font-semibold leading-none ${
                jelly ? (past ? 'bg-[#d9cdf3] text-[#5b3fa6]' : 'bg-[#7c4fd0] text-white') : 'bg-surface'
              } ${d === today ? 'ring-2 ring-foreground' : ''} ${past && !jelly ? 'text-muted' : ''}`}
            >
              <span className="font-mono">{isFirst ? MONTHS[Number(d.slice(5, 7)) - 1] : Number(d.slice(8))}</span>
              {jelly ? <span className="mt-0.5 text-[8px] font-normal">jelly</span> : moons.includes(d) ? <span className="mt-0.5 text-[9px]">○</span> : null}
            </li>
          )
        })}
      </ol>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted" aria-hidden>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#7c4fd0]" />Jellyfish window</li>
        <li>○ Full moon</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] ring-2 ring-foreground" />Today</li>
      </ul>
      <Note>
        They arrive on south shores about 8–10 days after a full moon.
        {nextMoon && next ? ` Full moon ${fmt(nextMoon)} → window ${fmt(next.start)} – ${Number(next.end.slice(8))}.` : ''}
      </Note>
    </DetailShell>
  )
}

// ---------------------------------------------------------------------------

const TOKEN_KEYS = ['covecheck.ownerToken', 'covecheck.calibrationToken']

export function ClosuresDetail({ days, today, lastChecked }: { days: DayFacts[]; today: string; lastChecked: string | null }) {
  const [checked, setChecked] = useState(lastChecked)
  const [message, setMessage] = useState<string | null>(null)

  async function checkToday() {
    let token = ''
    for (const k of TOKEN_KEYS) {
      try {
        token ||= window.localStorage.getItem(k) ?? window.sessionStorage.getItem(k) ?? ''
      } catch {
        /* ignore */
      }
    }
    if (!token) {
      token = window.prompt('Owner token (your calibration token) to record a check:')?.trim() ?? ''
      if (!token) return
    }
    const res = await fetch('/api/closures', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      try {
        window.localStorage.setItem('covecheck.ownerToken', token)
      } catch {
        /* ignore */
      }
      const body = (await res.json()) as { lastChecked: string }
      setChecked(body.lastChecked)
      setMessage('Recorded. It counts for today and the next two days.')
    } else if (res.status === 401) {
      try {
        window.localStorage.removeItem('covecheck.ownerToken')
      } catch {
        /* ignore */
      }
      setMessage('That token wasn’t accepted.')
    } else setMessage('Couldn’t record the check. Try again.')
  }

  return (
    <DetailShell title="Checked by hand">
      <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d) => {
          const ok = coveredByCheck(checked, d.date)
          return (
            <li key={d.date} className={`rounded-xl px-0.5 py-2 text-center leading-tight ${ok ? 'bg-go-tint text-go-ink' : 'ring-1 ring-border text-muted'}`}>
              <span className="block font-mono text-[11px] font-bold text-foreground">{short(d.date, today)}</span>
              <span className="block text-[11px] font-semibold">{ok ? 'Checked' : 'Unknown'}</span>
            </li>
          )
        })}
      </ol>
      <Note>
        No live feed covers Black Point, so this only knows what you tell it. A check counts for {CHECK_VALID_DAYS} days, then goes back to unknown.
      </Note>
      <button type="button" onClick={() => void checkToday()} className="mt-3 w-full rounded-xl bg-hero px-4 py-3 text-sm font-semibold text-hero-ink">
        I checked today — no closures
      </button>
      {message ? <p className="mt-2 text-[12px] text-muted" role="status">{message}</p> : null}
    </DetailShell>
  )
}

// ---------------------------------------------------------------------------

export function SwellDetail({ days, today }: { days: DayFacts[]; today: string }) {
  const rows = days.map((d) => {
    const hrs = daylight(d).filter((h) => h.swellEnergy !== null)
    const top = hrs.reduce<(typeof hrs)[number] | null>((a, b) => (!a || b.swellEnergy! > a.swellEnergy! ? b : a), null)
    return { date: d.date, ft: top?.swellFt ?? null, period: top?.swellPeriodSec ?? null, energy: top?.swellEnergy ?? null }
  })
  const max = Math.max(1, ...nn(rows.map((r) => r.energy)))
  return (
    <DetailShell title="Swell this week" aside="peak energy each day">
      <ol className="grid h-28 items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
        {rows.map((r) => (
          <li key={r.date} className="flex h-full flex-col items-center justify-end gap-1">
            <span className="font-mono text-[10px] font-bold">{r.ft === null ? '—' : Number(r.ft.toFixed(1))}</span>
            <span className={`w-full rounded-[6px] ${r.date === today ? 'bg-go' : 'bg-go-strong'}`} style={{ height: `${r.energy === null ? 4 : Math.max(8, (r.energy / max) * 80)}px` }} />
            <span className="font-mono text-[9px] text-muted">{r.period ? `${Math.round(r.period)}s` : ''}</span>
          </li>
        ))}
      </ol>
      <DayAxis days={rows.map((r) => r.date)} today={today} />
      <Note>Bar height is swell energy (height² × period); the number is the height and the small figure its period.</Note>
    </DetailShell>
  )
}

export function HourlyDetail({
  title,
  day,
  value,
  unit,
  note,
  digits = 1,
}: {
  digits?: number
  title: string
  day: DayFacts
  value: (h: DayFacts['hours'][number]) => number | null
  unit: string
  note: string
}) {
  const hrs = daylight(day)
  const vals = hrs.map(value)
  const max = Math.max(1, ...nn(vals))
  return (
    <DetailShell title={title} aside={unit}>
      <ol className="grid h-24 items-end gap-[3px]" style={{ gridTemplateColumns: `repeat(${hrs.length}, minmax(0, 1fr))` }}>
        {hrs.map((h, i) => (
          <li key={h.timestamp} className="flex h-full flex-col items-center justify-end gap-0.5">
            <span className="font-mono text-[8px]">{vals[i] === null ? '' : Number(vals[i]!.toFixed(digits))}</span>
            <span className="w-full rounded-t-[3px] bg-[#9fb3c2]" style={{ height: `${vals[i] === null ? 2 : Math.max(3, (vals[i]! / max) * 70)}px` }} />
          </li>
        ))}
      </ol>
      <ol className="mt-1 grid gap-[3px] text-center font-mono text-[8px] text-muted" style={{ gridTemplateColumns: `repeat(${hrs.length}, minmax(0, 1fr))` }} aria-hidden>
        {hrs.map((h) => (
          <li key={h.timestamp}>{h.hour % 3 === 0 ? formatHour(h.hour).replace(' ', '').toLowerCase().replace('am', 'a').replace('pm', 'p') : ''}</li>
        ))}
      </ol>
      <Note>{note}</Note>
    </DetailShell>
  )
}
