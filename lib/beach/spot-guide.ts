/**
 * Cromwell's spot guide: numbered markers over Sal's aerial photo.
 *
 * IMAGE: put the aerial photo at `public/spot/cromwells-aerial.jpg` (any size;
 * it is shown at its own aspect ratio). Not a Google Maps screenshot — use a
 * photo you have the rights to. Until it exists the guide shows a placeholder.
 *
 * MARKERS: `x` and `y` are percentages of the image's width and height from the
 * top-left corner. Titles and notes marked [PLACEHOLDER] are for Sal to write.
 *
 * LIVE NOTES: a marker can show an extra line on days a rule triggers. Each rule
 * is data — every condition listed must hold in the same daylight hour.
 */

export type LiveRule = {
  /** Shown on the marker when the rule triggers for the day on screen. */
  note: string
  when: {
    /** Exposed swell energy (H²T, ft²·s) at or above this. */
    minSwellEnergy?: number
    /** The tide is mid-change (strongest flow). */
    tideMidChange?: boolean
    /** Tide relative to the beach's band. */
    tideVsBand?: 'low' | 'high'
    /** Sustained wind at or above this, mph. */
    minWindMph?: number
    windClass?: 'offshore' | 'cross' | 'onshore'
  }
}

export type SpotMarker = {
  id: string
  /** Percent from the left edge of the image. */
  x: number
  /** Percent from the top edge of the image. */
  y: number
  title: string
  /** One or two lines. */
  note: string
  live?: LiveRule[]
}

export const SPOT_GUIDE = {
  image: { src: '/spot/cromwells-aerial.jpg', alt: "Aerial view of Cromwell's Beach and the reef at Black Point" },
  markers: [
    {
      id: 'entry',
      x: 48,
      y: 62,
      title: '[PLACEHOLDER] Main entry',
      note: '[PLACEHOLDER — Sal to write: where to get in, what the entry is like underfoot.]',
      // ≈ 4 ft at 10 s: the snorkel lens's mixed ceiling.
      live: [{ note: 'Surge likely at the entry today', when: { minSwellEnergy: 160 } }],
    },
    {
      id: 'reef-flat',
      x: 38,
      y: 48,
      title: '[PLACEHOLDER] Shallow reef flat',
      note: '[PLACEHOLDER — Sal to write: depth, what to watch for, where kids stay.]',
      live: [{ note: 'Very shallow at low tide today', when: { tideVsBand: 'low' } }],
    },
    {
      id: 'pocket',
      x: 55,
      y: 38,
      title: '[PLACEHOLDER] Deeper pocket',
      note: '[PLACEHOLDER — Sal to write.]',
    },
    {
      id: 'channel',
      x: 66,
      y: 30,
      title: '[PLACEHOLDER] Channel / current edge',
      note: '[PLACEHOLDER — Sal to write: where the water moves out.]',
      // ≈ 3 ft at 10 s while the tide is moving fastest.
      live: [{ note: 'Current likely today', when: { minSwellEnergy: 90, tideMidChange: true } }],
    },
    {
      id: 'ledge',
      x: 28,
      y: 35,
      title: '[PLACEHOLDER] Rocky ledge',
      note: '[PLACEHOLDER — Sal to write.]',
      live: [{ note: 'Waves washing over the ledge likely today', when: { minSwellEnergy: 160 } }],
    },
    {
      id: 'parking',
      x: 52,
      y: 86,
      title: '[PLACEHOLDER] Parking, path and showers',
      note: '[PLACEHOLDER — Sal to write: where to park, the path down, showers.]',
    },
  ] satisfies SpotMarker[],
} as const
