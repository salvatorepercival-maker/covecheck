'use client'

import { useState } from 'react'
import { SPOT_GUIDE } from '@/lib/beach/spot-guide'
import { liveNote } from '@/lib/conditions/spot'
import type { DayFacts } from '@/lib/facts'
import { formatHour } from '@/lib/format'

/**
 * Numbered markers over Sal's aerial photo of the cove. A marker gets a live
 * line ("Current likely today") when its rule triggers for the day on screen.
 */
export function SpotGuide({ day, hasImage }: { day: DayFacts; hasImage: boolean }) {
  const [active, setActive] = useState<string | null>(null)
  const markers = SPOT_GUIDE.markers.map((m, i) => ({ ...m, n: i + 1, live: liveNote('live' in m ? m.live : undefined, day) }))
  // Mid-change hours come in bursts around each tide turn: list each run, not first-to-last.
  const span = (hours: number[]) => {
    const runs: [number, number][] = []
    for (const h of hours) {
      const last = runs[runs.length - 1]
      if (last && h === last[1] + 1) last[1] = h
      else runs.push([h, h])
    }
    return runs.map(([a, b]) => `${formatHour(a)}–${formatHour(b + 1)}`).join(', ')
  }

  return (
    <section aria-labelledby="spot-heading">
      <h2 id="spot-heading" className="text-[17px] font-semibold tracking-tight">
        Spot guide
      </h2>
      <div className="relative mt-2.5 overflow-hidden rounded-2xl bg-surface-sunk">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- local photo at its natural aspect ratio
          <img src={SPOT_GUIDE.image.src} alt={SPOT_GUIDE.image.alt} className="block w-full" />
        ) : (
          <div className="flex aspect-[4/3] items-end p-3 text-[11px] text-muted" role="img" aria-label="Spot guide image not added yet">
            Aerial photo not added yet — add it at public/spot/cromwells-aerial.jpg
          </div>
        )}
        {markers.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setActive(active === m.id ? null : m.id)}
            aria-label={`${m.n}. ${m.title}`}
            aria-pressed={active === m.id}
            className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-bold shadow ${
              m.live ? 'bg-close text-[#3b2a0c]' : 'bg-[#15232d] text-white'
            } ${active === m.id ? 'ring-2 ring-white ring-offset-2 ring-offset-[#15232d]' : ''}`}
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
          >
            {m.n}
          </button>
        ))}
      </div>
      <ol className="mt-2.5 space-y-2">
        {markers.map((m) => (
          <li
            key={m.id}
            className={`flex gap-3 rounded-2xl p-3 text-sm ${active === m.id ? 'bg-surface ring-1 ring-foreground/20' : 'bg-surface'}`}
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${m.live ? 'bg-close text-[#3b2a0c]' : 'bg-[#15232d] text-white dark:bg-white dark:text-[#15232d]'}`}>
              {m.n}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{m.title}</span>
              <span className="block text-xs leading-snug text-muted">{m.note}</span>
              {m.live ? (
                <span className="mt-1 block text-xs font-semibold text-close-ink">
                  {m.live.note} · {span(m.live.hours)}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
