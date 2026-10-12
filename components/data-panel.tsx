'use client'

import { useState } from 'react'

/**
 * "Where this data comes from": every source's health and last update, and how
 * far the buoy sits from the forecast. Read from /api/status when opened.
 * Informational only — nothing here alerts anyone.
 */

type Status = {
  sources: { id: string; name: string; status: 'ok' | 'failed' | 'stale'; updatedUtc: string | null; detail?: string }[]
  buoy: null | { divergencePct: number | null; buoySwellFt: number | null; forecastSwellFt: number | null; inWindow: boolean; stale: boolean; observedUtc: string }
}

const ago = (iso: string | null) => {
  if (!iso) return 'never'
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 2) return 'just now'
  if (min < 90) return `${min} min ago`
  return `${Math.round(min / 60)} h ago`
}

const DOT = { ok: 'bg-go', stale: 'bg-close', failed: 'bg-skip' } as const
const WORD = { ok: 'OK', stale: 'Stale', failed: "Couldn't check" } as const

export function DataPanel() {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState(false)

  async function load() {
    if (status) return
    try {
      const res = await fetch('/api/status')
      if (!res.ok) throw new Error(String(res.status))
      setStatus((await res.json()) as Status)
    } catch {
      setError(true)
    }
  }

  return (
    <details className="rounded-2xl bg-surface p-4" onToggle={(e) => (e.currentTarget.open ? void load() : undefined)}>
      <summary className="cursor-pointer list-none text-sm font-semibold">Where this data comes from</summary>
      {error ? <p className="mt-3 text-sm text-muted">Couldn&rsquo;t load source status.</p> : null}
      {!status && !error ? <p className="mt-3 text-sm text-muted">Checking sources…</p> : null}
      {status ? (
        <div className="mt-3 space-y-3 text-sm">
          <ul className="space-y-2">
            {status.sources.map((s) => (
              <li key={s.id} className="flex items-start gap-2.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[s.status]}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block">{s.name}</span>
                  <span className="block text-xs text-muted">
                    {WORD[s.status]} · updated {ago(s.updatedUtc)}
                    {s.detail ? ` · ${s.detail}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {status.buoy ? (
            <p className="rounded-xl bg-surface-sunk px-3 py-2 text-xs text-muted">
              {status.buoy.stale
                ? 'The buoy has stopped reporting, so the forecast is not being checked against it.'
                : !status.buoy.inWindow
                  ? 'The buoy’s swell is coming from outside the cove’s window, so it isn’t compared.'
                  : status.buoy.divergencePct === null
                    ? 'Buoy and forecast can’t be compared right now.'
                    : `Buoy ${status.buoy.buoySwellFt} ft vs forecast ${status.buoy.forecastSwellFt?.toFixed(1)} ft (${status.buoy.divergencePct > 0 ? '+' : ''}${status.buoy.divergencePct}%). Big gaps lower the confidence chip and nudge the next 6 hours toward the buoy.`}
            </p>
          ) : null}
          <p className="text-[11px] leading-relaxed text-muted">
            Weather and marine data by Open-Meteo.com (CC BY 4.0). Tides, alerts and surf forecast: NOAA / National Weather
            Service. Buoy: NOAA National Data Buoy Center and CDIP, Scripps Institution of Oceanography, with PacIOOS. Water
            quality: Hawaiʻi Department of Health, Clean Water Branch.
          </p>
        </div>
      ) : null}
    </details>
  )
}
