import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { CROMWELLS } from '../beach/cromwells'
import { DEFAULT_LENSES } from '../lenses/defaults'
import { tideSwellLimits } from '../lenses/evaluate'
import type { TideSwellRule } from '../lenses/schema'
import { exposedSwell } from '../normalize'

/**
 * Backtest: tide-first swell (DECISIONS #24) vs the fixed swell limits of #29,
 * over the same window as the energy backtest (2025-04-14 → 2026-10-11,
 * daylight 6 AM–6 PM). Swell from Open-Meteo marine (default model, direction
 * filtered); tide from NOAA CO-OPS 1612340 hourly predictions.
 *
 * Swell only: each day is judged on the waves factor alone (good if 2+
 * consecutive good hours, mixed if any good or mixed hour, else poor). The NWS
 * surf forecast has no archive to replay, so neither rule here includes it —
 * in production the old day-level NWS wall made even more days Poor.
 *
 *   OUT=/tmp/tide.md npx vitest run --config vitest.live.config.mts lib/backtest/tide-swell.live.ts
 */

const START = '2025-04-14'
const END = '2026-10-11'
const VARS = ['swell_wave', 'secondary_swell_wave', 'tertiary_swell_wave', 'wind_wave'].flatMap((p) => [`${p}_height`, `${p}_period`, `${p}_direction`])
type Tag = 'good' | 'mixed' | 'poor'
const ceil = (v: number, good: number, mixed: number | null): Tag => (v <= good ? 'good' : mixed === null || v <= mixed ? 'mixed' : 'poor')
const OLD = { snorkel: { good: 90, mixed: 160 }, beach: { good: 40, mixed: 160 } } as const

async function tides(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (const [b, e] of [['20250414', '20251231'], ['20260101', '20261011']]) {
    const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=covecheck&begin_date=${b}&end_date=${e}&datum=MLLW&station=${CROMWELLS.tideStationId}&time_zone=lst_ldt&units=english&interval=h&format=json`
    const d = (await (await fetch(url)).json()) as { predictions: { t: string; v: string }[] }
    for (const p of d.predictions) out.set(p.t.replace(' ', 'T'), Number(p.v))
  }
  return out
}

it('tide-first swell backtest', async () => {
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${CROMWELLS.cells.marine.requestedLat}&longitude=${CROMWELLS.cells.marine.requestedLon}&hourly=${VARS.join(',')}&timezone=Pacific/Honolulu&length_unit=imperial&start_date=${START}&end_date=${END}`
  const [marine, tide] = await Promise.all([fetch(marineUrl).then((r) => r.json() as Promise<{ hourly: Record<string, (number | null)[]> & { time: string[] } }>), tides()])
  const h = marine.hourly

  type Row = { time: string; date: string; hour: number; energy: number; ft: number; period: number | null; tide: number }
  const rows: Row[] = []
  h.time.forEach((time, i) => {
    const hour = Number(time.slice(11, 13))
    if (hour < 6 || hour > 18) return
    const t = tide.get(time)
    if (t === undefined) return
    const parts = (['swell_wave', 'secondary_swell_wave', 'tertiary_swell_wave', 'wind_wave'] as const).map((p) => ({
      partition: (p === 'swell_wave' ? 'swell' : p === 'wind_wave' ? 'wind_wave' : p.replace('_wave', '')) as 'swell' | 'secondary_swell' | 'tertiary_swell' | 'wind_wave',
      heightFt: h[`${p}_height`]?.[i] ?? null,
      directionDeg: h[`${p}_direction`]?.[i] ?? null,
      periodSec: h[`${p}_period`]?.[i] ?? null,
    }))
    const x = exposedSwell(parts, CROMWELLS)
    if (x.energy === null) return
    const swellFt = Math.sqrt(x.counted.filter((p) => p.partition !== 'wind_wave').reduce((s, p) => s + p.heightFt ** 2, 0))
    rows.push({ time, date: time.slice(0, 10), hour, energy: x.energy, ft: swellFt, period: x.periodSec, tide: t })
  })

  const dayFit = (tags: Tag[]): Tag => {
    for (let i = 1; i < tags.length; i++) if (tags[i] === 'good' && tags[i - 1] === 'good') return 'good'
    return tags.some((t) => t !== 'poor') ? 'mixed' : 'poor'
  }

  const lines: string[] = [
    '# Tide-first swell backtest',
    '',
    `Window ${START} → ${END}, daylight 6 AM–6 PM: **${rows.length} hours** with exposed swell energy and a NOAA tide.`,
    'Each day judged on swell alone (the NWS surf forecast has no archive to replay; neither rule includes it).',
    '',
  ]
  for (const lens of ['snorkel', 'beach'] as const) {
    const rule = DEFAULT_LENSES[lens].factors.waves as TideSwellRule
    const byDate = new Map<string, Row[]>()
    for (const r of rows) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r)
    const counts = { days: 0, oldPoor: 0, newPoor: 0, poorToMixed: 0, poorToGood: 0, mixedToGood: 0, worse: 0 }
    const passing: { date: string; energy: number; ft: number; period: number | null; tide: number; fit: Tag }[] = []
    for (const [date, rs] of byDate) {
      rs.sort((a, b) => a.hour - b.hour)
      const oldTags = rs.map((r) => ceil(r.energy, OLD[lens].good, OLD[lens].mixed))
      const newTags = rs.map((r) => (r.energy >= rule.absoluteEnergy ? 'poor' : ceil(r.energy, tideSwellLimits(rule, r.tide).good, tideSwellLimits(rule, r.tide).mixed)))
      const o = dayFit(oldTags)
      const n = dayFit(newTags)
      counts.days++
      if (o === 'poor') counts.oldPoor++
      if (n === 'poor') counts.newPoor++
      if (o === 'poor' && n === 'mixed') counts.poorToMixed++
      if (o === 'poor' && n === 'good') counts.poorToGood++
      if (o === 'mixed' && n === 'good') counts.mixedToGood++
      if ((o === 'good' && n !== 'good') || (o === 'mixed' && n === 'poor')) counts.worse++
      // Biggest swell that still passes at low tide.
      const lowPass = rs.filter((r, i) => newTags[i] !== 'poor' && r.tide <= rule.lowTideFt)
      if (n !== 'poor' && lowPass.length) {
        const top = lowPass.reduce((a, b) => (b.energy > a.energy ? b : a))
        passing.push({ date, energy: top.energy, ft: top.ft, period: top.period, tide: top.tide, fit: n })
      }
    }
    lines.push(
      `## ${DEFAULT_LENSES[lens].name}`,
      '',
      `| Days | Poor before | Poor after | Poor → Mixed | Poor → Good | Mixed → Good | Got worse |`,
      '| --- | --- | --- | --- | --- | --- | --- |',
      `| ${counts.days} | ${counts.oldPoor} | ${counts.newPoor} | ${counts.poorToMixed} | ${counts.poorToGood} | ${counts.mixedToGood} | ${counts.worse} |`,
      '',
      'Largest swell that still passed at low tide:',
      '',
      '| Date | Swell | Energy | Tide | Day fit |',
      '| --- | --- | --- | --- | --- |',
      ...passing
        .sort((a, b) => b.energy - a.energy)
        .slice(0, 8)
        .map((p) => `| ${p.date} | ${p.ft.toFixed(1)} ft${p.period ? ` at ${Math.round(p.period)} s` : ''} | ${Math.round(p.energy)} | ${p.tide.toFixed(1)} ft | ${p.fit} |`),
      '',
    )
  }
  // Sensitivity: the snorkel low-band limits, tighter and looser than the default.
  lines.push('## Snorkel low-tide limit options', '', '| Low-tide limits (good / mixed) | Poor days | Good days | Mixed days |', '| --- | --- | --- | --- |')
  const base = DEFAULT_LENSES.snorkel.factors.waves as TideSwellRule
  const byDate = new Map<string, Row[]>()
  for (const r of rows) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r)
  for (const low of [{ good: 200, mixed: 300 }, { good: 250, mixed: 360 }, { good: 300, mixed: 420 }]) {
    const rule = { ...base, low }
    const c = { poor: 0, good: 0, mixed: 0 }
    for (const rs of byDate.values()) {
      rs.sort((a, b) => a.hour - b.hour)
      const tags = rs.map((r) => (r.energy >= rule.absoluteEnergy ? 'poor' : ceil(r.energy, tideSwellLimits(rule, r.tide).good, tideSwellLimits(rule, r.tide).mixed)))
      c[dayFit(tags)]++
    }
    lines.push(`| ${low.good} / ${low.mixed}${low.good === base.low.good ? ' (default)' : ''} | ${c.poor} | ${c.good} | ${c.mixed} |`)
  }
  writeFileSync(process.env.OUT ?? 'tide-swell-backtest.md', lines.join('\n') + '\n')
}, 180_000)
