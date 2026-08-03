'use client'

import type { HourAssessment, Verdict } from '@/lib/engine'
import { formatDayShort, formatHour } from '@/lib/format'
import { honoluluDateOf, honoluluHourOf } from '@/lib/time'
import { VERDICT_STYLE } from './verdict'

/**
 * Hourly favourability across several days.
 *
 * Verdict is encoded twice over — in bar *height* as well as colour — so the
 * shape of a day is readable without relying on hue. Every bar carries an
 * accessible label, and the whole strip is a list so a screen reader can walk it.
 *
 * Scrolls horizontally rather than shrinking bars to illegibility. Four days of
 * 13 hourly bars will not fit a phone at a readable width, and a squashed chart
 * is worse than one you swipe.
 */

/** Height is the non-colour channel: taller means more favourable. */
const BAR_HEIGHT: Record<Verdict, string> = {
  great: 'h-10',
  caution: 'h-6',
  not_recommended: 'h-3',
  insufficient_data: 'h-2',
}

const VERDICT_WORD: Record<Verdict, string> = {
  great: 'great',
  caution: 'use caution',
  not_recommended: 'not recommended',
  insufficient_data: 'not enough confidence',
}

/**
 * Days to draw.
 *
 * Four fits the brief's 3-5 range and keeps each day's block wide enough to read
 * on a phone once scrolled; five starts to feel like a wall of bars.
 */
export const TIMELINE_DAYS = 4

/** "6a", "12p" — compact enough to sit under a bar. */
function tickLabel(hour: number): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}${hour < 12 ? 'a' : 'p'}`
}

export type TimelineDay = {
  date: string
  hours: HourAssessment[]
  /** Inclusive local timestamps of that day's recommended window, if any. */
  recommendedWindow: { start: string; end: string } | null
}

export function HourlyTimeline({
  days,
  usableHours,
  todayDate,
  maxDays = TIMELINE_DAYS,
}: {
  days: readonly TimelineDay[]
  /** Only these local hours are drawn — 3 AM is noise for a family outing. */
  usableHours: { earliest: number; latest: number }
  todayDate: string
  maxDays?: number
}) {
  const visibleDays = days
    .map((day) => ({
      ...day,
      hours: day.hours.filter((hour) => {
        const local = honoluluHourOf(hour.timestamp)
        return local >= usableHours.earliest && local <= usableHours.latest
      }),
    }))
    .filter((day) => day.hours.length > 0)
    .slice(0, maxDays)

  if (visibleDays.length === 0) return null

  const isHighlighted = (day: TimelineDay, timestamp: string) =>
    day.recommendedWindow !== null &&
    timestamp >= day.recommendedWindow.start &&
    timestamp <= day.recommendedWindow.end

  return (
    <section aria-labelledby="timeline-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="timeline-heading" className="text-xs font-medium uppercase tracking-wide text-muted">
          Next {visibleDays.length} days, hour by hour
        </h3>
        <span className="text-[11px] text-muted/70">
          {tickLabel(usableHours.earliest)}–{tickLabel(usableHours.latest + 1)} daily
        </span>
      </div>

      {/*
        One scroll container; each day is a block that never splits across it.
        Deliberately no negative-margin bleed — it made the container wider than
        its parent and pushed 4px of horizontal overflow onto the page.
      */}
      <div className="mt-3 overflow-x-auto pb-1">
        <ol className="flex min-w-max items-stretch gap-4" role="list">
          {visibleDays.map((day) => (
            <li key={day.date} className="flex flex-col gap-1.5">
              <ol className="flex items-end gap-[3px]" role="list">
                {day.hours.map((hour) => {
                  const localHour = honoluluHourOf(hour.timestamp)
                  const highlighted = isHighlighted(day, hour.timestamp)
                  return (
                    <li key={hour.timestamp} className="flex flex-col items-center gap-1.5">
                      <div
                        className={`w-3 rounded-sm ${BAR_HEIGHT[hour.verdict]} ${
                          VERDICT_STYLE[hour.verdict].dot
                        } ${highlighted ? 'opacity-100' : 'opacity-45'}`}
                        title={`${formatDayShort(day.date, todayDate)} ${formatHour(localHour)}: ${
                          VERDICT_WORD[hour.verdict]
                        }`}
                      />
                      <span className="sr-only">
                        {formatDayShort(day.date, todayDate)} {formatHour(localHour)}:{' '}
                        {VERDICT_WORD[hour.verdict]}
                        {highlighted ? ', within the recommended window' : ''}
                      </span>
                      {/* Label every third hour so the axis stays legible. */}
                      <span aria-hidden className="text-[10px] leading-none text-muted">
                        {localHour % 3 === 0 ? tickLabel(localHour) : ''}
                      </span>
                    </li>
                  )
                })}
              </ol>

              {/* Day separator label, so the blocks are scannable. */}
              <span
                aria-hidden
                className={`border-t border-border pt-1 text-center text-[11px] ${
                  day.date === todayDate ? 'font-semibold' : 'text-muted'
                }`}
              >
                {formatDayShort(day.date, todayDate)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <p className="mt-1 text-xs text-muted">
        Taller bars are more favourable. Shaded bars fall inside each day&rsquo;s recommended window.
      </p>
    </section>
  )
}

/** Build timeline input from an evaluation's day summaries. */
export function toTimelineDays(
  days: readonly {
    date: string
    hours: HourAssessment[]
    recommendedWindow: { startTimestamp: string; endTimestamp: string } | null
  }[],
): TimelineDay[] {
  return days.map((day) => ({
    date: day.date,
    hours: day.hours,
    recommendedWindow: day.recommendedWindow
      ? { start: day.recommendedWindow.startTimestamp, end: day.recommendedWindow.endTimestamp }
      : null,
  }))
}

/** Exported for tests: which local dates a series covers, in order. */
export function datesIn(hours: readonly HourAssessment[]): string[] {
  return [...new Set(hours.map((hour) => honoluluDateOf(hour.timestamp)))].sort()
}
