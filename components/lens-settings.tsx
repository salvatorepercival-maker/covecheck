'use client'

import { useState } from 'react'
import { ENABLE_TEMPLATES } from '@/lib/lenses/defaults'
import type { FactorId, FactorRule, Fit, Lens, LensOverrides } from '@/lib/lenses/schema'

/**
 * "Edit" for a lens: every threshold the lens uses, editable, per lens.
 *
 * Saved in this browser only. Overrides change how CoveCheck describes the fit
 * for this viewer; they never change the forecast itself.
 */

const FACTOR_LABEL: Record<FactorId, { label: string; unit: string }> = {
  waves: { label: 'Swell energy (H² × T; 3 ft at 10 s = 90)', unit: 'ft²·s' },
  chop: { label: 'Chop (wind waves)', unit: 'ft' },
  wind: { label: 'Wind', unit: 'mph' },
  tide: { label: 'Tide outside the reef band', unit: '' },
  clarity: { label: 'Water clarity', unit: 'ft' },
  uv: { label: 'UV index', unit: '' },
  rain: { label: 'Rain chance', unit: '%' },
  storms: { label: 'Thunderstorms', unit: '' },
  waterTemp: { label: 'Water temp', unit: '°F' },
  waterQuality: { label: 'Health Dept. advisory', unit: '' },
  jellyfish: { label: 'Box jellyfish expected', unit: '' },
  advisories: { label: 'Weather Service advisory / warning', unit: '' },
  closures: { label: 'Beach or shark-sighting closure', unit: '' },
  tideFlow: { label: 'Tide mid-change (strongest flow)', unit: '' },
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted">
      {label}
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={value ?? ''}
        placeholder="none"
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground"
      />
    </label>
  )
}

function FitSelect({ value, onChange }: { value: Fit; onChange: (fit: Fit) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Fit)}
      className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
    >
      <option value="good">Doesn&rsquo;t matter</option>
      <option value="mixed">Makes it mixed</option>
      <option value="poor">Makes it poor</option>
    </select>
  )
}

function RuleEditor({ rule, unit, onChange }: { rule: FactorRule; unit: string; onChange: (rule: FactorRule) => void }) {
  const u = unit ? ` (${unit})` : ''
  switch (rule.kind) {
    case 'ceiling':
      return (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={`Good up to${u}`} value={rule.good} onChange={(v) => onChange({ ...rule, good: v ?? rule.good })} />
          <NumberField label={`Mixed up to${u}`} value={rule.mixed} onChange={(v) => onChange({ ...rule, mixed: v })} />
        </div>
      )
    case 'floor':
      return (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={`Good from${u}`} value={rule.good} onChange={(v) => onChange({ ...rule, good: v ?? rule.good })} />
          <NumberField label={`Mixed from${u}`} value={rule.mixed} onChange={(v) => onChange({ ...rule, mixed: v })} />
        </div>
      )
    case 'range':
      return (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={`Good from${u}`} value={rule.good[0]} onChange={(v) => onChange({ ...rule, good: [v ?? rule.good[0], rule.good[1]] })} />
          <NumberField label={`Good to${u}`} value={rule.good[1]} onChange={(v) => onChange({ ...rule, good: [rule.good[0], v ?? rule.good[1]] })} />
          <NumberField label={`Mixed from${u}`} value={rule.mixed[0]} onChange={(v) => onChange({ ...rule, mixed: [v ?? rule.mixed[0], rule.mixed[1]] })} />
          <NumberField label={`Mixed to${u}`} value={rule.mixed[1]} onChange={(v) => onChange({ ...rule, mixed: [rule.mixed[0], v ?? rule.mixed[1]] })} />
        </div>
      )
    case 'wind': {
      const classes = [
        ['offshore', 'gustOffshore', 'Offshore'],
        ['cross', 'gustCross', 'Cross-shore'],
        ['onshore', 'gustOnshore', 'Onshore'],
      ] as const
      return (
        <div className="space-y-3">
          {classes.map(([key, gustKey, name]) => (
            <div key={key} className="grid grid-cols-4 gap-2">
              <NumberField label={`${name} good`} value={rule[key].good} onChange={(v) => onChange({ ...rule, [key]: { ...rule[key], good: v ?? rule[key].good } })} />
              <NumberField label="mixed" value={rule[key].mixed} onChange={(v) => onChange({ ...rule, [key]: { ...rule[key], mixed: v } })} />
              <NumberField label="gust good" value={rule[gustKey].good} onChange={(v) => onChange({ ...rule, [gustKey]: { ...rule[gustKey], good: v ?? rule[gustKey].good } })} />
              <NumberField label="gust mixed" value={rule[gustKey].mixed} onChange={(v) => onChange({ ...rule, [gustKey]: { ...rule[gustKey], mixed: v } })} />
            </div>
          ))}
          {rule.offshoreNoLooserThanCross ? (
            <p className="text-[11px] text-muted">Offshore is never judged more loosely than cross-shore: it pushes swimmers out to sea.</p>
          ) : null}
        </div>
      )
    }
    case 'hazard':
      return (
        <div className="grid grid-cols-2 gap-2 text-[11px] text-muted">
          <label className="flex flex-col gap-1">Advisory<FitSelect value={rule.advisory} onChange={(fit) => onChange({ ...rule, advisory: fit })} /></label>
          <label className="flex flex-col gap-1">Warning<FitSelect value={rule.warning} onChange={(fit) => onChange({ ...rule, warning: fit })} /></label>
        </div>
      )
    case 'tideBand':
      return <FitSelect value={rule.outside} onChange={(fit) => onChange({ ...rule, outside: fit })} />
    case 'flag':
      return <FitSelect value={rule.whenPresent} onChange={(fit) => onChange({ ...rule, whenPresent: fit })} />
    default:
      return null
  }
}

export function LensSettings({
  lens,
  defaults,
  onSave,
  onClose,
}: {
  /** The lens as currently in effect (defaults + overrides). */
  lens: Lens
  defaults: Lens
  onSave: (overrides: LensOverrides | null) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(lens.factors)
  const factors = (Object.keys(draft) as FactorId[]).filter((id) => draft[id].kind !== 'off')
  const offFactors = (Object.keys(draft) as FactorId[]).filter((id) => draft[id].kind === 'off' && ENABLE_TEMPLATES[id])

  function save() {
    const overrides: LensOverrides = {}
    for (const id of Object.keys(draft) as FactorId[]) {
      if (JSON.stringify(draft[id]) !== JSON.stringify(defaults.factors[id])) overrides[id] = draft[id]
    }
    onSave(Object.keys(overrides).length ? overrides : null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="lens-settings-heading">
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="lens-settings-heading" className="text-lg font-semibold">
              Your {lens.name.toLowerCase()} settings
            </h2>
            <p className="mt-0.5 text-xs text-muted">Saved in this browser. They change how the fit is judged, not the forecast.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-sm text-muted hover:bg-surface-sunk" aria-label="Close">
            ✕
          </button>
        </div>

        <ul className="mt-4 space-y-4">
          {factors.map((id) => (
            <li key={id} className="rounded-2xl bg-surface p-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{FACTOR_LABEL[id].label}</p>
                {ENABLE_TEMPLATES[id] ? (
                  <button type="button" onClick={() => setDraft({ ...draft, [id]: { kind: 'off' } })} className="text-xs text-muted underline">
                    Turn off
                  </button>
                ) : null}
              </div>
              <RuleEditor rule={draft[id]} unit={FACTOR_LABEL[id].unit} onChange={(rule) => setDraft({ ...draft, [id]: rule })} />
            </li>
          ))}
        </ul>

        {offFactors.length ? (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted">Not a factor for {lens.activity}</p>
            <ul className="mt-2 space-y-2">
              {offFactors.map((id) => (
                <li key={id} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3.5 py-2.5 text-sm">
                  {FACTOR_LABEL[id].label}
                  <button type="button" onClick={() => setDraft({ ...draft, [id]: ENABLE_TEMPLATES[id]! })} className="text-xs font-semibold underline">
                    Turn on
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="sticky bottom-0 mt-4 flex gap-2 bg-background pt-2">
          <button
            type="button"
            onClick={() => onSave(null)}
            className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold"
          >
            Reset to defaults
          </button>
          <button type="button" onClick={save} className="flex-1 rounded-xl bg-[#15232d] px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-[#15232d]">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
