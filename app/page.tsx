import Image from 'next/image'
import { Suspense } from 'react'
import { Freshness } from '@/components/freshness'
import { ReportView } from '@/components/report-view'
import { CROMWELLS } from '@/lib/beach/cromwells'
import { getBeachReport } from '@/lib/forecast'

/**
 * Cromwell's beach screen.
 *
 * The branding and the shoreline framing are static and prerender into the
 * shell. The report reads the clock, so it defers to request time and streams in
 * behind a Suspense boundary — that way the page paints immediately instead of
 * blocking on six provider calls.
 */

/**
 * Freshness lives in the header, which is otherwise static.
 *
 * Given its own Suspense boundary so the branding and beach name still prerender
 * into the shell — only this stamp waits on the providers. `getBeachReport` is
 * request-memoized, so this shares one result with the report body below rather
 * than fetching again.
 */
async function HeaderFreshness() {
  const report = await getBeachReport(CROMWELLS)
  return (
    <Freshness
      updatedAtUtc={report.updatedAtUtc}
      nowIso={report.evaluation.evaluatedAtUtc}
      className="whitespace-nowrap"
    />
  )
}

async function Report() {
  const report = await getBeachReport(CROMWELLS)

  return (
    <ReportView
      report={report}
      profile={CROMWELLS}
      conditionsByTimestamp={report.conditionsByTimestamp}
      nowIso={report.evaluation.evaluatedAtUtc}
    />
  )
}

function ReportSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading the forecast for Cromwell&rsquo;s Beach</p>
      <div className="h-44 rounded-2xl border border-border bg-surface-sunk" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-[5.25rem] min-w-[4rem] flex-1 rounded-xl border border-border bg-surface-sunk" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-[6.5rem] rounded-xl border border-border bg-surface-sunk" />
        ))}
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-6">
      <header className="mb-5">
        {/*
         * The wordmark is deep navy, which all but disappears on the dark
         * background. Rather than recolour someone else's artwork, the lockup
         * sits on a light plaque in dark mode so the brand renders exactly as
         * supplied and stays legible in both themes.
         */}
        <span className="inline-flex rounded-lg dark:bg-white/95 dark:px-2.5 dark:py-1.5">
          <Image
            src="/brand/covecheck-logo.png"
            alt="CoveCheck"
            width={687}
            height={176}
            priority
            className="h-9 w-auto"
          />
        </span>
        {/* Beach name and freshness share a baseline row; the stamp is right-aligned
            and never wraps, so the name keeps the visual weight. */}
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{CROMWELLS.name}</h1>
          <Suspense fallback={null}>
            <HeaderFreshness />
          </Suspense>
        </div>
        <p className="mt-0.5 text-sm text-muted">Black Point, Honolulu · Know when the water is right</p>
      </header>

      <Suspense fallback={<ReportSkeleton />}>
        <Report />
      </Suspense>
    </main>
  )
}
