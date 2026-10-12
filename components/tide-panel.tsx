'use client'

import { useState } from 'react'
import { bandOfTide, daylightLows, durationText, minutesOf, mixedTideNote, namedExtremes, type Bands } from '@/lib/conditions/tide-panel'
import type { DayFacts } from '@/lib/facts'
import { formatClockTime } from '@/lib/format'

/**
 * The whole day's tide, midnight to midnight: both highs and both lows, the low
 * and high bands the lenses use, night, and now. Tap the chart to read any hour.
 */

const W = 360
const H = 150
const DAY_MIN = 1440
const x = (min: number) => (min / DAY_MIN) * W
const AXIS = [0, 3, 6, 9, 12, 15, 18, 21, 24]
const tickLabel = (h: number) => (h % 24 === 0 ? '12a' : h === 12 ? '12p' : `${h % 12}${h < 12 ? 'a' : 'p'}`)
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const shortTime = (t: string) => t.replace(':00', '').replace(' AM', 'a').replace(' PM', 'p')

export function TidePanel({
  day,
  nextMidnightFt,
  week,
  nowMinutes,
  bands,
  best,
}: {
  day: DayFacts
  /** Tide at the following midnight, to close the curve. */
  nextMidnightFt: number | null
  week: DayFacts[]
  /** Minutes past midnight when the day on screen is today; else null. */
  nowMinutes: number | null
  bands: Bands
  /** Best hours from the active lens, if any. */
  best: { start: number; end: number } | null
}) {
  const [picked, setPicked] = useState<number | null>(null)

  // The classic tide curve: cosine between consecutive turns (NOAA's highs and
  // lows), using the neighbouring days' turns so the edges are right too. Falls
  // back to the hourly heights when there are too few turns.
  const dayStart = Date.parse(`${day.date}T00:00:00-10:00`)
  const turns = week
    .flatMap((d) => d.tideExtremes)
    .map((e) => ({ min: (Date.parse(`${e.timestamp.replace(' ', 'T').slice(0, 16)}:00-10:00`) - dayStart) / 60_000, ft: e.heightFt, kind: e.kind, timestamp: e.timestamp }))
    .sort((a, b) => a.min - b.min)
  const covered = turns.some((t) => t.min <= 0) && turns.some((t) => t.min >= DAY_MIN)
  const cosineAt = (min: number) => {
    const i = turns.findIndex((t) => t.min >= min)
    if (i <= 0) return turns[Math.max(0, i)].ft
    const a = turns[i - 1]
    const b = turns[i]
    return a.ft + ((b.ft - a.ft) * (1 - Math.cos((Math.PI * (min - a.min)) / (b.min - a.min)))) / 2
  }
  const hourly = [
    ...day.hours.filter((h) => h.tideFt !== null).map((h) => ({ min: h.hour * 60, ft: h.tideFt! })),
    ...(nextMidnightFt !== null ? [{ min: DAY_MIN, ft: nextMidnightFt }] : []),
  ]
  const pts = covered
    ? Array.from({ length: DAY_MIN / 10 + 1 }, (_, i) => ({ min: i * 10, ft: cosineAt(i * 10) }))
    : hourly
  if (pts.length < 2) return null

  const values = [...pts.map((p) => p.ft), bands.lowFt, bands.highFt]
  const lo = Math.min(...values) - 0.3
  const hi = Math.max(...values) + 0.3
  const y = (ft: number) => 10 + (1 - (ft - lo) / (hi - lo)) * (H - 20)
  const pathOf = (ps: { min: number; ft: number }[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${x(p.min).toFixed(1)},${y(p.ft).toFixed(1)}`).join(' ')
  // Earlier today is drawn dashed; from now on, solid.
  const earlierPath = nowMinutes !== null ? pathOf(pts.filter((p) => p.min <= nowMinutes)) : null
  const path = pathOf(nowMinutes !== null ? pts.filter((p) => p.min >= nowMinutes - 10) : pts)
  const heightAt = (min: number) => {
    if (covered) return cosineAt(min)
    const after = pts.findIndex((p) => p.min >= min)
    if (after <= 0) return pts[Math.max(0, after)].ft
    const a = pts[after - 1]
    const b = pts[after]
    return a.ft + ((b.ft - a.ft) * (min - a.min)) / (b.min - a.min)
  }

  const readMin = picked ?? nowMinutes
  const readFt = readMin !== null ? heightAt(readMin) : null
  const rising = readMin !== null ? heightAt(Math.min(DAY_MIN, readMin + 20)) > heightAt(Math.max(0, readMin - 20)) : null
  const readLabel =
    readMin === null
      ? null
      : `${picked !== null ? 'At' : 'Now'} · ${formatClockTime(`${day.date}T${String(Math.floor(readMin / 60) % 24).padStart(2, '0')}:${String(Math.round(readMin % 60)).padStart(2, '0')}`)}`

  // Where the reading sits between the last turn and the next.
  const prevTurn = readMin !== null ? [...turns].reverse().find((t) => t.min <= readMin) ?? null : null
  const nextTurn = readMin !== null ? turns.find((t) => t.min > readMin) ?? null : null
  const progress = prevTurn && nextTurn && readMin !== null ? (readMin - prevTurn.min) / (nextTurn.min - prevTurn.min) : null
  const turnTime = (t: { timestamp: string }) => formatClockTime(t.timestamp)
  const counts = { high: day.tideExtremes.filter((e) => e.kind === 'high').length, low: day.tideExtremes.filter((e) => e.kind === 'low').length }
  const word = (n: number) => ['No', 'One', 'Two', 'Three', 'Four'][n] ?? String(n)
  const title = `${word(counts.high)} high${counts.high === 1 ? '' : 's'}, ${word(counts.low).toLowerCase()} low${counts.low === 1 ? '' : 's'}`
  const [, mo, dd] = day.date.split('-').map(Number)
  const eyebrow = `${DAYS[new Date(`${day.date}T00:00:00Z`).getUTCDay()]} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mo - 1]} ${dd} · Tides`
  const readTime = readMin !== null ? readLabel!.replace(/^(Now|At) · /, '') : null
  const arrow = rising ? '↑' : '↓'

  const named = namedExtremes(day, nowMinutes)
  const lows = daylightLows(week)

  return (
    <section aria-labelledby="tide-panel-heading" className="rounded-[22px] bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{eyebrow}</p>
      <h2 id="tide-panel-heading" className="mt-1 font-display text-[2rem] font-extrabold leading-none">
        {title}
      </h2>

      {readFt !== null ? (
        <div className="mt-3 rounded-2xl bg-hero px-4 py-3 text-hero-ink" aria-live="polite">
          <div className="flex items-center justify-between gap-3 font-mono text-[11px]">
            <span className="flex items-center gap-2 font-bold uppercase tracking-[0.1em] text-now">
              <span className="relative flex h-3.5 w-3.5 items-center justify-center" aria-hidden>
                {picked === null ? <span className="tide-pulse absolute inset-0 rounded-full bg-now/50" /> : null}
                <span className="relative h-2.5 w-2.5 rounded-full bg-now" />
              </span>
              {picked !== null ? 'At' : 'Now'} · {readTime}
            </span>
            <span className="text-hero-ink/70">{bandOfTide(readFt, bands)}</span>
          </div>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[2rem] font-bold leading-none">{readFt.toFixed(1)} ft</span>
            <span className="text-[15px] text-hero-ink/85">
              {arrow} {rising ? 'rising' : 'falling'}
            </span>
          </p>
          {progress !== null ? (
            <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden>
              <span className="block h-full rounded-full bg-now" style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
            </span>
          ) : null}
          {prevTurn && nextTurn && readMin !== null ? (
            <div className="mt-2 flex justify-between gap-3 font-mono text-[11px]">
              <span className="text-hero-ink/70">
                {prevTurn.kind === 'high' ? 'High' : 'Low'} {turnTime(prevTurn)}
              </span>
              <span className="font-bold">
                {nextTurn.kind === 'high' ? 'High' : 'Low'} {nextTurn.ft.toFixed(1)} ft in {durationText(Math.round(nextTurn.min - readMin))}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="relative mt-3 -mx-1">
        {readMin !== null && readFt !== null ? (
          <div className="relative mb-1 h-7" aria-hidden>
            <span
              className="absolute top-0 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-hero px-2.5 py-1 font-mono text-[10px] font-bold text-hero-ink"
              style={{ left: `${Math.min(80, Math.max(20, (readMin / DAY_MIN) * 100))}%` }}
            >
              <span className="h-2 w-2 rounded-full bg-now" />
              {picked !== null ? 'AT' : 'NOW'} {readTime} · {readFt.toFixed(1)} ft {arrow}
            </span>
          </div>
        ) : null}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full cursor-crosshair"
          role="img"
          aria-label="Tide from midnight to midnight. Tap to read any hour."
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setPicked(Math.round(((e.clientX - r.left) / r.width) * DAY_MIN))
          }}
        >
          {/* Bands */}
          <rect x="0" width={W} y="0" height={y(bands.highFt)} fill="var(--skip-tint)" opacity="0.6" />
          <rect x="0" width={W} y={y(bands.lowFt)} height={H - y(bands.lowFt)} fill="var(--go-tint)" />
          {/* Night */}
          {day.sunrise !== null ? <rect x="0" width={x(day.sunrise)} y="0" height={H} fill="var(--foreground)" opacity="0.07" /> : null}
          {day.sunset !== null ? <rect x={x(day.sunset)} width={W - x(day.sunset)} y="0" height={H} fill="var(--foreground)" opacity="0.07" /> : null}
          {earlierPath ? <path d={earlierPath} fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" /> : null}
          <path d={path} fill="none" stroke="var(--foreground)" strokeWidth="2.4" strokeLinecap="round" />
          {readMin !== null ? (
            <g>
              <line x1={x(readMin)} x2={x(readMin)} y1="0" y2={H} stroke="var(--foreground)" strokeWidth="1.6" />
              {picked === null ? <circle className="tide-pulse" cx={x(readMin)} cy={y(heightAt(readMin))} r="11" fill="var(--now)" opacity="0.35" /> : null}
              <circle cx={x(readMin)} cy={y(heightAt(readMin))} r="6" fill="var(--now)" stroke="var(--foreground)" strokeWidth="2" />
            </g>
          ) : null}
          {day.tideExtremes.map((e) => {
            const cx = x(minutesOf(e.timestamp))
            const cy = y(e.heightFt)
            const high = e.kind === 'high'
            return (
              <g key={e.timestamp}>
                <rect x={cx - 8} y={cy - 8} width="16" height="16" rx="4" fill={high ? 'var(--report)' : 'var(--go)'} stroke="var(--surface)" strokeWidth="1.5" />
                <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" fontFamily="var(--font-mono-face)">
                  {high ? 'H' : 'L'}
                </text>
              </g>
            )
          })}
        </svg>
        <div className="flex justify-between px-1 font-mono text-[9px] text-muted" aria-hidden>
          {AXIS.map((h) => (
            <span key={h}>{tickLabel(h)}</span>
          ))}
        </div>
        {best ? (
          <div className="relative mt-1.5 h-5">
            <span
              className="absolute -translate-x-1/2 rounded-full bg-hero px-2 py-0.5 font-mono text-[10px] font-bold text-hero-ink"
              style={{ left: `${(((best.start + best.end + 1) / 2) * 60 * 100) / DAY_MIN}%` }}
            >
              BEST {tickLabel(best.start).toUpperCase()}–{tickLabel(best.end + 1).toUpperCase()}
            </span>
          </div>
        ) : null}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted" aria-hidden>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-go-tint" />Low band</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-skip-tint" />High band</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-foreground/10" />Night</li>
        <li className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-muted" />Earlier</li>
      </ul>

      <ul className="mt-3 grid grid-cols-2 gap-2">
        {named.map((e) => {
          const next = e.when === 'next'
          const past = e.when === 'earlier'
          const high = e.kind === 'high'
          return (
            <li key={e.timestamp} className={`rounded-2xl p-3 ${next ? 'bg-hero text-hero-ink' : 'bg-surface ring-1 ring-border'} ${past ? 'opacity-55' : ''}`}>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                <span className={`flex h-4 w-4 items-center justify-center rounded-[4px] font-mono text-[9px] text-white ${high ? 'bg-report' : 'bg-go'}`}>
                  {high ? 'H' : 'L'}
                </span>
                {e.name}
              </p>
              <p className="mt-1 font-mono text-[1.35rem] font-bold">{formatClockTime(e.timestamp)}</p>
              <p className={`text-[12px] ${next ? 'text-hero-ink/75' : 'text-muted'}`}>
                {e.heightFt.toFixed(1)} ft ·{' '}
                {e.when === 'next' && e.minutesAway !== null ? `Next · in ${durationText(e.minutesAway)}` : e.when === 'earlier' ? 'Earlier' : e.when === 'after dark' ? 'After dark' : 'Later'}
              </p>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 border-t border-border pt-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Daylight lows this week</p>
        <ol className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${lows.length}, minmax(0, 1fr))` }}>
          {lows.map((l) => {
            const [yy, mm, dd] = l.date.split('-').map(Number)
            const on = l.date === day.date
            return (
              <li key={l.date} className={`rounded-xl px-1 py-1.5 text-center ${on ? 'bg-hero text-hero-ink' : 'ring-1 ring-border'}`}>
                <span className="block text-[12px] font-bold">{DAYS[new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()]}</span>
                <span className="block font-mono text-[10px]">{l.time ? shortTime(l.time) : '—'}</span>
                <span className={`block font-mono text-[10px] ${on ? 'text-hero-ink/75' : 'text-muted'}`}>{l.heightFt !== null ? l.heightFt.toFixed(1) : ''}</span>
              </li>
            )
          })}
        </ol>
      </div>

      <p className="mt-3 text-[14px] leading-snug">
        {mixedTideNote(day, nowMinutes !== null)
          .split('mixed tides')
          .flatMap((part, i) => (i ? [<strong key={i}>mixed tides</strong>, part] : [part]))}{' '}
        Tap the chart to read any hour.
      </p>
    </section>
  )
}
