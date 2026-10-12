/** How long a hand check for closures counts: the day it was made and the two after. */
export const CHECK_VALID_DAYS = 3

/** Is a date covered by the last check? */
export function coveredByCheck(lastChecked: string | null, date: string): boolean {
  if (!lastChecked) return false
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${lastChecked}T00:00:00Z`)) / 86_400_000)
  return days >= 0 && days < CHECK_VALID_DAYS
}
