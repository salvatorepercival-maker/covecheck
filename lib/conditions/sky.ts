/**
 * WMO weather codes → plain sky words.
 *
 * Open-Meteo reports the WMO 4677 code set. Grouped coarsely on purpose: a
 * beachgoer needs "sunny / cloudy / showers / storms", not "drizzle, moderate".
 */

export type SkyKind = 'clear' | 'mostly_sunny' | 'partly_cloudy' | 'cloudy' | 'fog' | 'showers' | 'rain' | 'storms'

export function skyOf(code: number | null, cloudCoverPct: number | null = null): SkyKind | null {
  if (code === null) return null
  if (code >= 95) return 'storms'
  if (code >= 80) return 'showers'
  if (code >= 61) return 'rain'
  if (code >= 51) return 'showers'
  if (code >= 45) return 'fog'
  if (code === 3) return 'cloudy'
  if (code === 2) return 'partly_cloudy'
  if (code === 1) return 'mostly_sunny'
  // Code 0 is "clear sky", but the model's cloud cover can still be high.
  if (cloudCoverPct !== null && cloudCoverPct > 40) return 'partly_cloudy'
  return 'clear'
}

export const SKY_WORDS: Record<SkyKind, string> = {
  clear: 'Sunny',
  mostly_sunny: 'Mostly sunny',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Hazy',
  showers: 'Passing showers',
  rain: 'Rain',
  storms: 'Thunderstorms',
}

/** Wetter, darker kinds outrank sunnier ones when summarising a stretch of hours. */
const SEVERITY: Record<SkyKind, number> = {
  clear: 0,
  mostly_sunny: 1,
  partly_cloudy: 2,
  fog: 3,
  cloudy: 3,
  showers: 4,
  rain: 5,
  storms: 6,
}

/**
 * One sky for a stretch of hours: the most common kind, unless a third or more
 * of the hours are wetter — then the wetter one, so a showery afternoon is not
 * summarised as "mostly sunny".
 */
export function dominantSky(kinds: readonly (SkyKind | null)[]): SkyKind | null {
  const known = kinds.filter((kind): kind is SkyKind => kind !== null)
  if (known.length === 0) return null
  const counts = new Map<SkyKind, number>()
  for (const kind of known) counts.set(kind, (counts.get(kind) ?? 0) + 1)
  const wet = known.filter((kind) => SEVERITY[kind] >= 4)
  if (wet.length >= known.length / 3) {
    return [...wet].sort((a, b) => SEVERITY[b] - SEVERITY[a])[0]
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || SEVERITY[a[0]] - SEVERITY[b[0]])[0][0]
}
