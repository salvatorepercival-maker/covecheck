import { describe, expect, it } from 'vitest'
import {
  angularDistanceDeg,
  combineWaveHeightsFt,
  isDirectionInAnyRange,
  isDirectionInRange,
  normalizeDeg,
} from './geo'

describe('normalizeDeg', () => {
  it('folds values into [0, 360)', () => {
    expect(normalizeDeg(0)).toBe(0)
    expect(normalizeDeg(360)).toBe(0)
    expect(normalizeDeg(370)).toBe(10)
    expect(normalizeDeg(-10)).toBe(350)
    expect(normalizeDeg(-370)).toBe(350)
    expect(normalizeDeg(720 + 45)).toBe(45)
  })
})

describe('isDirectionInRange', () => {
  const cromwells = { fromDeg: 135, toDeg: 225 }

  it('includes both endpoints', () => {
    expect(isDirectionInRange(135, cromwells)).toBe(true)
    expect(isDirectionInRange(225, cromwells)).toBe(true)
  })

  it('includes the interior and excludes the exterior', () => {
    expect(isDirectionInRange(180, cromwells)).toBe(true)
    expect(isDirectionInRange(134.9, cromwells)).toBe(false)
    expect(isDirectionInRange(225.1, cromwells)).toBe(false)
  })

  it('excludes the trade-wind easterlies that motivated the exposure window', () => {
    // The August 2026 calibration: primary swell arrived from 83°, and the total
    // sea state from 104°. Both must fall outside Cromwell's window.
    expect(isDirectionInRange(83, cromwells)).toBe(false)
    expect(isDirectionInRange(104, cromwells)).toBe(false)
  })

  describe('arcs that wrap through north', () => {
    const northFacing = { fromDeg: 315, toDeg: 45 }

    it('includes values on both sides of 0°', () => {
      expect(isDirectionInRange(315, northFacing)).toBe(true)
      expect(isDirectionInRange(350, northFacing)).toBe(true)
      expect(isDirectionInRange(0, northFacing)).toBe(true)
      expect(isDirectionInRange(360, northFacing)).toBe(true)
      expect(isDirectionInRange(20, northFacing)).toBe(true)
      expect(isDirectionInRange(45, northFacing)).toBe(true)
    })

    it('excludes the complementary arc', () => {
      expect(isDirectionInRange(46, northFacing)).toBe(false)
      expect(isDirectionInRange(180, northFacing)).toBe(false)
      expect(isDirectionInRange(314, northFacing)).toBe(false)
    })

    it('handles unnormalized inputs', () => {
      expect(isDirectionInRange(-10, northFacing)).toBe(true)
      expect(isDirectionInRange(380, northFacing)).toBe(true)
    })
  })

  it('treats a zero-width range as a single bearing', () => {
    expect(isDirectionInRange(180, { fromDeg: 180, toDeg: 180 })).toBe(true)
    expect(isDirectionInRange(181, { fromDeg: 180, toDeg: 180 })).toBe(false)
  })
})

describe('isDirectionInAnyRange', () => {
  const ranges = [
    { fromDeg: 135, toDeg: 225 },
    { fromDeg: 340, toDeg: 20 },
  ]

  it('matches any arc, including a wrapping one', () => {
    expect(isDirectionInAnyRange(180, ranges)).toBe(true)
    expect(isDirectionInAnyRange(350, ranges)).toBe(true)
    expect(isDirectionInAnyRange(10, ranges)).toBe(true)
    expect(isDirectionInAnyRange(90, ranges)).toBe(false)
  })

  it('is false for an empty range list', () => {
    expect(isDirectionInAnyRange(180, [])).toBe(false)
  })
})

describe('angularDistanceDeg', () => {
  it('never exceeds 180 and measures the short way around', () => {
    expect(angularDistanceDeg(0, 10)).toBe(10)
    expect(angularDistanceDeg(350, 10)).toBe(20)
    expect(angularDistanceDeg(10, 350)).toBe(20)
    expect(angularDistanceDeg(0, 180)).toBe(180)
    expect(angularDistanceDeg(0, 190)).toBe(170)
  })
})

describe('combineWaveHeightsFt', () => {
  it('adds partitions in quadrature, not linearly', () => {
    // Two equal 2 ft partitions carry twice the energy, not twice the height.
    expect(combineWaveHeightsFt(2, 2)).toBeCloseTo(2.828, 3)
    expect(combineWaveHeightsFt(3, 4)).toBeCloseTo(5, 6)
  })

  it('passes a single partition through unchanged', () => {
    expect(combineWaveHeightsFt(2.5)).toBeCloseTo(2.5, 6)
  })

  it('ignores nulls rather than treating them as zero', () => {
    expect(combineWaveHeightsFt(3, null)).toBeCloseTo(3, 6)
    expect(combineWaveHeightsFt(null, 4)).toBeCloseTo(4, 6)
  })

  it('returns null when nothing is measurable', () => {
    expect(combineWaveHeightsFt()).toBeNull()
    expect(combineWaveHeightsFt(null, null)).toBeNull()
  })
})
