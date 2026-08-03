'use client'

import type { HourAssessment } from '@/lib/engine'
import { formatCompass, formatFeet, formatMph } from '@/lib/format'
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
  /** Lowest tier in the card's hierarchy, below the footnote. */
  extra?: React.ReactNode
}

function ConditionCard({ label, value, qualifier, footnote, extra }: ConditionCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-2">
        <p className="text-lg font-semibold leading-tight">{qualifier}</p>
        <p className="mt-0.5 text-sm text-muted">{value}</p>
        {footnote ? <p className="mt-1.5 text-xs text-muted/80">{footnote}</p> : null}
        {extra}
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
 * Clothing cue from sea surface temperature.
 *
 * Thresholds are the conventional wetsuit bands used by dive and surf retailers,
 * as specified in the brief. There is no authoritative standard — comfort varies
 * by person and exposure time — so these are a guide, not a recommendation.
 *
 * Note that Surfline's own card showed "Rashguard" at 81°F water, where these
 * bands say no wetsuit is needed. Both are right about different things: at 81°F
 * a rashguard is sun and reef protection, not warmth. Hence the footnote, which
 * is shown at every temperature rather than folded into the thermal cue.
 */
export function clothingCue(seaTempF: number | null): string {
  if (seaTempF === null) return 'Not available'
  if (seaTempF >= 78) return 'No wetsuit needed'
  if (seaTempF >= 74) return 'Rashguard'
  if (seaTempF >= 70) return 'Rashguard, some may want a light wetsuit top'
  return 'Wetsuit recommended'
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
        label="Water & air"
        qualifier={clothingCue(conditions?.seaSurfaceTempF ?? null)}
        value={
          conditions?.seaSurfaceTempF != null
            ? `${Math.round(conditions.seaSurfaceTempF)}°F water${
                conditions.airTempF != null ? `, ${Math.round(conditions.airTempF)}°F air` : ''
              }`
            : '—'
        }
        footnote={
          conditions?.seaSurfaceTempF != null
            ? 'A rashguard also helps against sun and reef'
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
