import { describe, expect, it } from 'vitest'
import { CROMWELLS } from '../beach/cromwells'
import { hazardLevel, windClassFor, WIND_CLASS_WORDS } from './wind'

const classOf = (deg: number) => windClassFor(deg, 'south', CROMWELLS.windClasses)

describe('wind classes at a south-facing beach', () => {
  it('north winds are offshore, south winds onshore, east and west cross-shore', () => {
    expect(classOf(0)).toBe('offshore')
    expect(classOf(60)).toBe('offshore') // ENE trades come over the land here
    expect(classOf(90)).toBe('cross')
    expect(classOf(270)).toBe('cross')
    expect(classOf(180)).toBe('onshore')
    expect(classOf(120)).toBe('onshore')
  })

  it('class boundaries come from the beach config', () => {
    expect(windClassFor(80, 'south', { offshoreHalfArcDeg: 85, onshoreHalfArcDeg: 85 })).toBe('offshore')
    expect(windClassFor(80, 'south', { offshoreHalfArcDeg: 60, onshoreHalfArcDeg: 60 })).toBe('cross')
  })

  it('names classes without safety words', () => {
    expect(Object.values(WIND_CLASS_WORDS)).toEqual(['offshore', 'cross-shore', 'onshore'])
  })
})

describe('NWS hazard level', () => {
  it('splits warnings from everything else', () => {
    expect(hazardLevel('High Surf Warning')).toBe('warning')
    expect(hazardLevel('High Surf Advisory')).toBe('advisory')
    expect(hazardLevel('Flash Flood Watch')).toBe('advisory')
  })
})
