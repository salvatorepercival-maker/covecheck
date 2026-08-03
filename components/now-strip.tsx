'use client'

import type { HourAssessment } from '@/lib/engine'
import { formatCompass, formatTideStage } from '@/lib/format'
import type { HourlyBeachConditions } from '@/lib/types'

/**
 * "What is it like right now", in one glance.
 *
 * Sits above the verdict deliberately: three measured facts a person can absorb
 * before reading any reasoning. Numbers only — no interpretation, no verdict
 * colour, nothing that competes with the card below it. The supporting cards
 * further down carry the plain-language reading of each.
 *
 * Purely presentational: every value already appears elsewhere on the page.
 */

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'h-4 w-4 shrink-0 text-sea',
}

const TideIcon = () => (
  <svg {...iconProps}>
    <path d="M3 8.5c2.2 0 2.2-1.6 4.5-1.6S10 8.5 12 8.5s2.2-1.6 4.5-1.6S19 8.5 21 8.5" />
    <path d="M3 15.5c2.2 0 2.2-1.6 4.5-1.6S10 15.5 12 15.5s2.2-1.6 4.5-1.6S19 15.5 21 15.5" />
  </svg>
)

const ThermometerIcon = () => (
  <svg {...iconProps}>
    <path d="M10 13.6V5.2a2 2 0 1 1 4 0v8.4a4.2 4.2 0 1 1-4 0Z" />
    <path d="M12 17.4h.01" />
  </svg>
)

const WindIcon = () => (
  <svg {...iconProps}>
    <path d="M3 8h11a2.6 2.6 0 1 0-2.6-2.6" />
    <path d="M3 13h15a2.6 2.6 0 1 1-2.6 2.6" />
    <path d="M3 18h7" />
  </svg>
)

function Item({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: string
  /** Read by assistive tech; the icon alone is not a label. */
  label: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {icon}
      <span className="truncate text-sm font-medium tabular-nums">
        <span className="sr-only">{label}: </span>
        {value}
      </span>
    </div>
  )
}

export function NowStrip({
  assessment,
  conditions,
}: {
  assessment: HourAssessment
  conditions: HourlyBeachConditions | undefined
}) {
  const { metrics } = assessment

  const tide =
    metrics.tideHeightFt !== null
      ? `${formatTideStage(conditions?.tideStage ?? 'unknown')} ${metrics.tideHeightFt.toFixed(1)} ft`
      : '—'

  const water = conditions?.seaSurfaceTempF != null ? `${Math.round(conditions.seaSurfaceTempF)}°F` : '—'

  const wind =
    metrics.windSpeedMph !== null
      ? `${Math.round(metrics.windSpeedMph)} mph${
          conditions?.windDirectionDeg != null ? ` ${formatCompass(conditions.windDirectionDeg)}` : ''
        }`
      : '—'

  return (
    <div
      aria-label="Conditions right now"
      className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface/70 px-3.5 py-2.5"
    >
      <Item icon={<TideIcon />} value={tide} label="Tide" />
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      <Item icon={<ThermometerIcon />} value={water} label="Water temperature" />
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      <Item icon={<WindIcon />} value={wind} label="Wind" />
    </div>
  )
}
