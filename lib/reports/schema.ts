import { z } from 'zod'
import type { HourFacts } from '../facts'
import type { FactorTag, Fit, LensId } from '../lenses/schema'

/**
 * A visit report: what someone actually saw, plus the forecast for that hour.
 *
 * The snapshot is the point — it is what makes a report calibration data. It
 * carries every factor value (including the clarity model's own inputs) and every
 * lens's output at default thresholds, so a later threshold change can be scored
 * against what people reported.
 */

export const ACTIVITIES = ['snorkel', 'dive', 'surf', 'swim'] as const
export const VISIBILITY = ['<10', '10-20', '20-30', '30+'] as const
export const SURGE = ['calm', 'some', 'strong'] as const
export const AGAIN = ['yes', 'maybe', 'no'] as const

export const reportInput = z.object({
  activity: z.enum(ACTIVITIES),
  visibility: z.enum(VISIBILITY),
  surge: z.enum(SURGE),
  again: z.enum(AGAIN),
  note: z.string().trim().max(500).optional().default(''),
  /** Local hour in the water, today, 5-20. */
  hour: z.number().int().min(5).max(20),
  /** Honeypot: humans never see or fill this. */
  website: z.string().max(500).optional().default(''),
  /** ms the form was open before sending; bots post instantly. */
  elapsedMs: z.number().int().min(0),
})

export type ReportInput = z.infer<typeof reportInput>

export type LensSnapshot = { lens: LensId; fit: Fit | 'unknown'; tags: Record<string, FactorTag> }

export type StoredReport = {
  version: 1
  id: string
  receivedUtc: string
  beachId: string
  /** Local date and hour the report describes. */
  date: string
  hour: number
  report: Omit<ReportInput, 'website' | 'elapsedMs'>
  forecast: {
    engineVersion: string
    configVersion: string
    /** The engine's own verdict for that hour, for comparison with the lenses. */
    engineVerdict: string | null
    facts: HourFacts | null
    lenses: LensSnapshot[]
  }
}

/** Visibility bucket → feet range, for comparing with the clarity estimate. */
export const VISIBILITY_FT: Record<(typeof VISIBILITY)[number], [number, number]> = {
  '<10': [0, 10],
  '10-20': [10, 20],
  '20-30': [20, 30],
  '30+': [30, 200],
}
