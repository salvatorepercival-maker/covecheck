import { readLastChecked, recordCheck } from '@/lib/beach/closure-checks'
import { utcToHonoluluLocal } from '@/lib/time'

/**
 * GET: the last hand check for closures (public).
 * POST: record "I checked today — no closures". Owner only — needs
 * `Authorization: Bearer $CALIBRATION_TOKEN`, so a stranger can't mark the
 * beach as checked.
 */
export async function GET() {
  return Response.json({ ok: true, lastChecked: await readLastChecked() })
}

export async function POST(request: Request) {
  const token = process.env.CALIBRATION_TOKEN
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const today = utcToHonoluluLocal(new Date()).slice(0, 10)
  try {
    await recordCheck(today)
  } catch {
    return Response.json({ ok: false, error: 'store not configured' }, { status: 503 })
  }
  return Response.json({ ok: true, lastChecked: today })
}
