'use client'

import { useEffect, useState } from 'react'

/**
 * Private calibration page. The token is typed once and kept in this tab's
 * session storage — never in the URL, where it would end up in logs.
 */

type Option = { label: string; detail: string; recommended?: boolean }
type Data = {
  reports: number
  clarityBiasFt: number | null
  findings: { kind: string; date: string; hour: number; summary: string }[]
  lensAgreement: { lens: string; reports: number; agree: number; tooStrict: number; tooLoose: number }[]
  suggestions: { id: string; title: string; evidence: string; options: Option[] }[]
  recent: { id: string; date: string; hour: number; report: { activity: string; visibility: string; surge: string; again: string; note: string } }[]
}

const KEY = 'covecheck.calibrationToken'

export function CalibrationView() {
  const [token, setToken] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load(t: string) {
    setError(null)
    const res = await fetch('/api/reports/calibration', { headers: { Authorization: `Bearer ${t}` } })
    if (res.status === 401) return setError('That token was not accepted.')
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`)
    try {
      sessionStorage.setItem(KEY, t)
    } catch {
      /* not remembered */
    }
    setData((await res.json()) as Data)
  }

  useEffect(() => {
    let saved = ''
    try {
      saved = sessionStorage.getItem(KEY) ?? ''
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of a saved token
    if (saved) void load(saved)
  }, [])

  if (!data) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void load(token)
        }}
        className="space-y-3"
      >
        <h1 className="text-2xl font-bold tracking-tight">Calibration</h1>
        <p className="text-sm text-muted">Private. Enter your calibration token.</p>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm" autoComplete="off" />
        {error ? <p className="text-sm text-skip-ink">{error}</p> : null}
        <button type="submit" className="w-full rounded-xl bg-[#15232d] px-4 py-3 text-sm font-semibold text-white">
          Open
        </button>
      </form>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calibration</h1>
        <p className="mt-1 text-sm text-muted">
          {data.reports} visit report{data.reports === 1 ? '' : 's'}. Suggestions only — nothing changes until you decide.
          {data.clarityBiasFt !== null ? ` Clarity estimate off by ${data.clarityBiasFt > 0 ? '+' : ''}${data.clarityBiasFt} ft on average.` : ''}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold">Decisions</h2>
        {data.suggestions.map((s) => (
          <div key={s.id} className="rounded-2xl bg-surface p-4">
            <p className="font-semibold">{s.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{s.evidence}</p>
            <ul className="mt-3 space-y-2">
              {s.options.map((o) => (
                <li key={o.label} className={`rounded-xl px-3 py-2 text-sm ${o.recommended ? 'bg-go-tint' : 'bg-surface-sunk'}`}>
                  <span className="font-medium">{o.label}</span>
                  {o.recommended ? <span className="ml-2 text-[11px] font-semibold text-go">Recommended</span> : null}
                  <span className="block text-xs text-muted">{o.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-[17px] font-semibold">Lens fit vs &ldquo;would go again&rdquo;</h2>
        {data.lensAgreement.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No reports with a lens fit yet.</p>
        ) : (
          <table className="mt-2 w-full overflow-hidden rounded-2xl bg-surface text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="p-2.5">Lens</th>
                <th className="p-2.5">Reports</th>
                <th className="p-2.5">Agree</th>
                <th className="p-2.5">Too strict</th>
                <th className="p-2.5">Too loose</th>
              </tr>
            </thead>
            <tbody>
              {data.lensAgreement.map((a) => (
                <tr key={a.lens} className="border-t border-border">
                  <td className="p-2.5 capitalize">{a.lens}</td>
                  <td className="p-2.5">{a.reports}</td>
                  <td className="p-2.5">{a.agree}</td>
                  <td className="p-2.5">{a.tooStrict}</td>
                  <td className="p-2.5">{a.tooLoose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-[17px] font-semibold">Disagreements</h2>
        <ul className="mt-2 space-y-2">
          {data.findings.length === 0 ? <li className="text-sm text-muted">None yet.</li> : null}
          {data.findings.map((f, i) => (
            <li key={`${f.date}-${f.hour}-${f.kind}-${i}`} className="rounded-xl bg-surface p-3 text-sm">
              <span className="text-xs font-semibold uppercase text-muted">
                {f.kind} · {f.date} {f.hour}:00
              </span>
              <span className="block">{f.summary}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-[17px] font-semibold">Recent reports</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {data.recent.map((r) => (
            <li key={r.id} className="rounded-xl bg-surface p-3">
              <span className="text-xs text-muted">
                {r.date} {r.hour}:00 · {r.report.activity}
              </span>
              <span className="block">
                Visibility {r.report.visibility} ft · surge {r.report.surge} · go again: {r.report.again}
              </span>
              {r.report.note ? <span className="block text-xs text-muted">{r.report.note}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
