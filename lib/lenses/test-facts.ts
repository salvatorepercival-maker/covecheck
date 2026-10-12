import type { DayFacts, HourFacts } from '../facts'

/** A calm, clear, fully-measured hour; tests override what they exercise. */
export function hourFacts(overrides: Partial<HourFacts> = {}): HourFacts {
  return {
    timestamp: `2026-10-12T${String(overrides.hour ?? 9).padStart(2, '0')}:00`,
    date: '2026-10-12',
    hour: 9,
    swellFt: 1,
    swellFromDeg: 180,
    nwsSurfMaxFt: 3,
    windMph: 6,
    gustMph: 9,
    windFromDeg: 20,
    windClass: 'offshore',
    tideFt: 0.8,
    tideStage: 'rising',
    tideVsBand: 'in',
    clarity: { ft: 30, confidence: 'low', mainCause: null, inputs: { exposedSwellFt: 1, windMph: 6, windDirectionDeg: 20, rain48hIn: 0 }, modelVersion: 't' },
    airF: 82,
    seaF: 80,
    sky: 'mostly_sunny',
    rainPct: 10,
    rain48hIn: 0,
    uv: 6,
    nwsHazards: [],
    nwsHazardsKnown: true,
    waterQuality: { status: 'clear', radiusKm: 5 },
    jelly: { expected: false, window: { start: '2026-11-02', end: '2026-11-04' } },
    dataIssue: null,
    ...overrides,
  }
}

export function dayOf(hours: Partial<HourFacts>[]): DayFacts {
  return {
    date: '2026-10-12',
    hours: hours.map((h) => hourFacts({ ...h, timestamp: `2026-10-12T${String(h.hour).padStart(2, '0')}:00` })),
    tideExtremes: [{ timestamp: '2026-10-12 11:47', heightFt: 0.5, kind: 'low' }],
    sunrise: 387,
    sunset: 1091,
  }
}

export const calmDay = () => dayOf(Array.from({ length: 13 }, (_, i) => ({ hour: 6 + i })))
