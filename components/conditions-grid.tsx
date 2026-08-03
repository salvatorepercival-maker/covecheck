'use client'

import type { HourAssessment } from '@/lib/engine'
import { formatCompass, formatFeet, formatMph, formatTideStage } from '@/lib/format'
import type { HourlyBeachConditions } from '@/lib/types'

/**
 * The four primary conditions.
 *
 * Each card leads with a plain-language qualifier and puts the number second —
 * a parent should be able to read the card without interpreting the figure. The
 * technical panel below carries the full detail for anyone who wants it.
 */

type ConditionCardProps = {
  label: string
  value: string
  qualifier: string
  /** Rendered smaller, for provenance or a secondary figure. */
  footnote?: string
}

function ConditionCard({ label, value, qualifier, footnote }: ConditionCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-2">
        <p className="text-lg font-semibold leading-tight">{qualifier}</p>
        <p className="mt-0.5 text-sm text-muted">{value}</p>
        {footnote ? <p className="mt-1.5 text-xs text-muted/80">{footnote}</p> : null}
      </dd>
    </div>
  )
}

function swellQualifier(heightFt: number | null): string {
  if (heightFt === null) return 'Not available'
  if (heightFt < 1) return 'Very little'
  if (heightFt <= 2) return 'Small'
  if (heightFt <= 3) return 'Moderate'
  return 'Large'
}

/**
 * Wind is described relatively while calibration is unresolved.
 *
 * The absolute figure is still shown, labelled as a model reading, because
 * hiding it would be worse than showing it with a caveat.
 */
function windQualifier(speedMph: number | null, uncalibrated: boolean): string {
  if (speedMph === null) return 'Not available'
  if (uncalibrated) return 'Not yet calibrated'
  if (speedMph <= 8) return 'Light'
  if (speedMph <= 12) return 'Moderate'
  if (speedMph <= 20) return 'Fresh'
  return 'Strong'
}

function tideQualifier(fraction: number | null): string {
  if (fraction === null) return 'Not available'
  if (fraction >= 0.7) return 'Plenty of water'
  if (fraction >= 0.4) return 'Adequate water'
  return 'Low over the reef'
}

export function ConditionsGrid({
  assessment,
  conditions,
  windUncalibrated,
}: {
  assessment: HourAssessment
  conditions: HourlyBeachConditions | undefined
  windUncalibrated: boolean
}) {
  const { metrics } = assessment
  const hazards = conditions?.activeHazards ?? []
  const hazardsKnown = conditions?.sourceFreshness.alerts?.status === 'ok'

  const swellFootnote =
    metrics.srfSouthFacingMaxFt !== null
      ? `Weather Service surf: up to ${metrics.srfSouthFacingMaxFt} ft on south shores`
      : 'No Weather Service surf forecast available'

  return (
    <dl className="grid grid-cols-2 gap-3">
      <ConditionCard
        label="Swell reaching here"
        qualifier={swellQualifier(metrics.exposedSwellHeightFt)}
        value={
          conditions?.exposedPartitions.length
            ? `${formatFeet(metrics.exposedSwellHeightFt)} from the ${formatCompass(
                conditions.exposedPartitions[0].directionDeg,
              )}`
            : formatFeet(metrics.exposedSwellHeightFt)
        }
        footnote={swellFootnote}
      />

      <ConditionCard
        label="Wind"
        qualifier={windQualifier(metrics.windSpeedMph, windUncalibrated)}
        value={`${formatMph(metrics.windSpeedMph)}${
          metrics.windGustMph !== null ? `, gusts ${formatMph(metrics.windGustMph)}` : ''
        }`}
        footnote={
          conditions?.windDirectionDeg !== null && conditions?.windDirectionDeg !== undefined
            ? `From the ${formatCompass(conditions.windDirectionDeg)}`
            : undefined
        }
      />

      <ConditionCard
        label="Tide"
        qualifier={tideQualifier(metrics.tideRangeFraction)}
        value={formatTideStage(conditions?.tideStage ?? 'unknown')}
        footnote={
          metrics.tideRangeFraction !== null
            ? `${Math.round(metrics.tideRangeFraction * 100)}% of today's range`
            : undefined
        }
      />

      <ConditionCard
        label="Advisories"
        qualifier={
          !hazardsKnown ? 'Could not check' : hazards.length === 0 ? 'None active' : `${hazards.length} active`
        }
        value={
          !hazardsKnown
            ? 'Treat conditions as unconfirmed'
            : hazards.length === 0
              ? 'No official advisories in effect'
              : hazards.map((hazard) => hazard.event).join(', ')
        }
      />
    </dl>
  )
}
