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
 * Derived from the engine's own reason codes rather than from thresholds
 * duplicated here.
 *
 * This matters because the wind limits are direction-dependent: 20 mph blowing
 * offshore is light *for this beach*, while 12 mph onshore is not. A UI copy of
 * the numbers would drift from the engine and mislabel exactly those cases.
 */
function windQualifier(codes: readonly string[], speedMph: number | null): string {
  if (speedMph === null) return 'Not available'
  if (codes.includes('WIND_NOT_CALIBRATED')) return 'Not yet calibrated'
  if (codes.includes('STRONG_GUSTS')) return 'Strong for this beach'
  if (codes.includes('CALM_WIND')) return 'Light for this beach'
  return 'Moderate'
}

/**
 * Tide is a band here, not a scale.
 *
 * "Plenty of water" was wrong at the high end: at a reef-entry cove a high tide
 * can mean stronger current and less shallow standing area for children, so more
 * water is not simply better. While the band is uncalibrated we say so rather
 * than implying a judgement.
 */
function tideQualifier(favorability: number | null, heightFt: number | null): string {
  if (heightFt === null) return 'Not available'
  if (favorability === null) return 'Not yet set for this beach'
  if (favorability >= 1) return 'In the good range'
  if (favorability >= 0.5) return 'Near the edge of the good range'
  return 'Outside the good range'
}

export function ConditionsGrid({
  assessment,
  conditions,
}: {
  assessment: HourAssessment
  conditions: HourlyBeachConditions | undefined
}) {
  const { metrics } = assessment
  const codes = assessment.reasons.map((entry) => entry.code)
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
        qualifier={windQualifier(codes, metrics.windSpeedMph)}
        value={`${formatMph(metrics.windSpeedMph)}${
          metrics.windGustMph !== null ? `, gusts ${formatMph(metrics.windGustMph)}` : ''
        }`}
        footnote={
          conditions?.windDirectionDeg !== null && conditions?.windDirectionDeg !== undefined
            ? `From the ${formatCompass(conditions.windDirectionDeg)}${
                codes.includes('FAVORABLE_WIND_DIRECTION')
                  ? ' — blowing offshore'
                  : codes.includes('ONSHORE_WIND')
                    ? ' — blowing onshore'
                    : ''
              }`
            : undefined
        }
      />

      <ConditionCard
        label="Tide"
        qualifier={tideQualifier(metrics.tideFavorability, metrics.tideHeightFt)}
        value={formatTideStage(conditions?.tideStage ?? 'unknown')}
        footnote={
          metrics.tideHeightFt !== null
            ? `${metrics.tideHeightFt.toFixed(1)} ft above MLLW`
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
