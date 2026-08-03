'use client'

import type { SurflineReport, SurflineSurfHour } from '@/lib/adapters/surfline'
import { formatClockTime } from '@/lib/format'
import { utcToHonoluluLocal } from '@/lib/time'

/**
 * Supplementary nearby surf report.
 *
 * Display only. These numbers describe a *different place* — a named surf break,
 * not this snorkelling cove — and they are deliberately kept out of CoveCheck's
 * verdict, its swell figure, and its confidence scoring. The card therefore sits
 * apart from the four condition cards and names its source, the break, and the
 * distance every time, so it can never be mistaken for Cromwell's own data.
 *
 * Renders nothing when unavailable or disabled. A missing nice-to-have should be
 * invisible, not an error message on a family's beach forecast.
 */

function hoursForDate(hours: readonly SurflineSurfHour[], date: string): SurflineSurfHour[] {
  return hours.filter((hour) => utcToHonoluluLocal(new Date(hour.timestampUtc)).startsWith(date))
}

export function NearbySurfCard({
  report,
  date,
}: {
  report: SurflineReport
  /** Honolulu-local date currently selected on the screen. */
  date: string
}) {
  if (report.status !== 'ok') return null

  const { spot } = report
  const today = hoursForDate(report.hours, date)
  if (today.length === 0) return null

  const minFt = Math.min(...today.map((hour) => hour.minFt))
  const maxFt = Math.max(...today.map((hour) => hour.maxFt))
  const described = today.find((hour) => hour.description)?.description ?? null

  return (
    <section
      aria-labelledby="nearby-surf-heading"
      className="rounded-xl border border-dashed border-border bg-surface-sunk p-4"
    >
      <h3 id="nearby-surf-heading" className="text-xs font-medium uppercase tracking-wide text-muted">
        Nearby surf report
      </h3>

      <p className="mt-2 text-base font-semibold leading-tight">
        {minFt === maxFt ? `${minFt} ft` : `${minFt}–${maxFt} ft`}
        {described ? <span className="ml-2 text-sm font-normal text-muted">{described}</span> : null}
      </p>

      <p className="mt-1 text-xs text-muted">
        Surfline · {spot.name} · ~{spot.distanceMiles.toFixed(1)} mi away
      </p>

      {/*
       * The honesty line. A number from a differently-exposed or distant break
       * looks authoritative unless the mismatch is stated plainly.
       */}
      {spot.likelyDifferentExposure ? (
        <p className="mt-2 text-xs leading-relaxed text-caution">
          This break sits on a different coast of Oahu and faces a different direction, so its surf
          is not comparable to conditions in this south-facing cove.
        </p>
      ) : spot.isDistant ? (
        <p className="mt-2 text-xs leading-relaxed text-caution">
          This break is on a different stretch of coast, so treat it as background context rather
          than a reading for this cove.
        </p>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          A nearby surf break, not this cove. Shown for context only — it does not affect
          CoveCheck&rsquo;s recommendation.
        </p>
      )}

      <p className="mt-1.5 text-[11px] text-muted/70">
        Surf forecast for {formatClockTime(utcToHonoluluLocal(new Date(today[0].timestampUtc)))} onward.
        Unofficial source, may be unavailable at times.
      </p>
    </section>
  )
}
