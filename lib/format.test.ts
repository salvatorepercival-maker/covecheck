import { describe, expect, it } from 'vitest'
import {
  formatClockTime,
  formatCompass,
  formatDayLabel,
  formatDayShort,
  formatFeet,
  formatHour,
  formatMph,
  formatTideStage,
  formatUpdatedAgo,
  formatWindowRange,
} from './format'

describe('formatHour', () => {
  it('uses 12-hour clock with a meridiem', () => {
    expect(formatHour(0)).toBe('12 AM')
    expect(formatHour(6)).toBe('6 AM')
    expect(formatHour(11)).toBe('11 AM')
    expect(formatHour(12)).toBe('12 PM')
    expect(formatHour(18)).toBe('6 PM')
    expect(formatHour(23)).toBe('11 PM')
  })

  it('wraps hours past midnight', () => {
    expect(formatHour(24)).toBe('12 AM')
    expect(formatHour(25)).toBe('1 AM')
  })
})

describe('formatClockTime', () => {
  it('renders precise tide times, keeping the minutes', () => {
    // Tide turns are predicted to the minute; rounding to the hour would misplace
    // a high by up to half an hour.
    expect(formatClockTime('2026-08-02 07:51')).toBe('7:51 AM')
    expect(formatClockTime('2026-08-02T15:28')).toBe('3:28 PM')
    expect(formatClockTime('2026-08-02 00:48')).toBe('12:48 AM')
    expect(formatClockTime('2026-08-02 12:01')).toBe('12:01 PM')
    expect(formatClockTime('2026-08-02 18:21')).toBe('6:21 PM')
  })

  it('accepts both provider timestamp formats', () => {
    expect(formatClockTime('2026-08-02 06:45')).toBe(formatClockTime('2026-08-02T06:45'))
  })
})

describe('formatWindowRange', () => {
  it('runs to the end of the final hour, not its start', () => {
    // Hours 6, 7 and 8 are three hours of favourable conditions, which finish at
    // 9 AM. Reading the end timestamp literally would under-report by an hour.
    expect(formatWindowRange('2026-08-02T06:00', '2026-08-02T08:00')).toBe('6 – 9 AM')
  })

  it('drops the repeated meridiem within the same half of the day', () => {
    expect(formatWindowRange('2026-08-02T07:00', '2026-08-02T09:00')).toBe('7 – 10 AM')
    expect(formatWindowRange('2026-08-02T13:00', '2026-08-02T15:00')).toBe('1 – 4 PM')
  })

  it('keeps both meridiems when the window crosses noon', () => {
    expect(formatWindowRange('2026-08-02T10:00', '2026-08-02T12:00')).toBe('10 AM – 1 PM')
    expect(formatWindowRange('2026-08-02T11:00', '2026-08-02T11:00')).toBe('11 AM – 12 PM')
  })

  it('handles a single-hour window', () => {
    expect(formatWindowRange('2026-08-02T06:00', '2026-08-02T06:00')).toBe('6 – 7 AM')
  })
})

describe('formatDayLabel', () => {
  const today = '2026-08-02'

  it('names today and tomorrow', () => {
    expect(formatDayLabel(today, today)).toBe('Today')
    expect(formatDayLabel('2026-08-03', today)).toBe('Tomorrow')
  })

  it('uses weekday and date further out', () => {
    expect(formatDayLabel('2026-08-05', today)).toBe('Wed 5')
    expect(formatDayLabel('2026-08-08', today)).toBe('Sat 8')
  })

  it('crosses a month boundary correctly', () => {
    expect(formatDayLabel('2026-09-01', '2026-08-31')).toBe('Tomorrow')
    expect(formatDayLabel('2026-09-02', '2026-08-31')).toBe('Wed 2')
  })

  it('gives short labels for the day strip', () => {
    expect(formatDayShort(today, today)).toBe('Today')
    expect(formatDayShort('2026-08-05', today)).toBe('Wed')
  })
})

describe('formatUpdatedAgo', () => {
  const now = new Date('2026-08-02T18:00:00.000Z')

  it('describes recent updates in minutes', () => {
    expect(formatUpdatedAgo('2026-08-02T17:59:40.000Z', now)).toBe('just now')
    expect(formatUpdatedAgo('2026-08-02T17:59:00.000Z', now)).toBe('1 minute ago')
    expect(formatUpdatedAgo('2026-08-02T17:56:00.000Z', now)).toBe('4 minutes ago')
    expect(formatUpdatedAgo('2026-08-02T17:05:00.000Z', now)).toBe('55 minutes ago')
  })

  it('switches to hours, and never rounds a stale figure down to reassure', () => {
    expect(formatUpdatedAgo('2026-08-02T17:00:00.000Z', now)).toBe('1 hour ago')
    expect(formatUpdatedAgo('2026-08-02T13:00:00.000Z', now)).toBe('5 hours ago')
    expect(formatUpdatedAgo('2026-08-01T19:00:00.000Z', now)).toBe('23 hours ago')
  })

  it('reports a date once past a day old', () => {
    expect(formatUpdatedAgo('2026-08-01T10:00:00.000Z', now)).toMatch(/^on \d+ \w{3}$/)
  })

  it('treats a clock skew into the future as just now', () => {
    expect(formatUpdatedAgo('2026-08-02T18:05:00.000Z', now)).toBe('just now')
  })
})

describe('value formatters', () => {
  it('renders a missing value as an em dash, never as zero', () => {
    // 0.0 ft and "no data" must look different to the reader.
    expect(formatFeet(null)).toBe('—')
    expect(formatFeet(0)).toBe('0.0 ft')
    expect(formatMph(null)).toBe('—')
    expect(formatMph(0)).toBe('0 mph')
  })

  it('rounds feet to one decimal and wind to whole numbers', () => {
    expect(formatFeet(2.625)).toBe('2.6 ft')
    expect(formatMph(22.4)).toBe('22 mph')
  })
})

describe('formatCompass', () => {
  it('converts bearings to plain-language points', () => {
    expect(formatCompass(0)).toBe('N')
    expect(formatCompass(83)).toBe('E')
    expect(formatCompass(104)).toBe('ESE')
    expect(formatCompass(182)).toBe('S')
    expect(formatCompass(270)).toBe('W')
  })

  it('wraps around north', () => {
    expect(formatCompass(359)).toBe('N')
    expect(formatCompass(360)).toBe('N')
  })

  it('returns an em dash for a missing bearing', () => {
    expect(formatCompass(null)).toBe('—')
  })
})

describe('formatTideStage', () => {
  it('renders each stage in plain language', () => {
    expect(formatTideStage('rising')).toBe('Rising')
    expect(formatTideStage('near-high')).toBe('Near high')
    expect(formatTideStage('near-low')).toBe('Near low')
    expect(formatTideStage('unknown')).toBe('Unknown')
  })

  it('falls back to Unknown for an unrecognized stage', () => {
    expect(formatTideStage('sideways')).toBe('Unknown')
  })
})
