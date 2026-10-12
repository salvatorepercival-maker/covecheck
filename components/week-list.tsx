import type { Verdict } from '@/lib/engine'
import type { WeekRow } from '@/lib/presentation'

/**
 * The week at a glance. Every row says its call in words; the bar beside it
 * shows how close the day gets to a good family window.
 */

const BAR: Record<Verdict, string> = {
  great: 'bg-go',
  caution: 'bg-close',
  not_recommended: 'bg-skip',
  insufficient_data: 'bg-transparent',
}

export function WeekList({ rows }: { rows: readonly WeekRow[] }) {
  return (
    <section id="week" aria-labelledby="week-heading" className="scroll-mt-4">
      <h2 id="week-heading" className="text-[17px] font-semibold tracking-tight">
        This week
      </h2>
      <ul className="mt-2.5 divide-y divide-border rounded-2xl bg-surface px-4">
        {rows.map((row) => (
          <li key={row.date} className="flex items-center gap-4 py-3">
            <span className="w-10 shrink-0 text-sm font-semibold">{row.dayLabel}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{row.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{row.subtitle}</p>
            </div>
            <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-track" aria-hidden>
              <span
                className={`block h-full rounded-full ${BAR[row.verdict]}`}
                style={{ width: `${Math.round(row.closeness * 100)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-1 text-xs text-muted">Bar shows how close each day gets to good for kids.</p>
    </section>
  )
}
