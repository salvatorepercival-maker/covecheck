import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('metric details copy', () => {
  it('never speaks in safety terms', () => {
    for (const f of ['components/metric-details.tsx', 'components/deciding-panel.tsx']) {
      const src = readFileSync(f, 'utf8')
      const strings = src.match(/(['"`])(?:(?!\1).)*\1|>[^<>{}]+</g) ?? []
      for (const s of strings) expect(s).not.toMatch(/\b(safe|unsafe|danger|dangerous|guarantee)\b/i)
    }
  })
})
