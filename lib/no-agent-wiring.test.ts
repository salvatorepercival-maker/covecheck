import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The OpenClaw agents are retired (Sal, 2026-10-11). Nothing in the app may
 * depend on them, and the charter carries no CoveCheck-data escalation triggers.
 */

const ROOT = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
}

describe('agent wiring is removed', () => {
  it('no app code references the watchdog or other agents', () => {
    for (const file of ['app', 'components', 'lib'].flatMap((d) => sourceFiles(join(ROOT, d)))) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/\bwatchdog\b|\bopenclaw\b|ESCALATE/i)
    }
  })

  it('the charter has no water-quality or jellyfish escalation triggers', () => {
    const charter = readFileSync(join(ROOT, 'AGENTS-CHARTER.md'), 'utf8')
    expect(charter).not.toMatch(/windowStartsTomorrow|waterQuality\.status/)
  })

  it('the watchdog proposal is gone', () => {
    expect(existsSync(join(ROOT, 'proposals', 'watchdog-v2.md'))).toBe(false)
  })

  it('Surfline is no longer fetched', () => {
    expect(existsSync(join(ROOT, 'lib', 'adapters', 'surfline.ts'))).toBe(false)
    expect(readFileSync(join(ROOT, 'lib', 'forecast.ts'), 'utf8')).not.toMatch(/surfline|nearbySurf/i)
  })
})
