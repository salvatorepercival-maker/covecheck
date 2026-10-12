import type { LiveRule } from '../beach/spot-guide'
import type { DayFacts, HourFacts } from '../facts'

/** Does a rule hold in this hour? Every listed condition must. */
export function ruleHolds(rule: LiveRule, h: HourFacts): boolean {
  const w = rule.when
  if (w.minSwellEnergy !== undefined && !(h.swellEnergy !== null && h.swellEnergy >= w.minSwellEnergy)) return false
  if (w.tideMidChange !== undefined && h.tide.midChange !== w.tideMidChange) return false
  if (w.tideVsBand !== undefined && h.tideVsBand !== w.tideVsBand) return false
  if (w.minWindMph !== undefined && !(h.windMph !== null && h.windMph >= w.minWindMph)) return false
  if (w.windClass !== undefined && h.windClass !== w.windClass) return false
  return true
}

/** The first rule that holds in any daylight hour of the day, with the hours it holds. */
export function liveNote(rules: readonly LiveRule[] | undefined, day: DayFacts): { note: string; hours: number[] } | null {
  for (const rule of rules ?? []) {
    const hours = day.hours.filter((h) => h.hour >= 6 && h.hour <= 18 && ruleHolds(rule, h)).map((h) => h.hour)
    if (hours.length) return { note: rule.note, hours }
  }
  return null
}
