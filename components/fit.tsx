import type { FactorTag, Fit } from '@/lib/lenses/schema'

/** Fit vocabulary. Never safety words — "fit" describes the activity, not the risk. */

export const FIT_LABEL: Record<Fit | 'unknown', string> = {
  good: 'Good fit',
  mixed: 'Mixed',
  poor: 'Poor fit',
  unknown: 'No call',
}

export const TAG_LABEL: Record<Exclude<FactorTag, 'off'>, string> = {
  good: 'Good',
  mixed: 'Mixed',
  poor: 'Poor',
  unknown: 'No data',
}

export const FIT_CHIP: Record<Fit | 'unknown', string> = {
  good: 'bg-go-tint text-go',
  mixed: 'bg-close-tint text-close-ink',
  poor: 'bg-skip-tint text-skip-ink',
  unknown: 'bg-unknown-tint text-muted',
}

export const FIT_BLOCK: Record<Fit | 'unknown', string> = {
  good: 'bg-go',
  mixed: 'bg-close',
  poor: 'bg-unknown',
  unknown: 'border border-dashed border-muted/50 bg-transparent',
}

export function FitChip({ fit, short = false }: { fit: Fit | 'unknown'; short?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${FIT_CHIP[fit]}`}>
      {short ? TAG_LABEL[fit] : FIT_LABEL[fit]}
    </span>
  )
}
