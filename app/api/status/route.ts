import { CROMWELLS } from '@/lib/beach/cromwells'
import { jellyOutlook } from '@/lib/conditions/jellyfish'
import { getBeachReport } from '@/lib/forecast'
import { utcToHonoluluLocal } from '@/lib/time'

/**
 * Machine-readable health and alert state, for the watchdog.
 *
 * Public: nothing here is private. `sources` says which inputs failed this
 * request; `waterQuality` and `jellyfish` carry the two ESCALATE triggers.
 */
export async function GET() {
  const report = await getBeachReport(CROMWELLS)
  const now = new Date()
  const today = utcToHonoluluLocal(now).slice(0, 10)
  const [y, m, d] = today.split('-').map(Number)
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  const hours = Object.values(report.conditionsByTimestamp)
  const wq = report.waterQuality

  return Response.json({
    ok: true,
    checkedUtc: now.toISOString(),
    sources: {
      failures: report.failures,
      uv: hours.some((h) => h.uvIndex !== null) ? 'ok' : 'missing',
      rainHistory: Object.keys(report.rainHistoryByTimestamp).length >= 24 ? 'ok' : 'missing',
      waterQuality: wq.status === 'ok' ? 'ok' : 'failed',
    },
    waterQuality:
      wq.status === 'ok'
        ? { status: wq.data.nearby.length ? 'advisory' : 'clear', radiusKm: wq.data.radiusKm, nearby: wq.data.nearby }
        : { status: 'unknown', error: wq.error },
    jellyfish: {
      today: jellyOutlook(today),
      windowStartsTomorrow: jellyOutlook(tomorrow).expected && !jellyOutlook(today).expected,
    },
  })
}
