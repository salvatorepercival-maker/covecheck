import { describe, expect, it } from 'vitest'
import { CHECK_VALID_DAYS, coveredByCheck } from './closure-coverage'

describe('coveredByCheck', () => {
  it('covers the check day and the two after, then goes back to unknown', () => {
    expect(CHECK_VALID_DAYS).toBe(3)
    expect(coveredByCheck('2026-10-12', '2026-10-12')).toBe(true)
    expect(coveredByCheck('2026-10-12', '2026-10-14')).toBe(true)
    expect(coveredByCheck('2026-10-12', '2026-10-15')).toBe(false)
    expect(coveredByCheck('2026-10-12', '2026-10-11')).toBe(false)
    expect(coveredByCheck(null, '2026-10-12')).toBe(false)
  })
})
