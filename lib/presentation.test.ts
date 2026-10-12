import { describe, expect, it } from 'vitest'
import { CROMWELLS } from './beach/cromwells'
import { evaluateForecast } from './engine'
import { SCENARIOS } from './engine/fixtures'
import {
  factorRows,
  focusDay,
  HERO_TITLE,
  heroSentence,
  heroState,
  heroWindow,
  hourlyCaption,
  weekRows,
  waterCue,
} from './presentation'
import type { HourlyBeachConditions } from './types'

const NOW = new Date('2026-08-02T18:00:00.000Z') // 08:00 HST

function setup(hours: readonly HourlyBeachConditions[], now = NOW) {
  const evaluation = evaluateForecast({ profile: CROMWELLS, hours, nowUtc: now })
  const conditionsByTimestamp = Object.fromEntries(hours.map((hour) => [hour.timestamp, hour]))
  const day = evaluation.days[0]
  const hour = day.recommendedWindow?.hours[0] ?? day.hours[0]
  const rows = factorRows({ hour, conditionsByTimestamp, profile: CROMWELLS, dayHours: day.hours, dayExtremes: [] })
  return { evaluation, conditionsByTimestamp, day, hour, rows }
}

const row = (rows: ReturnType<typeof setup>['rows'], key: string) => rows.find((entry) => entry.key === key)!

describe('factor rows read the engine, not a second copy of its thresholds', () => {
  it('a calm morning reads small, light and clear', () => {
    const { rows } = setup(SCENARIOS.EXCELLENT_CALM_MORNING)
    expect(row(rows, 'waves')).toMatchObject({ chip: 'Small', tone: 'good' })
    expect(row(rows, 'wind').tone).toBe('good')
    expect(row(rows, 'advisories')).toMatchObject({ chip: 'Clear', tone: 'good' })
  })

  it('keeps the provisional tide band visible', () => {
    const { rows } = setup(SCENARIOS.EXCELLENT_CALM_MORNING)
    expect(row(rows, 'tide').caveat).toMatch(/provisional/i)
  })

  it('flags excessive swell as too big', () => {
    const { rows } = setup(SCENARIOS.FAVORABLE_TIDE_EXCESSIVE_SWELL)
    expect(row(rows, 'waves')).toMatchObject({ chip: 'Too big', tone: 'bad' })
  })

  it('flags an active advisory', () => {
    const { rows } = setup(SCENARIOS.HIGH_SURF_ADVISORY_DAY)
    expect(row(rows, 'advisories')).toMatchObject({ chip: 'In effect', tone: 'bad' })
  })

  it('says when the wind picks up later', () => {
    const { rows } = setup(SCENARIOS.WIND_BUILDS_THROUGH_DAY)
    expect(row(rows, 'wind').detail).toMatch(/picks up after/)
  })

  it('places the wind marker at the limit for the wind direction', () => {
    const { rows } = setup(SCENARIOS.STRONG_OFFSHORE_WIND)
    const wind = row(rows, 'wind')
    expect(wind.chip).toBe('Too strong')
    // Offshore great ceiling 25 on a 48 mph scale.
    expect(wind.bar?.marker).toBeCloseTo(25 / 48)
  })
})

describe('hero', () => {
  it('names what is wrong on a skip day', () => {
    const { evaluation, rows } = setup(SCENARIOS.FAVORABLE_TIDE_EXCESSIVE_SWELL)
    expect(evaluation.days[0].verdict).toBe('not_recommended')
    expect(heroSentence('not_recommended', rows, true)).toMatch(/^The waves are too big .*all day\.$/)
  })

  it('counts down to an upcoming window', () => {
    const { day } = setup(SCENARIOS.EXCELLENT_CALM_MORNING)
    const window = day.recommendedWindow!
    const early = new Date('2026-08-02T16:30:00.000Z') // 06:30 HST
    const timing = heroWindow(window, early, true).timing
    if (window.startTimestamp.endsWith('06:00')) expect(timing?.label).toBe('On now')
    else expect(timing?.label).toBe('Starts in')
  })

  it('never offers a window that has already ended today', () => {
    const late = new Date('2026-08-03T02:30:00.000Z') // 16:30 HST, morning-only fixture
    const { evaluation } = setup(SCENARIOS.EXCELLENT_CALM_MORNING, late)
    const focus = focusDay(evaluation, CROMWELLS, late)!
    expect(heroState(focus, evaluation, late).window).toBeNull()
  })
})

describe('week and hourly copy', () => {
  it('summarises a blocked day by its blocker', () => {
    const { evaluation, conditionsByTimestamp } = setup(SCENARIOS.HIGH_SURF_ADVISORY_DAY)
    const [first] = weekRows(evaluation, CROMWELLS, conditionsByTimestamp, '2026-08-02')
    expect(first).toMatchObject({ title: 'Skip', subtitle: 'Advisory in effect' })
  })

  it('explains an afternoon that turns windy', () => {
    const { day } = setup(SCENARIOS.WIND_BUILDS_THROUGH_DAY)
    expect(hourlyCaption(day, day.recommendedWindow)).toMatch(/Wind builds after/)
  })
})

describe('safety language', () => {
  const FORBIDDEN = [/\bis safe\b/i, /\bsafe (?:to|for)\b/i, /\bguarantee/i]

  it('no generated copy asserts safety', () => {
    const texts: string[] = [...Object.values(HERO_TITLE)]
    for (const hours of Object.values(SCENARIOS)) {
      const { evaluation, conditionsByTimestamp, day, rows } = setup(hours)
      for (const verdict of ['great', 'caution', 'not_recommended', 'insufficient_data'] as const) {
        texts.push(heroSentence(verdict, rows, true))
      }
      texts.push(hourlyCaption(day, day.recommendedWindow))
      for (const entry of rows) texts.push(entry.detail, entry.chip, entry.note ?? '', entry.caveat ?? '')
      for (const week of weekRows(evaluation, CROMWELLS, conditionsByTimestamp, '2026-08-02')) {
        texts.push(week.title, week.subtitle)
      }
    }
    for (const text of texts) for (const pattern of FORBIDDEN) expect(text).not.toMatch(pattern)
  })
})

describe('waterCue', () => {
  it('maps sea temperature to what to wear', () => {
    expect(waterCue(81)?.wear).toBe('rashguard, no wetsuit')
    expect(waterCue(75)?.wear).toBe('rashguard')
    expect(waterCue(71)?.wear).toMatch(/light wetsuit top/)
    expect(waterCue(65)?.wear).toBe('wetsuit recommended')
    expect(waterCue(null)).toBeNull()
  })
})
