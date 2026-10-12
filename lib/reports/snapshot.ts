import type { BeachProfile } from '../types'
import { buildDayFacts, type DayFacts } from '../facts'
import type { BeachReport } from '../forecast'
import { DEFAULT_LENSES, LENS_ORDER } from '../lenses/defaults'
import { evaluateHour } from '../lenses/evaluate'
import { sunTimesFor } from '../sun'
import type { StoredReport } from './schema'

export function dayFactsFor(report: BeachReport, profile: BeachProfile): DayFacts[] {
  return buildDayFacts(report, profile, (date) => {
    const sun = sunTimesFor(date, profile.latitude, profile.longitude)
    return { sunrise: sun.sunrise, sunset: sun.sunset }
  })
}

/** The forecast for one local hour, as stored with a visit report. */
export function forecastSnapshot(
  report: BeachReport,
  profile: BeachProfile,
  date: string,
  hour: number,
): StoredReport['forecast'] {
  const facts = dayFactsFor(report, profile)
    .find((day) => day.date === date)
    ?.hours.find((h) => h.hour === hour) ?? null
  const engineHour = report.evaluation.hours.find((h) => h.timestamp === `${date}T${String(hour).padStart(2, '0')}:00`)
  return {
    engineVersion: report.evaluation.engineVersion,
    configVersion: report.evaluation.configVersion,
    engineVerdict: engineHour?.verdict ?? null,
    facts,
    // Default thresholds, so reports are comparable however each viewer has tuned theirs.
    lenses: facts
      ? LENS_ORDER.map((id) => {
          const result = evaluateHour(DEFAULT_LENSES[id], facts)
          return { lens: id, fit: result.fit, tags: result.tags }
        })
      : [],
  }
}
