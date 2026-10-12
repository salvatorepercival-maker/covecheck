import type { FactorRow, Tone } from '@/lib/presentation'
import { AlertIcon, ThermometerIcon, TideIcon, WavesIcon, WindIcon } from './icons'

/**
 * "What's deciding it": one row per condition, each with a plain-language chip
 * taken from the engine's own reasons. Waves and wind add a bar with the family
 * limit marked, so how far over (or under) it reads at a glance.
 */

const ICON: Record<FactorRow['key'], React.ReactNode> = {
  waves: <WavesIcon />,
  wind: <WindIcon />,
  tide: <TideIcon />,
  water: <ThermometerIcon />,
  advisories: <AlertIcon />,
}

export const CHIP_TONE: Record<Tone, string> = {
  good: 'bg-go-tint text-go',
  warn: 'bg-close-tint text-close-ink',
  bad: 'bg-skip-tint text-skip-ink',
  neutral: 'bg-unknown-tint text-muted',
}

const BAR_TONE: Record<Tone, string> = {
  good: 'bg-go',
  warn: 'bg-close',
  bad: 'bg-skip',
  neutral: 'bg-muted/50',
}

export function DecidingFactors({ rows, atLabel }: { rows: readonly FactorRow[]; atLabel: string | null }) {
  return (
    <section aria-labelledby="factors-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="factors-heading" className="text-[17px] font-semibold tracking-tight">
          What&rsquo;s deciding it
        </h2>
        {atLabel ? <span className="text-xs text-muted">{atLabel}</span> : null}
      </div>
      <ul className="mt-2.5 divide-y divide-border rounded-2xl bg-surface px-4">
        {rows.map((row) => (
          <li key={row.key} className="py-3.5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-muted">{ICON[row.key]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">{row.label}</p>
                    <p className="mt-0.5 text-sm text-muted">{row.detail}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP_TONE[row.tone]}`}>
                    {row.chip}
                  </span>
                </div>
                {row.bar ? (
                  <div className="relative mt-2.5 h-1.5 rounded-full bg-track" aria-hidden>
                    <div
                      className={`h-full rounded-full ${BAR_TONE[row.tone]}`}
                      style={{ width: `${Math.max(3, row.bar.fraction * 100)}%` }}
                    />
                    <span
                      className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-foreground/70"
                      style={{ left: `${row.bar.marker * 100}%` }}
                    />
                  </div>
                ) : null}
                {row.note ? <p className="mt-1.5 text-xs text-muted">{row.note}</p> : null}
                {row.caveat ? <p className="mt-1 text-xs font-medium text-close-ink">{row.caveat}</p> : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
