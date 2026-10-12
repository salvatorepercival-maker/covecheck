import Image from 'next/image'
import { Suspense } from 'react'
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

async function Report() {
  const report = await getBeachReport(CROMWELLS)
  return <ReportView report={report} profile={CROMWELLS} />
}

function ReportSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading the forecast for Cromwell&rsquo;s Beach</p>
      <div className="h-64 rounded-3xl bg-surface-sunk" />
      <div className="h-72 rounded-2xl bg-surface" />
      <div className="h-48 rounded-2xl bg-surface" />
    </div>
  )
}

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-5">
      <header className="mb-5 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Image src="/brand/covecheck-mark.png" alt="" width={256} height={256} priority className="h-7 w-7" />
          <span className="text-[17px] font-bold tracking-tight">CoveCheck</span>
        </span>
        {/* One beach today. A picker replaces this pill once there are more. */}
        <h1 className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium">
          Cromwell&rsquo;s
        </h1>
      </header>

      <Suspense fallback={<ReportSkeleton />}>
        <Report />
      </Suspense>
    </main>
  )
}
