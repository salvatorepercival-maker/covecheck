import { formatCompass } from '../format'

const COMPASS_WORDS: Record<string, string> = {
  N: 'north',
  NNE: 'north',
  NE: 'northeast',
  ENE: 'east',
  E: 'east',
  ESE: 'east',
  SE: 'southeast',
  SSE: 'south',
  S: 'south',
  SSW: 'south',
  SW: 'southwest',
  WSW: 'west',
  W: 'west',
  WNW: 'west',
  NW: 'northwest',
  NNW: 'north',
}

/** 182° → "south". Null-safe: an unknown direction is just left out of the sentence. */
export function formatCompassWord(deg: number | null): string | null {
  if (deg === null) return null
  return COMPASS_WORDS[formatCompass(deg)] ?? null
}

export const formatRange = ([lo, hi]: readonly [number, number]) => `${lo}–${hi}`
