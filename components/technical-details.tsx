'use client'

import type { HourAssessment } from '@/lib/engine'
import { formatCompass, formatFeet, formatMph, formatUpdatedAgo } from '@/lib/format'
import type { BeachProfile, HourlyBeachConditions, ProviderId } from '@/lib/types'

/**
 * Progressive disclosure for people who want to check CoveCheck's work.
 *
 * Two things here are deliberate rather than decorative:
 *
 * The offshore-versus-exposed rows are shown side by side, because that gap is
 * the whole reason this product exists and a sceptical local should be able to
 * see it rather than take it on trust.
 *
 * Unresolved calibration gaps are printed in full. A limitation the engine knows
 * about should not be visible only in the repository.
 */

/**
 * Only providers that carry per-hour freshness appear here. The Weather Service
 * surf forecast is deliberately absent: it has no `sourceFreshness` entry because
 * it is a twice-daily text product, and its issuance time is shown alongside the
 * surf figure in the Waves section instead.
 */
const PROVIDER_LABEL: Record<Exclude<ProviderId, 'srf'>, string> = {
  marine: 'Wave model',
  weather: 'Wind and rain',
  tides: 'Tide predictions',
  alerts: 'Official advisories',
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right">
        <span className="font-mono text-xs">{value}</span>
        {note ? <span className="ml-2 text-xs text-muted">{note}</span> : null}
      </dd>
    </div>
  )
}

export function TechnicalDetails({
  assessment,
  conditions,
  profile,
  engineVersion,
  configVersion,
  updatedAtUtc,
  surfZoneIssuedUtc,
  nowIso,
  warnings,
  failures,
}: {
  assessment: HourAssessment
  conditions: HourlyBeachConditions | undefined
  profile: BeachProfile
  engineVersion: string
  configVersion: string
  updatedAtUtc: string
  surfZoneIssuedUtc: string | null
  nowIso: string
  warnings: string[]
  failures: { provider: string; error: string }[]
}) {
  const now = new Date(nowIso)
  const openGaps = profile.calibration.filter((gap) => gap.status === 'unresolved')

  return (
    <details className="group rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
        <span className="flex items-center justify-between">
          Forecast detail
          <span aria-hidden className="text-muted transition-transform group-open:rotate-90">
            ›
          </span>
        </span>
      </summary>

      <div className="border-t border-border px-4 py-3 text-sm">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted">Waves</h4>
        <dl className="mt-1 divide-y divide-border/60">
          <Row
            label="Reaching this beach"
            value={formatFeet(assessment.metrics.exposedSwellHeightFt)}
            note={`inside ${profile.exposedSwellDirections
              .map((range) => `${range.fromDeg}–${range.toDeg}°`)
              .join(', ')}`}
          />
          <Row
            label="Total sea state offshore"
            value={formatFeet(conditions?.modelSigWaveHeightFt ?? null)}
            note={
              conditions?.modelSigWaveDirectionDeg != null
                ? `from the ${formatCompass(conditions.modelSigWaveDirectionDeg)}`
                : undefined
            }
          />
          <Row
            label="Primary swell"
            value={formatFeet(conditions?.modelSwellHeightFt ?? null)}
            note={
              conditions?.modelSwellDirectionDeg != null
                ? `from the ${formatCompass(conditions.modelSwellDirectionDeg)}`
                : undefined
            }
          />
          <Row
            label="Wind-driven waves"
            value={formatFeet(conditions?.modelWindWaveHeightFt ?? null)}
            note={
              conditions?.modelWindWaveDirectionDeg != null
                ? `from the ${formatCompass(conditions.modelWindWaveDirectionDeg)}`
                : undefined
            }
          />
          {assessment.metrics.srfSouthFacingMaxFt !== null ? (
            <Row
              label="Weather Service surf face"
              value={`up to ${assessment.metrics.srfSouthFacingMaxFt} ft`}
              note={
                surfZoneIssuedUtc
                  ? `${profile.shoreAspect}-facing shores, issued ${formatUpdatedAgo(surfZoneIssuedUtc, now)}`
                  : `${profile.shoreAspect}-facing shores`
              }
            />
          ) : null}
        </dl>

        <p className="mt-2 text-xs leading-relaxed text-muted">
          Offshore wave height and breaking surf height are different measurements. CoveCheck counts
          only the swell arriving from directions this beach is open to, which is why the first two
          figures can differ so much.
        </p>

        <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">Wind and tide</h4>
        <dl className="mt-1 divide-y divide-border/60">
          <Row label="Wind" value={formatMph(assessment.metrics.windSpeedMph)} />
          <Row label="Gusts" value={formatMph(assessment.metrics.windGustMph)} />
          <Row
            label="Tide height"
            value={conditions?.tideHeightFt != null ? `${conditions.tideHeightFt.toFixed(2)} ft` : '—'}
            note="above MLLW"
          />
          <Row
            label="Rain, last 12 h"
            value={
              assessment.metrics.recentRainIn != null
                ? `${assessment.metrics.recentRainIn.toFixed(2)} in`
                : '—'
            }
          />
        </dl>

        <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">Data sources</h4>
        <dl className="mt-1 divide-y divide-border/60">
          {(Object.keys(PROVIDER_LABEL) as Exclude<ProviderId, 'srf'>[]).map((provider) => {
            const entry = conditions?.sourceFreshness[provider]
            if (!entry) return null
            return (
              <Row
                key={provider}
                label={PROVIDER_LABEL[provider]}
                value={entry.status}
                note={formatUpdatedAgo(entry.fetchedAtUtc, now)}
              />
            )
          })}
        </dl>

        {failures.length > 0 ? (
          <p className="mt-2 rounded-lg bg-nogo-bg px-3 py-2 text-xs text-nogo">
            {failures.map((failure) => `${failure.provider} — ${failure.error}`).join('; ')}
          </p>
        ) : null}

        {openGaps.length > 0 ? (
          <>
            <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">
              Known limitations
            </h4>
            <ul className="mt-1 space-y-2">
              {openGaps.map((gap) => (
                <li key={gap.id} className="rounded-lg bg-surface-sunk px-3 py-2 text-xs leading-relaxed">
                  <span className="font-medium">{gap.id}</span>
                  <span className="mt-1 block text-muted">{gap.note}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {warnings.length > 0 ? (
          <>
            <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">
              This forecast run
            </h4>
            <ul className="mt-1 space-y-1 text-xs leading-relaxed text-muted">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </>
        ) : null}

        <p className="mt-4 border-t border-border pt-3 font-mono text-[11px] text-muted">
          engine {engineVersion} · beach config {configVersion} · fetched{' '}
          {formatUpdatedAgo(updatedAtUtc, now)}
        </p>
      </div>
    </details>
  )
}
