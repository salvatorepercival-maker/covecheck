import type { BeachProfile } from '../types'

/**
 * Cromwell's Beach, Black Point, Honolulu.
 *
 * Every number here is a conservative starting assumption to be calibrated
 * through observation, not a proven constant. Bump `configVersion` on any change
 * — verdicts record it so a threshold edit is traceable to the verdicts it moved.
 */
export const CROMWELLS: BeachProfile = {
  id: 'cromwells',
  name: "Cromwell's Beach",

  // The beach itself. Used for display and the NWS alerts point query, NOT for
  // the Open-Meteo grid requests — see `cells` below.
  latitude: 21.257,
  longitude: -157.797,
  timezone: 'Pacific/Honolulu',
  tideStationId: '1612340',

  srfIsland: 'Oahu',
  shoreAspect: 'south',

  // Direct swell exposure, approximately SE through SW. Energy arriving from
  // outside this arc — notably the persistent E/ESE trade windswell — is
  // discounted, which is what keeps the product from reading permanently red.
  exposedSwellDirections: [{ fromDeg: 135, toDeg: 225 }],

  // Light morning offshores (from the north quadrant, blowing seaward off the
  // south shore) give the glassiest water here. Provisional.
  favorableWindDirections: [{ fromDeg: 315, toDeg: 45 }],

  cells: {
    marine: {
      requestedLat: 21.2083,
      requestedLon: -157.7917,
      resolvedLat: 21.208336,
      resolvedLon: -157.79166,
      resolvedElevationM: 0,
      rationale:
        "Passing the beach's own 21.2570/-157.7970 resolves to 21.2917/-157.7917 at elevation 4 m — a land cell 3.9 km inland. cell_selection=sea does not change it. This point is ~5 km offshore and resolves to a true sea cell (elevation 0 m).",
    },
    weather: {
      requestedLat: 21.2083,
      requestedLon: -157.7917,
      resolvedLat: 21.195078,
      resolvedLon: -157.75179,
      resolvedElevationM: 0,
      rationale:
        "The beach's own coordinates resolve to 21.3357/-157.7982 at elevation 4 m — 8.8 km inland over the Koʻolau foothills, reporting 35 mph gusts against NWS's 15-20 mph shoreline wind. The weather grid is coarser than the marine grid and resolves the same request to a different cell, so it is recorded separately.",
    },
  },

  thresholds: {
    // Applied to exposedSwellHeightFt: direction-filtered OFFSHORE height.
    // Deliberately not the same numbers as srfSurfFaceFt.
    exposedSwellFt: { great: 2, caution: 3 },

    // Applied to the upper bound of the NWS south-facing surf-face band.
    // These are the spec's stated numbers, which were authored in SRF terms.
    srfSurfFaceFt: { great: 2, caution: 3 },

    // SHORELINE-referenced, per the spec. The pinned sea cell over-reads wind
    // (no land friction), so these must not be compared against raw cell values
    // until calibration gap `wind-offshore-vs-shoreline` is resolved.
    windSpeedMph: { great: 8, caution: 12 },
    windGustMph: { great: 12, caution: 18 },

    // Fraction of the local day's own tide range, not absolute feet.
    minTideRangeFraction: 0.4,

    recentRainInchesBlocking: 0.25,
    minWindowHours: 2,
  },

  calibration: [
    {
      id: 'wind-offshore-vs-shoreline',
      providerObservation:
        'Pinned sea cell 21.195/-157.752 reported 23-24 mph sustained and 30-31 mph gusts for 2026-08-02 07:00-09:00 HST.',
      referenceObservation:
        'NWS Oahu Surf Zone Forecast issued 2026-08-02 15:55 HST gave shoreline wind as northeast 15 to 20 mph.',
      affectedThresholds: ['thresholds.windSpeedMph', 'thresholds.windGustMph'],
      status: 'unresolved',
      note:
        'Open water has no land friction, so the sea cell reads high; the inland cell read even higher (35 mph gusts). Neither matches the shoreline. Until this is resolved by observation, the engine must not gate on raw cell wind against the shoreline-referenced thresholds above. Options: shoreline observation over several mornings, or adopt the NWS point forecast as the wind source.',
    },
    {
      id: 'exposed-swell-vs-srf-face',
      providerObservation:
        'Direction-filtered exposed swell for 2026-08-02 computes to ~0 ft (primary swell 0.68 m from 83°, outside the 135-225° window).',
      referenceObservation: 'NWS Oahu south-facing surf was 1-3 ft — "mainly background energy".',
      affectedThresholds: ['thresholds.exposedSwellFt'],
      status: 'unresolved',
      note:
        'The two agree directionally on a calm south shore, which is the encouraging signal. But ~0 ft vs 1-3 ft is not a fixed offset: an offshore height and a surf-face height are different physical quantities and the relationship depends on period and bathymetry. Treat exposedSwellFt as a shape signal and let the SRF band bound the magnitude.',
    },
  ],

  entryNotes: [
    'Shallow reef shelf — adequate water over the reef matters more than absolute tide height.',
    'Entry is over rock and reef, not sand.',
    'Trade winds typically strengthen through the morning, so early windows are usually the calmest.',
  ],

  configVersion: '2026-08-02.1',
}
