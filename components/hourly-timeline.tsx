'use client'

import type { HourAssessment, Verdict } from '@/lib/engine'
import { formatHour } from '@/lib/format'
import { honoluluHourOf } from '@/lib/time'
import { VERDICT_STYLE } from './verdict'

/**
 * Compact hourly timeline, showing when conditions improve or deteriorate.
 *
 * Verdict is encoded twice over, in bar *height* as well as colour, so the shape
 * of the day is readable without relying on hue. Every bar carries an accessible
 * label with its hour and verdict, and the whole strip is a list so a screen
 * reader can walk it.
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

/** "6a", "12p" — compact enough to sit under a bar on a phone. */
function tickLabel(hour: number): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}${hour < 12 ? 'a' : 'p'}`
}

export function HourlyTimeline({
  hours,
  highlightRange,
  usableHours,
}: {
  hours: HourAssessment[]
  /** Inclusive local timestamps of the recommended window, emphasised in the strip. */
  highlightRange?: { start: string; end: string } | null
  /** Only these local hours are drawn — 3 AM is noise for a family outing. */
  usableHours: { earliest: number; latest: number }
}) {
  const visible = hours.filter((hour) => {
    const local = honoluluHourOf(hour.timestamp)
    return local >= usableHours.earliest && local <= usableHours.latest
  })

  if (visible.length === 0) return null

  const isHighlighted = (timestamp: string) =>
    highlightRange !== null &&
    highlightRange !== undefined &&
    timestamp >= highlightRange.start &&
    timestamp <= highlightRange.end

  return (
    <section aria-labelledby="timeline-heading">
      <h3 id="timeline-heading" className="text-xs font-medium uppercase tracking-wide text-muted">
        {tickLabel(usableHours.earliest).replace('a', ' AM').replace('p', ' PM')} to{' '}
        {tickLabel(usableHours.latest + 1).replace('a', ' AM').replace('p', ' PM')}
      </h3>

      <ol className="mt-3 flex items-end gap-[3px] pb-1" role="list">
        {visible.map((hour) => {
          const localHour = honoluluHourOf(hour.timestamp)
          const highlighted = isHighlighted(hour.timestamp)
          return (
            <li key={hour.timestamp} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div
                className={`w-full rounded-sm ${BAR_HEIGHT[hour.verdict]} ${
                  VERDICT_STYLE[hour.verdict].dot
                } ${highlighted ? 'opacity-100' : 'opacity-45'}`}
                title={`${formatHour(localHour)}: ${VERDICT_WORD[hour.verdict]}`}
              />
              <span className="sr-only">
                {formatHour(localHour)}: {VERDICT_WORD[hour.verdict]}
                {highlighted ? ', within the recommended window' : ''}
              </span>
              {/* Label every third hour so the axis stays legible on a phone. */}
              <span aria-hidden className="text-[10px] leading-none text-muted">
                {localHour % 3 === 0 ? tickLabel(localHour) : ''}
              </span>
            </li>
          )
        })}
      </ol>

      <p className="mt-1 text-xs text-muted">
        Taller bars are more favourable. Shaded bars fall inside the recommended window.
      </p>
    </section>
  )
}
