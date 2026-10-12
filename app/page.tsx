import { existsSync } from 'node:fs'
import { join } from 'node:path'
import Image from 'next/image'
import { Suspense } from 'react'
import { ConditionsApp } from '@/components/conditions-app'
import { CROMWELLS } from '@/lib/beach/cromwells'
import { getBeachReport } from '@/lib/forecast'
import { SPOT_GUIDE } from '@/lib/beach/spot-guide'
import { readLastChecked } from '@/lib/beach/closure-checks'
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
  const closuresLastChecked = await readLastChecked()
  const lrDays = lr ? longRangeDays(lr, CROMWELLS.exposedSwellDirections) : []
  // Same day, two models: list the days where they disagree enough to notice.
  const modelGaps = days.flatMap((d) => {
    const tiles = Math.max(0, ...d.hours.filter((h) => h.hour >= 6 && h.hour <= 18).map((h) => h.swellFt ?? 0))
    const timeline = lrDays.find((x) => x.date === d.date)?.swellFt ?? null
    if (timeline === null || tiles === 0) return []
    const gap = Math.abs(tiles - timeline)
    return gap >= 0.5 && gap / Math.max(tiles, timeline) >= 0.2 ? [{ date: d.date, tilesFt: Math.round(tiles * 10) / 10, timelineFt: timeline }] : []
  })
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
      hasSpotImage={existsSync(join(process.cwd(), 'public', SPOT_GUIDE.image.src))}
      // The timeline shows 10 days; choose its swells from those 10 days only.
      trains={lr ? swellTrains(lr.times.slice(0, 240), lr.partitions.slice(0, 240), CROMWELLS.exposedSwellDirections) : []}
      longRange={lrDays.filter((d) => d.date > (days[days.length - 1]?.date ?? ''))}
      modelGaps={modelGaps}
      advisoryHistory={report.advisoryHistory}
      closuresLastChecked={closuresLastChecked}
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
    <main className="mx-auto w-full max-w-md px-3.5 pt-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-hero">
            <Image src="/brand/covecheck-mark.png" alt="" width={256} height={256} priority className="h-6 w-6" />
          </span>
          <span className="font-display text-[1.6rem] font-extrabold leading-none">CoveCheck</span>
        </span>
        <span className="flex items-center gap-3">
          {/* The Raw switch is rendered here by the conditions view. */}
          <span id="header-actions" />
          {/* One beach today. A picker replaces this pill once there are more. */}
          <span className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold">Cromwell&rsquo;s</span>
        </span>
      </header>

      <Suspense fallback={<ReportSkeleton />}>
        <Report />
      </Suspense>
    </main>
  )
}
