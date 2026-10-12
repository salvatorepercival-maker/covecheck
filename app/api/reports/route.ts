import { CROMWELLS } from '@/lib/beach/cromwells'
import { getBeachReport } from '@/lib/forecast'
import { reportInput, type StoredReport } from '@/lib/reports/schema'
import { forecastSnapshot } from '@/lib/reports/snapshot'
import { getReportStore } from '@/lib/reports/store'
import { utcToHonoluluLocal } from '@/lib/time'

/**
 * POST a visit report.
 *
 * No accounts. Spam protection is deliberately simple: a honeypot field, a
 * minimum time-on-form, and a per-IP rate limit. Each stored report carries the
 * forecast snapshot for its hour — the calibration dataset.
 */

const PER_IP_PER_HOUR = 5
const MIN_FORM_MS = 3000

const json = (body: unknown, status = 200) => Response.json(body, { status })

export async function POST(request: Request) {
  const store = getReportStore()
  if (!store) return json({ ok: false, error: 'Reports aren’t being saved yet. Please try again later.' }, 503)

  let parsed
  try {
    parsed = reportInput.safeParse(await request.json())
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400)
  }
  if (!parsed.success) return json({ ok: false, error: 'Please answer every question.' }, 400)
  const input = parsed.data

  // Bots: answer as if accepted, store nothing.
  if (input.website) return json({ ok: true })
  if (input.elapsedMs < MIN_FORM_MS) return json({ ok: false, error: 'That was quick — please try again.' }, 400)

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if ((await store.hit(`covecheck:ratelimit:${ip}`, 3600)) > PER_IP_PER_HOUR) {
    return json({ ok: false, error: 'Thanks — that’s plenty of reports for this hour.' }, 429)
  }

  const nowUtc = new Date()
  const date = utcToHonoluluLocal(nowUtc).slice(0, 10)
  const report = await getBeachReport(CROMWELLS)

  const stored: StoredReport = {
    version: 1,
    id: crypto.randomUUID(),
    receivedUtc: nowUtc.toISOString(),
    beachId: CROMWELLS.id,
    date,
    hour: input.hour,
    report: { activity: input.activity, visibility: input.visibility, surge: input.surge, again: input.again, note: input.note, hour: input.hour },
    forecast: forecastSnapshot(report, CROMWELLS, date, input.hour),
  }
  await store.append(JSON.stringify(stored))
  return json({ ok: true })
}
