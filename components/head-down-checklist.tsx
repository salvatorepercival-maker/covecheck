'use client'

import { useState } from 'react'

/** "Before you head down" — a packing list a parent can tick off. Local only, never stored. */
export function HeadDownChecklist({ items }: { items: readonly string[] }) {
  const [done, setDone] = useState<ReadonlySet<number>>(new Set())

  const toggle = (index: number) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  return (
    <section aria-labelledby="checklist-heading" className="rounded-2xl bg-surface p-4">
      <h2 id="checklist-heading" className="text-[17px] font-semibold tracking-tight">
        Before you head down
      </h2>
      <ul className="mt-2">
        {items.map((item, index) => (
          <li key={item}>
            <label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={done.has(index)}
                onChange={() => toggle(index)}
                className="h-[18px] w-[18px] shrink-0 accent-[var(--go)]"
              />
              <span className={done.has(index) ? 'text-muted line-through' : ''}>{item}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
