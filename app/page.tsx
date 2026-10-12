import Image from 'next/image'
import { Suspense } from 'react'
import { ConditionsApp } from '@/components/conditions-app'
import { CROMWELLS } from '@/lib/beach/cromwells'
import { getBeachReport } from '@/lib/forecast'
import { buoyComparisonFor } from '@/lib/facts'
import { longRangeDays } from '@/lib/planning/long-range'
import { swellTrains } from '@/lib/planning/swell-trains'
import { dayFactsFor } from '@/lib/reports/snapshot'
import { formatClockTime } from '@/lib/format'
import { utcToHonoluluLocal } from '@/lib/time'

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
  const days = dayFactsFor(report, CROMWELLS)
  const lr = report.longRange.status === 'ok' ? report.longRange.data : null
  const tideBandUnset = CROMWELLS.calibration.some(
    (gap) => gap.status === 'unresolved' && gap.affectedThresholds.some((t) => t.toLowerCase().includes('tide')),
  )
  return (
    <ConditionsApp
      days={days}
      nowIso={report.evaluation.evaluatedAtUtc}
      updatedLabel={formatClockTime(utcToHonoluluLocal(new Date(report.updatedAtUtc)))}
      place="Black Point, Honolulu"
      shore={CROMWELLS.shoreAspect}
      tideBand={tideBandUnset ? null : CROMWELLS.thresholds.favorableTideFt}
      buoy={buoyComparisonFor(report, CROMWELLS)}
      // The timeline shows 10 days; choose its swells from those 10 days only.
      trains={lr ? swellTrains(lr.times.slice(0, 240), lr.partitions.slice(0, 240), CROMWELLS.exposedSwellDirections) : []}
      longRange={lr ? longRangeDays(lr, CROMWELLS.exposedSwellDirections).filter((d) => d.date > (days[days.length - 1]?.date ?? '')) : []}
    />
  )
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
        <span className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium">
          Cromwell&rsquo;s
        </span>
      </header>

      <Suspense fallback={<ReportSkeleton />}>
        <Report />
      </Suspense>
    </main>
  )
}
