'use client'

import { formatUpdatedAgo } from '@/lib/format'

/**
 * Compact forecast-freshness stamp for the header.
 *
 * Same data and same `formatUpdatedAgo` logic that previously sat at the foot of
 * the page — this is a placement change only. Freshness is load-bearing for trust
 * and belongs above the fold, but it must stay clearly subordinate to the verdict,
 * so it is rendered at the smallest muted type in the header.
 */
export function Freshness({
  updatedAtUtc,
  nowIso,
  className = '',
}: {
  updatedAtUtc: string
  nowIso: string
  className?: string
}) {
  return (
    <p className={`text-xs text-muted ${className}`}>
      <span className="sr-only">Forecast </span>
      Updated {formatUpdatedAgo(updatedAtUtc, new Date(nowIso))}
    </p>
  )
}
