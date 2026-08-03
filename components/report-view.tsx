'use client'

import { useState } from 'react'
import type { BeachReport } from '@/lib/forecast'
import { DEFAULT_USABLE_HOURS, SHORELINE_REMINDER, VERDICT_LABEL, type HourAssessment } from '@/lib/engine'
import { formatDayLabel, formatDayShort, formatUpdatedAgo, formatWindowRange } from '@/lib/format'
import { honoluluDateOf } from '@/lib/time'
import type { BeachProfile, HourlyBeachConditions } from '@/lib/types'
import { ConditionsGrid } from './conditions-grid'
import { HourlyTimeline } from './hourly-timeline'
import { TechnicalDetails } from './technical-details'
import { ConfidenceNote, VerdictIcon, VerdictPill, VERDICT_STYLE } from './verdict'

/**
 * The beach screen.
 *
 * Ordering follows the product's first principle — decision first, data second.
 * The verdict and the window come before any number, the four conditions follow,
 * and everything technical is behind a disclosure.
 */

export function ReportView({
  report,
  profile,
  conditionsByTimestamp,
  nowIso,
}: {
  report: BeachReport
  profile: BeachProfile
  /** Normalized inputs keyed by local timestamp, for the detail panels. */
  conditionsByTimestamp: Record<string, HourlyBeachConditions>
  nowIso: string
}) {
  const { evaluation } = report
  const today = honoluluDateOf(evaluation.current?.timestamp ?? evaluation.days[0]?.date ?? '')
  const [selectedDate, setSelectedDate] = useState(evaluation.days[0]?.date ?? '')

  const day = evaluation.days.find((entry) => entry.date === selectedDate) ?? evaluation.days[0]
  if (!day) {
    return (
      <p className="rounded-xl border border-border bg-surface p-4 text-sm">
        No forecast is available for this beach right now.
      </p>
    )
  }

  const isToday = day.date === today
  // On today, lead with the current hour; on a future day, lead with its window.
  const headline: HourAssessment | undefined =
    (isToday ? evaluation.current : undefined) ??
    day.recommendedWindow?.hours[0] ??
    day.hours[0]

  const verdict = isToday && evaluation.current ? evaluation.current.verdict : day.verdict
  const style = VERDICT_STYLE[verdict]
  const window = day.recommendedWindow
  const now = new Date(nowIso)

  // Lead with the problems, then the supporting positives.
  const explanation = (window ?? day.bestWindow)?.reasons ?? headline?.reasons ?? []
  const leadReasons = explanation.slice(0, 3)

  return (
    <div className="space-y-5">
      {/* ---------- Verdict ---------- */}
      <section
        aria-labelledby="verdict-heading"
        className={`rounded-2xl border p-5 ${style.bg} ${style.border}`}
      >
        <div className={`flex items-center gap-2 ${style.text}`}>
          <VerdictIcon verdict={verdict} className="h-6 w-6" />
          <h2 id="verdict-heading" className="text-2xl font-semibold tracking-tight">
            {VERDICT_LABEL[verdict]}
          </h2>
        </div>

        {window ? (
          <p className="mt-3 text-lg">
            <span className="text-muted">{isToday ? 'Best window today' : 'Best window'}: </span>
            <span className="font-semibold">
              {formatWindowRange(window.startTimestamp, window.endTimestamp)}
            </span>
          </p>
        ) : (
          <p className="mt-3 text-lg text-muted">No recommended window on this day.</p>
        )}

        {leadReasons.length > 0 ? (
          <ul className="mt-3 space-y-1.5 text-[15px] leading-snug">
            {leadReasons.map((entry) => (
              <li key={entry.code} className="flex gap-2">
                <span aria-hidden className={entry.severity === 'positive' ? style.text : 'text-muted'}>
                  •
                </span>
                <span>{entry.text}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {headline ? <div className="mt-3"><ConfidenceNote confidence={headline.confidence} /></div> : null}
      </section>

      {/* ---------- Day selector ---------- */}
      <section aria-labelledby="days-heading">
        <h3 id="days-heading" className="text-xs font-medium uppercase tracking-wide text-muted">
          Next {evaluation.days.length} days
        </h3>
        <div role="tablist" aria-label="Choose a day" className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {evaluation.days.map((entry) => {
            const selected = entry.date === day.date
            const entryStyle = VERDICT_STYLE[entry.verdict]
            return (
              <button
                key={entry.date}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setSelectedDate(entry.date)}
                className={`flex min-w-[4rem] flex-1 flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-colors ${
                  selected
                    ? 'border-sea bg-surface ring-1 ring-sea'
                    : 'border-border bg-surface hover:bg-surface-sunk'
                }`}
              >
                <span className="text-xs font-medium">{formatDayShort(entry.date, today)}</span>
                <VerdictIcon verdict={entry.verdict} className={`h-4 w-4 ${entryStyle.text}`} />
                {/* Word as well as icon and colour, so nothing depends on hue. */}
                <span className={`text-[10px] leading-tight ${entryStyle.text}`}>
                  {SHORT_VERDICT[entry.verdict]}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ---------- Selected day ---------- */}
      <section aria-labelledby="conditions-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="conditions-heading" className="text-base font-semibold">
            {formatDayLabel(day.date, today)}
            {isToday && evaluation.current ? (
              <span className="ml-2 text-sm font-normal text-muted">conditions now</span>
            ) : window ? (
              <span className="ml-2 text-sm font-normal text-muted">
                during {formatWindowRange(window.startTimestamp, window.endTimestamp)}
              </span>
            ) : null}
          </h3>
          <VerdictPill verdict={day.verdict} label={VERDICT_LABEL[day.verdict]} />
        </div>

        {headline ? (
          <ConditionsGrid
            assessment={headline}
            conditions={conditionsByTimestamp[headline.timestamp]}
          />
        ) : null}

        <HourlyTimeline
          hours={day.hours}
          usableHours={DEFAULT_USABLE_HOURS}
          highlightRange={
            window ? { start: window.startTimestamp, end: window.endTimestamp } : null
          }
        />
      </section>

      {/* ---------- Primary action ---------- */}
      <section aria-labelledby="alerts-heading" className="rounded-xl border border-border bg-surface p-4">
        <h3 id="alerts-heading" className="text-sm font-semibold">
          Alert me on great days
        </h3>
        <p className="mt-1 text-sm text-muted">
          Get a message the evening before conditions look favourable here.
        </p>
        <button
          type="button"
          disabled
          aria-describedby="alerts-unavailable"
          className="mt-3 w-full rounded-lg bg-sea px-4 py-2.5 text-sm font-medium text-on-sea opacity-45"
        >
          Set up alerts
        </button>
        <p id="alerts-unavailable" className="mt-2 text-xs text-muted">
          Not built yet — alerts are the next piece of work, so this button does nothing today.
        </p>
      </section>

      {/* ---------- Detail ---------- */}
      {headline ? (
        <TechnicalDetails
          assessment={headline}
          conditions={conditionsByTimestamp[headline.timestamp]}
          profile={profile}
          engineVersion={evaluation.engineVersion}
          configVersion={evaluation.configVersion}
          updatedAtUtc={report.updatedAtUtc}
          surfZoneIssuedUtc={report.surfZoneIssuedUtc}
          nowIso={nowIso}
          warnings={report.warnings}
          failures={report.failures}
        />
      ) : null}

      {/* ---------- Reminder and freshness ---------- */}
      <section className="rounded-xl border border-border bg-surface-sunk p-4">
        <h3 className="text-sm font-semibold">Check the water yourself</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{SHORELINE_REMINDER}</p>
        <p className="mt-3 text-xs text-muted">
          CoveCheck is a forecast, not a safety assessment. It cannot see the shoreline entry, surge,
          water clarity, or every local hazard. Children and weaker swimmers need a more cautious
          choice than the forecast alone suggests.
        </p>
      </section>

      <p className="pb-8 text-center text-xs text-muted">
        Forecast updated {formatUpdatedAgo(report.updatedAtUtc, now)}
      </p>
    </div>
  )
}

const SHORT_VERDICT: Record<string, string> = {
  great: 'Great',
  caution: 'Caution',
  not_recommended: 'No',
  insufficient_data: 'Unsure',
}
