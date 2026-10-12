import { summarize } from '@/lib/reports/calibration'
import type { StoredReport } from '@/lib/reports/schema'
import { getReportStore } from '@/lib/reports/store'

/**
 * Calibration findings for the watchdog. Reports include free-text notes from the
 * public, so this needs `Authorization: Bearer $CALIBRATION_TOKEN`.
 */
export async function GET(request: Request) {
  const token = process.env.CALIBRATION_TOKEN
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const store = getReportStore()
  if (!store) return Response.json({ ok: false, error: 'report store not configured' }, { status: 503 })
  const reports = (await store.list(500)).map((raw) => JSON.parse(raw) as StoredReport)
  return Response.json({ ok: true, ...summarize(reports) })
}
