import type { Confidence, Verdict } from '@/lib/engine'
import { HERO_TITLE, confidenceLabel, type HeroWindow } from '@/lib/presentation'
import { BanIcon, CheckCircleIcon, AlertIcon, QuestionIcon } from './icons'
import { ShareButton } from './share-button'

/**
 * The decision, first and largest.
 *
 * Each verdict has its own background, icon shape and word, so it reads without
 * relying on colour. Copy describes the forecast, never the water's safety.
 */

const HERO_BG: Record<Verdict, string> = {
  great: 'bg-hero-go',
  caution: 'bg-hero-close',
  not_recommended: 'bg-hero-skip',
  insufficient_data: 'bg-hero-unknown',
}

const HERO_ICON: Record<Verdict, React.ReactNode> = {
  great: <CheckCircleIcon className="h-8 w-8" />,
  caution: <AlertIcon className="h-8 w-8" />,
  not_recommended: <BanIcon className="h-8 w-8 text-[#f0a08c]" />,
  insufficient_data: <QuestionIcon className="h-8 w-8" />,
}

export function HeroCard({
  verdict,
  eyebrow,
  confidence,
  sentence,
  window,
  nextGood,
  shareText,
}: {
  verdict: Verdict
  /** "Today · Kids snorkeling" */
  eyebrow: string
  confidence: Confidence | null
  sentence: string
  window: HeroWindow | null
  nextGood: { headline: string; detail: string | null } | null
  shareText: string
}) {
  return (
    <section
      aria-labelledby="verdict-heading"
      className={`rounded-3xl p-5 text-white shadow-lg shadow-black/10 ${HERO_BG[verdict]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80">{eyebrow}</p>
        {confidence ? (
          <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium">
            {confidenceLabel(confidence)}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-2.5">
        {HERO_ICON[verdict]}
        <h2 id="verdict-heading" className="text-[2rem] font-bold leading-none tracking-tight">
          {HERO_TITLE[verdict]}
        </h2>
      </div>

      <p className="mt-3 text-[15px] leading-snug text-white/90">{sentence}</p>

      {window ? (
        <div className="mt-4 flex items-end justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-foreground dark:bg-white/95 dark:text-[#15232d]">
          <div>
            <p className="text-xs text-[#66717b]">Best window</p>
            <p className="mt-0.5 text-2xl font-bold tracking-tight">{window.range}</p>
          </div>
          {window.timing ? (
            <p className="text-right text-sm">
              <span className="block text-xs text-[#66717b]">{window.timing.label}</span>
              <span className="font-semibold">{window.timing.value}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {nextGood ? (
        <div className={window ? 'mt-4' : 'mt-4 border-t border-white/15 pt-4'}>
          <p className="text-xs text-white/70">Next good day</p>
          <p className="mt-0.5 font-semibold">{nextGood.headline}</p>
          {nextGood.detail ? <p className="mt-0.5 text-sm text-white/75">{nextGood.detail}</p> : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {window ? <ShareButton text={shareText} /> : null}
        {nextGood ? (
          <a
            href="#week"
            className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#15232d] transition-opacity hover:opacity-90"
          >
            See the week
          </a>
        ) : null}
      </div>
    </section>
  )
}
