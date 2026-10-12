import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { CROMWELLS } from '../beach/cromwells'
import { exposedSwell } from '../normalize'

/**
 * Backtest: judge swell by height (v2) vs by energy (Σ H²T) over the history
 * Open-Meteo serves for the pinned marine cell. Writes a markdown report to
 * $OUT (default ./swell-energy-backtest.md). Run:
 *   OUT=/tmp/bt.md npx vitest run --config vitest.live.config.mts lib/backtest/swell-energy.live.ts
 *
 * History window starts 2025-04-14: before that the default model has no
 * secondary swell partition, and a south swell hiding under the trade windswell
 * lives there (DECISIONS #14), so earlier hours would under-report exposed energy.
 */

const START = '2025-04-14'
const VARS = [
  'swell_wave_height', 'swell_wave_period', 'swell_wave_direction',
  'secondary_swell_wave_height', 'secondary_swell_wave_period', 'secondary_swell_wave_direction',
  'tertiary_swell_wave_height', 'tertiary_swell_wave_period', 'tertiary_swell_wave_direction',
  'wind_wave_height', 'wind_wave_period', 'wind_wave_direction',
]

type Rule = { kind: 'ceiling'; good: number; mixed: number } | { kind: 'range'; good: [number, number]; mixed: [number, number] }
const HEIGHT_RULES: Record<string, Rule> = {
  snorkel: { kind: 'ceiling', good: 3, mixed: 4 },
  dive: { kind: 'ceiling', good: 2, mixed: 3 },
  surf: { kind: 'range', good: [2, 6], mixed: [1, 8] },
  beach: { kind: 'ceiling', good: 2, mixed: 4 },
}
const toEnergy = (rule: Rule, t: number): Rule =>
  rule.kind === 'ceiling'
    ? { kind: 'ceiling', good: rule.good ** 2 * t, mixed: rule.mixed ** 2 * t }
    : { kind: 'range', good: [rule.good[0] ** 2 * t, rule.good[1] ** 2 * t], mixed: [rule.mixed[0] ** 2 * t, rule.mixed[1] ** 2 * t] }
const tag = (rule: Rule, v: number) =>
  rule.kind === 'ceiling'
    ? v <= rule.good ? 'good' : v <= rule.mixed ? 'mixed' : 'poor'
    : v >= rule.good[0] && v <= rule.good[1] ? 'good' : v >= rule.mixed[0] && v <= rule.mixed[1] ? 'mixed' : 'poor'
const RANK = { good: 0, mixed: 1, poor: 2 } as const

it('swell energy backtest', async () => {
  const end = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${CROMWELLS.cells.marine.requestedLat}&longitude=${CROMWELLS.cells.marine.requestedLon}&hourly=${VARS.join(',')}&timezone=Pacific/Honolulu&length_unit=imperial&start_date=${START}&end_date=${end}`
  const data = (await (await fetch(url)).json()) as { hourly: Record<string, (number | null)[]> & { time: string[] } }
  const h = data.hourly

  type Row = { time: string; heightFt: number; energy: number; periodSec: number | null }
  const rows: Row[] = []
  h.time.forEach((time, i) => {
    const hour = Number(time.slice(11, 13))
    if (hour < 6 || hour > 18) return
    const parts = (['swell', 'secondary_swell', 'tertiary_swell', 'wind_wave'] as const).map((name) => {
      const key = name === 'swell' ? 'swell_wave' : name === 'wind_wave' ? 'wind_wave' : `${name}_wave`
      return { partition: name, heightFt: h[`${key}_height`]?.[i] ?? null, directionDeg: h[`${key}_direction`]?.[i] ?? null, periodSec: h[`${key}_period`]?.[i] ?? null }
    })
    const x = exposedSwell(parts, CROMWELLS)
    if (x.energy === null) return
    // Compare like with like: height of the exposed SWELL partitions only.
    const swells = x.counted.filter((p) => p.partition !== 'wind_wave')
    const heightFt = Math.sqrt(swells.reduce((s, p) => s + p.heightFt ** 2, 0))
    rows.push({ time, heightFt, energy: x.energy, periodSec: x.periodSec })
  })

  const periods = rows.filter((r) => r.periodSec !== null && r.energy > 0).map((r) => r.periodSec!).sort((a, b) => a - b)
  const pct = (q: number) => periods[Math.floor(q * (periods.length - 1))]
  // Energy-weighted mean period: the period at which height and energy rules agree on average.
  const ew = rows.reduce((s, r) => s + r.energy, 0) / rows.reduce((s, r) => s + r.heightFt ** 2, 0)

  const lines: string[] = []
  lines.push(`# Swell energy backtest`, '', `Window ${START} → ${end}, daylight hours 6 AM–6 PM: **${rows.length} hours** with exposed swell energy.`, '')
  lines.push(`Exposed swell period (energy > 0): p10 ${pct(0.1)} s · median ${pct(0.5)} s · p90 ${pct(0.9)} s. Energy-weighted mean period **${ew.toFixed(1)} s**.`, '')
  lines.push('Energy rules below are the v2 height rules converted at a reference period T (threshold² × T).', '')
  lines.push('| Lens | T (s) | Energy thresholds | Hours disagreeing | Energy stricter | Energy looser |', '| --- | --- | --- | --- | --- | --- |')

  const examples: string[] = []
  for (const [lens, rule] of Object.entries(HEIGHT_RULES)) {
    for (const t of [...new Set([Math.round(ew), pct(0.5), 12, 14].map((v) => Math.round(v)))].sort((a, b) => a - b)) {
      const e = toEnergy(rule, t)
      let differ = 0, stricter = 0, looser = 0
      for (const r of rows) {
        const a = tag(rule, r.heightFt), b = tag(e, r.energy)
        if (a === b) continue
        differ++
        // For a range rule "stricter" means further from good.
        if (RANK[b] > RANK[a]) stricter++
        else looser++
        if (lens === 'snorkel' && t === Math.round(ew) && examples.length < 8 && (examples.length < 4 ? RANK[b] > RANK[a] : RANK[b] < RANK[a])) {
          examples.push(`| ${r.time} | ${r.heightFt.toFixed(1)} ft | ${r.periodSec ?? '?'} s | ${r.energy} | ${a} → ${b} |`)
        }
      }
      const fmt = e.kind === 'ceiling' ? `≤${e.good.toFixed(0)} / ≤${e.mixed.toFixed(0)}` : `${e.good.map((v) => v.toFixed(0)).join('–')} / ${e.mixed.map((v) => v.toFixed(0)).join('–')}`
      lines.push(`| ${lens} | ${t}${t === Math.round(ew) ? ' (energy-weighted mean)' : t === Math.round(pct(0.5)) ? ' (median)' : ''} | ${fmt} | ${differ} (${((differ / rows.length) * 100).toFixed(1)}%) | ${stricter} | ${looser} |`)
    }
  }
  lines.push('', `Example snorkel disagreements at T = ${Math.round(ew)} s (height tag → energy tag):`, '', '| Hour | Swell height | Period | Energy | Tag |', '| --- | --- | --- | --- | --- |', ...examples)
  writeFileSync(process.env.OUT ?? 'swell-energy-backtest.md', lines.join('\n') + '\n')
}, 120_000)
