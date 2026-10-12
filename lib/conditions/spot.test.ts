import { describe, expect, it } from 'vitest'
import { SPOT_GUIDE } from '../beach/spot-guide'
import { dayOf } from '../lenses/test-facts'
import { liveNote, ruleHolds } from './spot'
import { hourFacts } from '../lenses/test-facts'

const channel = SPOT_GUIDE.markers.find((m) => m.id === 'channel')!

describe('spot guide config', () => {
  it('has the six requested markers, positioned inside the image, with placeholder text marked', () => {
    expect(SPOT_GUIDE.markers.map((m) => m.id)).toEqual(['entry', 'reef-flat', 'pocket', 'channel', 'ledge', 'parking'])
    for (const m of SPOT_GUIDE.markers) {
      expect(m.x).toBeGreaterThanOrEqual(0)
      expect(m.x).toBeLessThanOrEqual(100)
      expect(m.y).toBeGreaterThanOrEqual(0)
      expect(m.y).toBeLessThanOrEqual(100)
      expect(`${m.title} ${m.note}`).toMatch(/PLACEHOLDER/)
    }
  })

  it('never uses safety words in live notes', () => {
    for (const m of SPOT_GUIDE.markers) for (const r of ('live' in m ? m.live : undefined) ?? []) expect(r.note).not.toMatch(/\b(safe|unsafe|danger|guarantee)/i)
  })
})

describe('live notes', () => {
  it('channel: current likely only when swell energy and a tide change line up in the same hour', () => {
    const rule = channel.live![0]
    expect(ruleHolds(rule, hourFacts({ swellEnergy: 120, tide: { direction: 'rising', rateFtPerHr: 0.3, nextTurn: null, midChange: true } }))).toBe(true)
    expect(ruleHolds(rule, hourFacts({ swellEnergy: 120, tide: { direction: 'rising', rateFtPerHr: 0.05, nextTurn: null, midChange: false } }))).toBe(false)
    expect(ruleHolds(rule, hourFacts({ swellEnergy: 40, tide: { direction: 'rising', rateFtPerHr: 0.3, nextTurn: null, midChange: true } }))).toBe(false)
  })

  it('reports the daylight hours a rule holds', () => {
    const day = dayOf([7, 8, 9, 10].map((hour) => ({ hour, swellEnergy: 100, tide: { direction: 'rising' as const, rateFtPerHr: 0.3, nextTurn: null, midChange: hour === 8 || hour === 9 } })))
    expect(liveNote(channel.live, day)).toEqual({ note: 'Current likely today', hours: [8, 9] })
    expect(liveNote(undefined, day)).toBeNull()
  })
})
