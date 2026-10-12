'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/**
 * "What was the water like?" — a 20-second visit report.
 *
 * The server matches it to the forecast for the hour given and stores both.
 * Spam protection: a hidden honeypot field and time-on-form, plus a server-side
 * rate limit.
 */

type Option<T extends string> = { value: T; label: string; sub?: string; swatch?: string }

const ACTIVITY: Option<'snorkel' | 'dive' | 'surf' | 'swim'>[] = [
  { value: 'snorkel', label: 'Snorkel' },
  { value: 'dive', label: 'Dive' },
  { value: 'surf', label: 'Surf' },
  { value: 'swim', label: 'Swim / beach' },
]
const VISIBILITY: Option<'<10' | '10-20' | '20-30' | '30+'>[] = [
  { value: '<10', label: '<10 ft', sub: 'Murky', swatch: '#9a9e7c' },
  { value: '10-20', label: '10–20', sub: 'Hazy', swatch: '#8fb0ae' },
  { value: '20-30', label: '20–30', sub: 'Clear', swatch: '#5ea3c4' },
  { value: '30+', label: '30+ ft', sub: 'Glassy', swatch: '#2f6fae' },
]
const SURGE: Option<'calm' | 'some' | 'strong'>[] = [
  { value: 'calm', label: 'Calm' },
  { value: 'some', label: 'Some' },
  { value: 'strong', label: 'Strong' },
]
const AGAIN: Option<'yes' | 'maybe' | 'no'>[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: 'No' },
]

const selected = 'border-[#15232d] bg-[#15232d] text-white dark:border-white dark:bg-white dark:text-[#15232d]'
const idle = 'border-border bg-surface hover:bg-surface-sunk'

function Choice<T extends string>({
  legend,
  options,
  value,
  onChange,
  layout,
}: {
  legend: string
  options: Option<T>[]
  value: T | null
  onChange: (value: T) => void
  layout: 'pills' | 'grid'
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{legend}</legend>
      <div className={layout === 'pills' ? 'mt-2 flex flex-wrap gap-2' : 'mt-2 grid gap-2'} style={layout === 'grid' ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}>
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer flex-col items-center justify-center border text-sm font-medium transition-colors ${
              layout === 'pills' ? 'rounded-full px-4 py-2' : 'rounded-xl px-2 py-2.5'
            } ${value === o.value ? selected : idle}`}
          >
            <input type="radio" className="sr-only" name={legend} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.swatch ? <span className="mb-1 h-1.5 w-7 rounded-full" style={{ background: o.swatch }} aria-hidden /> : null}
            <span>{o.label}</span>
            {o.sub ? <span className={`text-[10px] ${value === o.value ? 'opacity-80' : 'text-muted'}`}>{o.sub}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function hourLabel(hour: number) {
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve} ${hour < 12 ? 'AM' : 'PM'}`
}

export function ReportForm({ beachName }: { beachName: string }) {
  const opened = useRef(0)
  const [activity, setActivity] = useState<(typeof ACTIVITY)[number]['value'] | null>('snorkel')
  const [visibility, setVisibility] = useState<(typeof VISIBILITY)[number]['value'] | null>(null)
  const [surge, setSurge] = useState<(typeof SURGE)[number]['value'] | null>(null)
  const [again, setAgain] = useState<(typeof AGAIN)[number]['value'] | null>(null)
  const [note, setNote] = useState('')
  const [hour, setHour] = useState(9)
  const [website, setWebsite] = useState('')
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' } | { kind: 'error'; message: string }>({ kind: 'idle' })

  useEffect(() => {
    opened.current = Date.now()
    // Default the time to the current Hawaiʻi hour, within the 5 AM–8 PM range.
    const hst = new Date(Date.now() - 10 * 3_600_000).getUTCHours()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time default from the clock
    setHour(Math.min(20, Math.max(5, hst)))
  }, [])

  const complete = activity && visibility && surge && again

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!complete) {
      setState({ kind: 'error', message: 'Please answer each question.' })
      return
    }
    setState({ kind: 'sending' })
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity, visibility, surge, again, note, hour, website, elapsedMs: Date.now() - opened.current }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (res.ok && body.ok) setState({ kind: 'sent' })
      else setState({ kind: 'error', message: body.error ?? 'Something went wrong. Please try again.' })
    } catch {
      setState({ kind: 'error', message: 'Couldn’t reach CoveCheck. Check your connection and try again.' })
    }
  }

  const header = (
    <div className="flex items-center gap-3">
      <Link href="/" aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="m15 6-6 6 6 6" />
        </svg>
      </Link>
      <span className="text-sm text-muted">{beachName} · today</span>
    </div>
  )

  if (state.kind === 'sent') {
    return (
      <div className="space-y-5">
        {header}
        <section className="rounded-3xl bg-surface p-6">
          <h1 className="text-2xl font-bold tracking-tight">Thanks — logged.</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            We&rsquo;ve matched your report to the forecast for {hourLabel(hour)}. Reports like yours are how CoveCheck learns what the
            numbers really mean at this beach.
          </p>
          <Link href="/" className="mt-5 block rounded-xl bg-[#15232d] px-4 py-3 text-center text-sm font-semibold text-white dark:bg-white dark:text-[#15232d]">
            Back to conditions
          </Link>
        </section>
      </div>
    )
  }

  return (
    <form onSubmit={send} className="space-y-6" noValidate>
      {header}
      <div>
        <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight">What was the water like?</h1>
        <p className="mt-1 text-sm text-muted">Takes 20 seconds. We match it to the forecast at the time you were there.</p>
      </div>

      <Choice legend="What did you do?" options={ACTIVITY} value={activity} onChange={setActivity} layout="pills" />
      <Choice legend="How far could you see underwater?" options={VISIBILITY} value={visibility} onChange={setVisibility} layout="grid" />
      <Choice legend="Surge and waves at the entry" options={SURGE} value={surge} onChange={setSurge} layout="grid" />
      <Choice legend="Would you go again in these conditions?" options={AGAIN} value={again} onChange={setAgain} layout="grid" />

      <label className="block">
        <span className="text-sm font-semibold">Anything else? (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 500))}
          rows={3}
          placeholder="Jellyfish, brown water, turtles, crowded…"
          className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold">When were you in the water?</span>
        <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          {Array.from({ length: 16 }, (_, i) => i + 5).map((h) => (
            <option key={h} value={h}>
              Around {hourLabel(h)}
            </option>
          ))}
        </select>
      </label>

      {/* Honeypot: off-screen and skipped by keyboard and screen readers. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {state.kind === 'error' ? (
        <p role="alert" className="rounded-xl bg-skip-tint px-4 py-3 text-sm text-skip-ink">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={state.kind === 'sending'}
        className="w-full rounded-xl bg-[#15232d] px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-[#15232d]"
      >
        {state.kind === 'sending' ? 'Sending…' : 'Send report'}
      </button>
    </form>
  )
}
