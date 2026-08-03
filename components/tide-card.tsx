'use client'

import type { HourAssessment } from '@/lib/engine'
import { formatClockTime, formatTideStage } from '@/lib/format'
import type { TideExtreme } from '@/lib/providers/tides'
import { formatSunTime, sunTimesFor } from '@/lib/sun'
import { honoluluLocalToUtc, toHonoluluLocal, utcToHonoluluLocal } from '@/lib/time'
import type { HourlyBeachConditions } from '@/lib/types'

/**
 * Tide card with an inline curve.
 *
 * The chart supplements the stage text, it does not replace it — the sentence
 * above still carries the reading, and someone using a screen reader gets the
 * same information from the summary below.
 *
 * Drawn as hand-rolled SVG from the NOAA hourly predictions already fetched. No
 * charting dependency: one polyline, a marker and two labels do not justify one.
 */

/** Hours either side of now to plot. */
const HOURS_BACK = 6
const HOURS_FORWARD = 6

const VIEW_W = 320
const VIEW_H = 92
const PAD_X = 10
const PAD_TOP = 16
const PAD_BOTTOM = 18

type Point = { x: number; y: number; localTimestamp: string; heightFt: number }

/** Next high and next low at or after `nowLocal`, whichever comes first of each. */
export function nextExtremes(
  extremes: readonly TideExtreme[],
  nowLocal: string,
): { nextHigh: TideExtreme | null; nextLow: TideExtreme | null } {
  const upcoming = extremes
    .filter((extreme) => extreme.heightFt !== null)
    .filter((extreme) => toHonoluluLocal(extreme.timestamp) >= nowLocal)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  return {
    nextHigh: upcoming.find((extreme) => extreme.kind === 'high') ?? null,
    nextLow: upcoming.find((extreme) => extreme.kind === 'low') ?? null,
  }
}

/** The plotted window of hourly heights, projected into SVG space. */
export type Curve = {
  points: Point[]
  nowX: number
  minFt: number
  maxFt: number
  /** Project any (time, height) into the same space, or null if outside the window. */
  project: (localTimestamp: string, heightFt: number) => { x: number; y: number } | null
}

export function buildCurve(
  conditionsByTimestamp: Record<string, HourlyBeachConditions>,
  nowLocal: string,
): Curve | null {
  const nowMs = honoluluLocalToUtc(nowLocal).getTime()
  const startMs = nowMs - HOURS_BACK * 3_600_000
  const endMs = nowMs + HOURS_FORWARD * 3_600_000

  const inWindow = Object.values(conditionsByTimestamp)
    .filter((hour) => hour.tideHeightFt !== null)
    .map((hour) => ({ hour, ms: honoluluLocalToUtc(hour.timestamp).getTime() }))
    .filter(({ ms }) => ms >= startMs && ms <= endMs)
    .sort((a, b) => a.ms - b.ms)

  if (inWindow.length < 2) return null

  const heights = inWindow.map(({ hour }) => hour.tideHeightFt as number)
  // Pad the vertical range so a flat stretch is not drawn as a hairline.
  const rawMin = Math.min(...heights)
  const rawMax = Math.max(...heights)
  const pad = Math.max(0.15, (rawMax - rawMin) * 0.15)
  const minFt = rawMin - pad
  const maxFt = rawMax + pad

  const spanMs = endMs - startMs
  const plotW = VIEW_W - PAD_X * 2
  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM

  const project = (ms: number, ft: number) => ({
    x: PAD_X + ((ms - startMs) / spanMs) * plotW,
    y: PAD_TOP + (1 - (ft - minFt) / (maxFt - minFt)) * plotH,
  })

  return {
    points: inWindow.map(({ hour, ms }) => ({
      ...project(ms, hour.tideHeightFt as number),
      localTimestamp: hour.timestamp,
      heightFt: hour.tideHeightFt as number,
    })),
    nowX: project(nowMs, minFt).x,
    minFt,
    maxFt,
    project: (localTimestamp, heightFt) => {
      const ms = honoluluLocalToUtc(localTimestamp).getTime()
      if (ms < startMs || ms > endMs) return null
      return project(ms, heightFt)
    },
  }
}

function ExtremeLabel({ label, extreme }: { label: string; extreme: TideExtreme | null }) {
  if (!extreme || extreme.heightFt === null) return null
  return (
    <span>
      <span className="font-medium">{label}</span> {formatClockTime(extreme.timestamp)} ·{' '}
      {extreme.heightFt.toFixed(1)} ft
    </span>
  )
}

export function TideCard({
  assessment,
  conditions,
  conditionsByTimestamp,
  tideExtremes,
  nowIso,
  latitude,
  longitude,
  date,
}: {
  assessment: HourAssessment
  conditions: HourlyBeachConditions | undefined
  conditionsByTimestamp: Record<string, HourlyBeachConditions>
  tideExtremes: readonly TideExtreme[]
  nowIso: string
  latitude: number
  longitude: number
  /** Honolulu-local date the sun times are for. */
  date: string
}) {
  const nowLocal = utcToHonoluluLocal(new Date(nowIso))
  const curve = buildCurve(conditionsByTimestamp, nowLocal)
  const { nextHigh, nextLow } = nextExtremes(tideExtremes, nowLocal)

  const upcoming = [
    { extreme: nextHigh, isHigh: true },
    { extreme: nextLow, isHigh: false },
  ].filter((entry): entry is { extreme: TideExtreme; isHigh: boolean } => entry.extreme !== null)

  const placed = upcoming.map((entry) => ({
    ...entry,
    at: curve?.project(toHonoluluLocal(entry.extreme.timestamp), entry.extreme.heightFt!) ?? null,
  }))
  const onChart = placed.filter(
    (entry): entry is typeof entry & { at: { x: number; y: number } } => entry.at !== null,
  )
  const offChart = placed.filter((entry) => entry.at === null)

  const sun = sunTimesFor(date, latitude, longitude)
  const sunLine = (
    [
      ['First light', sun.firstLight],
      ['Sunrise', sun.sunrise],
      ['Sunset', sun.sunset],
      ['Last light', sun.lastLight],
    ] as const
  )
    .map(([label, minutes]) => {
      const time = formatSunTime(minutes)
      return time ? `${label} ${time}` : null
    })
    .filter((entry): entry is string => entry !== null)
    .join(' · ')

  const qualifier =
    assessment.metrics.tideHeightFt === null
      ? 'Not available'
      : assessment.metrics.tideFavorability === null
        ? 'Not yet set for this beach'
        : assessment.metrics.tideFavorability >= 1
          ? 'In the good range'
          : assessment.metrics.tideFavorability >= 0.5
            ? 'Near the edge of the good range'
            : 'Outside the good range'

  return (
    <section
      aria-labelledby="tide-heading"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h3 id="tide-heading" className="text-xs font-medium uppercase tracking-wide text-muted">
        Tide
      </h3>

      <p className="mt-2 text-lg font-semibold leading-tight">{qualifier}</p>
      <p className="mt-0.5 text-sm text-muted">
        {formatTideStage(conditions?.tideStage ?? 'unknown')}
        {assessment.metrics.tideHeightFt !== null
          ? ` · ${assessment.metrics.tideHeightFt.toFixed(1)} ft above MLLW`
          : ''}
      </p>

      {curve ? (
        <>
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="mt-3 w-full"
            style={{ height: 'auto' }}
            role="img"
            aria-label={`Tide curve for the ${HOURS_BACK} hours before and ${HOURS_FORWARD} hours after now.`}
          >
            {/* Curve */}
            <polyline
              points={curve.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke="var(--sea)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Now: a full-height rule plus a dot on the curve. */}
            <line
              x1={curve.nowX}
              x2={curve.nowX}
              y1={PAD_TOP - 6}
              y2={VIEW_H - PAD_BOTTOM + 4}
              stroke="var(--foreground)"
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.45"
            />
            {(() => {
              const nearest = curve.points.reduce((best, p) =>
                Math.abs(p.x - curve.nowX) < Math.abs(best.x - curve.nowX) ? p : best,
              )
              return <circle cx={curve.nowX} cy={nearest.y} r="3.2" fill="var(--foreground)" />
            })()}
            <text
              x={curve.nowX}
              y={VIEW_H - 4}
              textAnchor="middle"
              fontSize="9"
              fill="var(--muted)"
            >
              now
            </text>

            {/*
              Extremes are annotated on the curve itself when they fall inside the
              plotted window. Anything outside it is listed underneath instead —
              putting an out-of-window label on the chart would place it at a
              position it does not actually occupy.
            */}
            {onChart.map(({ extreme, at, isHigh }) => (
              <g key={extreme.timestamp}>
                <circle cx={at.x} cy={at.y} r="2.6" fill="var(--sea)" />
                <text
                  x={Math.min(VIEW_W - 4, Math.max(4, at.x))}
                  y={isHigh ? at.y - 6 : at.y + 11}
                  textAnchor={at.x > VIEW_W - 70 ? 'end' : at.x < 70 ? 'start' : 'middle'}
                  fontSize="8.5"
                  fill="var(--sea)"
                >
                  {isHigh ? 'High' : 'Low'} {formatClockTime(extreme.timestamp)},{' '}
                  {extreme.heightFt!.toFixed(1)} ft
                </text>
              </g>
            ))}

            {/* Endpoint hour labels, so the window is readable. */}
            <text x={PAD_X} y={VIEW_H - 4} textAnchor="start" fontSize="9" fill="var(--muted)">
              {formatClockTime(curve.points[0].localTimestamp)}
            </text>
            <text
              x={VIEW_W - PAD_X}
              y={VIEW_H - 4}
              textAnchor="end"
              fontSize="9"
              fill="var(--muted)"
            >
              {formatClockTime(curve.points[curve.points.length - 1].localTimestamp)}
            </text>
          </svg>

          {offChart.length > 0 ? (
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted/80">
              {offChart.map(({ extreme, isHigh }) => (
                <ExtremeLabel
                  key={extreme.timestamp}
                  label={isHigh ? 'Next high' : 'Next low'}
                  extreme={extreme}
                />
              ))}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-xs text-muted/80">Tide curve unavailable for this window.</p>
      )}

      {/* Supporting context, deliberately the quietest text in the card. */}
      {sunLine ? <p className="mt-2 text-[11px] leading-relaxed text-muted/70">{sunLine}</p> : null}
    </section>
  )
}
