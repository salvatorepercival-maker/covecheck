import type { LensId } from '@/lib/lenses/schema'

/** Lens tabs with icons. */

const ICON: Record<LensId, React.ReactNode> = {
  // Snorkel: mask and tube.
  snorkel: (
    <path d="M4 10.5a3.5 3.5 0 0 1 3.5-3.5h5A3.5 3.5 0 0 1 16 10.5v0A2.5 2.5 0 0 1 13.5 13h-1.2a1.5 1.5 0 0 1-1.3-.8l-.2-.4a.9.9 0 0 0-1.6 0l-.2.4a1.5 1.5 0 0 1-1.3.8H6.5A2.5 2.5 0 0 1 4 10.5ZM19 4v11a4 4 0 0 1-4 4h-2" />
  ),
  // Dive: rising bubbles.
  dive: (
    <>
      <circle cx="8" cy="16" r="3.5" />
      <circle cx="15" cy="9" r="2.5" />
      <circle cx="17.5" cy="16.5" r="1.5" />
      <circle cx="10" cy="5.5" r="1.2" />
    </>
  ),
  // Surf: a board.
  surf: <path d="M6 18C6 10 11 4 18 3c-1 7-6 13-12 15Zm0 0 3-3m2.5-6.5 4 4" />,
  // Beach: umbrella.
  beach: (
    <>
      <path d="M3 11a9 9 0 0 1 18 0Z" />
      <path d="M12 11v8m0 0a2 2 0 0 1-4 0" />
    </>
  ),
}

export function LensTabs({
  lenses,
  active,
  onChoose,
  raw,
}: {
  lenses: { id: LensId; name: string }[]
  active: LensId
  onChoose: (id: LensId) => void
  raw: boolean
}) {
  return (
    <div>
      <div role="tablist" aria-label="Activity" className="grid grid-cols-4 gap-1 rounded-2xl bg-surface-sunk p-1">
        {lenses.map((l) => {
          const selected = !raw && active === l.id
          return (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChoose(l.id)}
              className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[12px] font-semibold transition-colors ${
                selected ? 'bg-hero text-hero-ink shadow' : 'text-foreground/75 hover:bg-white/50'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {ICON[l.id]}
              </svg>
              {l.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** "Raw" — turns the lens off for the plain, judgement-free conditions. Lives in the header. */
export function RawSwitch({ raw, onRaw }: { raw: boolean; onRaw: (raw: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold">
      <span className="relative inline-flex h-5 w-9 items-center">
        <input type="checkbox" role="switch" aria-label="Raw conditions" checked={raw} onChange={(e) => onRaw(e.target.checked)} className="peer sr-only" />
        <span className="absolute inset-0 rounded-full bg-surface-sunk transition-colors peer-checked:bg-hero" />
        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
      Raw
    </label>
  )
}
