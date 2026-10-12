import { CROMWELLS } from '@/lib/beach/cromwells'
import { summarize } from '@/lib/reports/calibration'
import type { StoredReport } from '@/lib/reports/schema'
import { getReportStore } from '@/lib/reports/store'
import { claritySuggestion, lensAgreement, thresholdSuggestions, tideRuleChecks, tideSuggestion } from '@/lib/reports/suggest'

/**
 * Calibration findings and suggestions from Sal's visit reports. Private
 * (reports include free text), so this needs `Authorization: Bearer
 * $CALIBRATION_TOKEN`. Read-only: nothing here changes a threshold.
 */
export async function GET(request: Request) {
  const token = process.env.CALIBRATION_TOKEN
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const store = getReportStore()
  if (!store) return Response.json({ ok: false, error: 'report store not configured' }, { status: 503 })
  const reports = (await store.list(500)).map((raw) => JSON.parse(raw) as StoredReport)
  const tide = tideSuggestion(reports, CROMWELLS.thresholds.favorableTideFt)
  return Response.json({
    ok: true,
    ...summarize(reports),
    lensAgreement: lensAgreement(reports),
    tideRule: tideRuleChecks(reports),
    suggestions: [...thresholdSuggestions(reports), claritySuggestion(reports), ...(tide ? [tide] : [])],
    recent: reports.slice(0, 20).map((r) => ({ id: r.id, date: r.date, hour: r.hour, report: r.report })),
  })
}
