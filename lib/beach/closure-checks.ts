import { getReportStore } from '../reports/store'

/**
 * Hand checks for closures (Sal, 2026-10-12): no live feed covers Black Point,
 * so a check is Sal saying "I looked today — no closures". It counts for the
 * day it was made and the two after, then that day goes back to unknown.
 */

export { CHECK_VALID_DAYS, coveredByCheck } from './closure-coverage'
const KEY = 'covecheck:closures:lastChecked:v1'

export async function readLastChecked(): Promise<string | null> {
  const store = getReportStore()
  if (!store) return null
  try {
    return await store.getValue(KEY)
  } catch {
    return null
  }
}

export async function recordCheck(date: string): Promise<void> {
  const store = getReportStore()
  if (!store) throw new Error('store not configured')
  await store.setValue(KEY, date)
}
