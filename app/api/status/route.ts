import { CROMWELLS } from '@/lib/beach/cromwells'
import { buoyComparisonFor } from '@/lib/facts'
import { getBeachReport } from '@/lib/forecast'
import { BUOY_STALE_MINUTES } from '@/lib/providers/buoy'

/**
 * Machine-readable source health, for the site's "Where this data comes from"
 * panel. Public: nothing here is private. Feeds no alerts or escalation.
 */
export async function GET() {
  const report = await getBeachReport(CROMWELLS)
  const hours = Object.values(report.conditionsByTimestamp)
  const buoy = buoyComparisonFor(report, CROMWELLS)

  type Source = { id: string; name: string; status: 'ok' | 'failed' | 'stale'; updatedUtc: string | null; detail?: string }
  const sources: Source[] = report.sourceStatus.map((s) => {
    let status: 'ok' | 'failed' | 'stale' = s.status
    let updatedUtc: string | null = s.fetchedAtUtc
    let detail: string | undefined
    if (s.id === 'weather' && s.status === 'ok' && !hours.some((h) => h.uvIndex !== null)) {
      status = 'failed'
      detail = 'UV missing'
    }
    if (s.id === 'rain' && Object.keys(report.rainHistoryByTimestamp).length < 24) status = 'failed'
    if (s.id === 'buoy' && report.buoy.status === 'ok') {
      updatedUtc = report.buoy.data.observedUtc
      if (buoy?.stale) {
        status = 'stale'
        detail = `no report for over ${BUOY_STALE_MINUTES} min`
      }
    }
    if (s.id === 'doh' && report.waterQuality.status === 'ok') {
      detail = report.waterQuality.data.nearby.length ? `${report.waterQuality.data.nearby.length} advisory nearby` : 'none within 5 km'
    }
    return { id: s.id, name: s.name, status, updatedUtc, detail }
  })
  sources.push({
    id: 'srf',
    name: 'NWS surf zone forecast (south shore)',
    status: report.surfZoneIssuedUtc ? 'ok' : 'failed',
    updatedUtc: report.surfZoneIssuedUtc,
    detail: report.surfZoneIssuedUtc ? 'issued time' : undefined,
  })

  return Response.json({ ok: true, checkedUtc: new Date().toISOString(), sources, buoy })
}
