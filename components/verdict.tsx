import type { Confidence, Verdict } from '@/lib/engine'

/**
 * Verdict presentation.
 *
 * Each verdict carries a distinct icon *shape* as well as a colour and a text
 * label, so the status is legible to someone who cannot distinguish the colours
 * and to someone reading it in bright sunlight on a phone. Colour never carries
 * meaning alone.
 */

export const VERDICT_STYLE: Record<
  Verdict,
  { text: string; bg: string; border: string; dot: string }
> = {
  great: {
    text: 'text-great',
    bg: 'bg-great-bg',
    border: 'border-great/25',
    dot: 'bg-great',
  },
  caution: {
    text: 'text-caution',
    bg: 'bg-caution-bg',
    border: 'border-caution/25',
    dot: 'bg-caution',
  },
  not_recommended: {
    text: 'text-nogo',
    bg: 'bg-nogo-bg',
    border: 'border-nogo/25',
    dot: 'bg-nogo',
  },
  insufficient_data: {
    text: 'text-unknown',
    bg: 'bg-unknown-bg',
    border: 'border-unknown/25',
    dot: 'bg-unknown',
  },
}

/**
 * Distinct silhouettes, not colour-coded variants of one glyph:
 * a calm horizon line, a raised chop, a struck-through swell, an open question.
 */
export function VerdictIcon({ verdict, className = 'h-5 w-5' }: { verdict: Verdict; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (verdict) {
    case 'great':
      // Flat, calm water.
      return (
        <svg {...common}>
          <path d="M3 14c2.5 0 2.5-1.4 5-1.4s2.5 1.4 5 1.4 2.5-1.4 5-1.4 2.2 1.4 3 1.4" />
          <path d="M8 8.5 10.5 11 16 5.5" />
        </svg>
      )
    case 'caution':
      // Raised chop under a warning bar.
      return (
        <svg {...common}>
          <path d="M12 3.5 21.5 19.5H2.5L12 3.5Z" />
          <path d="M12 9.5v4.2" />
          <path d="M12 16.7h.01" />
        </svg>
      )
    case 'not_recommended':
      // Swell struck through.
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.6" />
          <path d="M6.7 6.7l10.6 10.6" />
        </svg>
      )
    default:
      // Unknown state.
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.6" />
          <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.4" />
          <path d="M12 17.2h.01" />
        </svg>
      )
  }
}

const CONFIDENCE_COPY: Record<Confidence, string> = {
  high: 'Based on complete, current data',
  medium: 'Based on data with some gaps',
  low: 'Based on incomplete data',
}

export function ConfidenceNote({ confidence }: { confidence: Confidence }) {
  return (
    <p className="text-sm text-muted">
      <span className="font-medium">Confidence: {confidence}.</span>{' '}
      {CONFIDENCE_COPY[confidence]}
    </p>
  )
}

/** Small inline verdict pill, used in the day strip and window headings. */
export function VerdictPill({ verdict, label }: { verdict: Verdict; label: string }) {
  const style = VERDICT_STYLE[verdict]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.bg} ${style.border} ${style.text}`}
    >
      <VerdictIcon verdict={verdict} className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}
