import { z } from 'zod'
import type { BeachHazard, HazardSeverity } from '../types'
import { fetchProviderJson, NWS_USER_AGENT, type ProviderResult } from './http'

/**
 * National Weather Service active alerts for a point.
 *
 * An empty `features` array is a valid, meaningful answer — "no active hazards"
 * — and must never be conflated with a failed fetch. The two are different
 * verdict inputs: no hazards can support a green verdict, whereas an unknown
 * hazard state cannot.
 */

const BASE = 'https://api.weather.gov/alerts/active'

const alertsSchema = z.object({
  features: z.array(
    z.object({
      properties: z.object({
        event: z.string(),
        severity: z.string().nullable().optional(),
        headline: z.string().nullable().optional(),
        onset: z.string().nullable().optional(),
        ends: z.string().nullable().optional(),
        expires: z.string().nullable().optional(),
      }),
    }),
  ),
})

/**
 * Event-name fragments CoveCheck treats as hard blockers, per the spec's hazard
 * list. Matched case-insensitively on the NWS event name.
 *
 * Deliberately matched on substrings rather than an exact allowlist: NWS event
 * names vary ("High Surf Advisory" / "High Surf Warning"), and for a family
 * safety product an unrecognized-but-matching hazard should block rather than
 * slip through.
 */
export const BLOCKING_EVENT_FRAGMENTS = [
  'high surf',
  'beach hazard',
  'coastal flood',
  'flash flood',
  'flood advisory',
  'flood warning',
  'flood watch',
  'tsunami',
  'hurricane',
  'tropical storm',
  'small craft advisory',
] as const

export function isBlockingEvent(event: string): boolean {
  const lower = event.toLowerCase()
  return BLOCKING_EVENT_FRAGMENTS.some((fragment) => lower.includes(fragment))
}

function normalizeSeverity(raw: string | null | undefined, event: string): HazardSeverity {
  const fromEvent = event.toLowerCase()
  if (fromEvent.includes('warning')) return 'warning'
  if (fromEvent.includes('advisory')) return 'advisory'
  if (fromEvent.includes('watch')) return 'watch'
  if (fromEvent.includes('statement')) return 'statement'

  switch ((raw ?? '').toLowerCase()) {
    case 'extreme':
    case 'severe':
      return 'warning'
    case 'moderate':
      return 'advisory'
    case 'minor':
      return 'statement'
    default:
      return 'unknown'
  }
}

export function buildAlertsUrl(latitude: number, longitude: number): string {
  // NWS wants a bare `lat,lon` point; URLSearchParams would percent-encode the comma.
  return `${BASE}?point=${latitude},${longitude}`
}

export async function fetchAlerts(
  latitude: number,
  longitude: number,
  overrides: { fetchImpl?: typeof fetch } = {},
): Promise<ProviderResult<{ hazards: BeachHazard[] }>> {
  const result = await fetchProviderJson({
    provider: 'alerts',
    url: buildAlertsUrl(latitude, longitude),
    schema: alertsSchema,
    headers: { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json' },
    fetchImpl: overrides.fetchImpl,
  })

  if (!result.ok) return result

  const hazards: BeachHazard[] = result.data.features.map((feature) => {
    const p = feature.properties
    return {
      event: p.event,
      severity: normalizeSeverity(p.severity, p.event),
      headline: p.headline ?? null,
      onsetUtc: p.onset ?? null,
      endsUtc: p.ends ?? p.expires ?? null,
      isBlocking: isBlockingEvent(p.event),
    }
  })

  return { ...result, data: { hazards } }
}
