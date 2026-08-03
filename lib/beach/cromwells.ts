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

  // NOTE: there is deliberately no `favorableWindDirections` list. Offshore vs
  // onshore is derived geometrically from `shoreAspect` (see `windExposureFor`),
  // so there is one source of truth. The previous hand-listed 315-45° arc was
  // wrong: it excluded the ENE trades that actually blow offshore here.

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
    /**
     * Applied to `exposedSwellHeightFt`: direction-filtered OFFSHORE height.
     *
     * Calibrated 2026-08-02 against a week NWS described as "below seasonal
     * averages ... mainly background energy": direction-filtered offshore swell
     * ran 0-2.6 ft (mean 1.44) while the surf face was 1-3 ft. The previous
     * 2 ft ceiling made 55% of an ordinary calm week read as marginal.
     *
     * These numbers coincide with `srfSurfFaceFt` below. That is an empirical
     * accident of this beach in summer, NOT a rule — the two measure different
     * things (offshore height vs breaking surf face). Do not merge them into one
     * shared constant. See DECISIONS.md #1 and #11.
     */
    exposedSwellFt: { great: 3, caution: 4 },

    /**
     * Applied to the UPPER bound of the NWS south-facing surf-face band.
     *
     * Raised from 2 ft on 2026-08-02. NWS publishes ranges, and 1-3 ft is about
     * the narrowest calm band it issues for a Hawaii south shore — so comparing
     * its upper bound against a 2 ft ceiling could never pass, in any conditions.
     *
     * A 4-6 ft band still blocks outright (6 > 4), matching HANDOFF.md. A 2-4 ft
     * band reads as caution. This is a deliberate deviation from HANDOFF.md's
     * "0-2 ft preferred" figure, which was written as a point value rather than
     * as the upper bound of a published range.
     */
    srfSurfFaceFt: { great: 3, caution: 4 },

    /**
     * Direction-dependent, because fetch is.
     *
     * The ENE trades that blow 16-23 mph here arrive over Black Point and
     * Diamond Head, so they flatten the cove rather than roughen it. The onshore
     * figures are HANDOFF.md's original numbers, which are the right order of
     * magnitude for wind arriving off the water.
     *
     * Gust ceilings are derived at roughly a 1.4x gust factor over the sustained
     * ceilings rather than separately observed — the weakest numbers here.
     */
    windSpeedMph: {
      // Anchored to observation: 23 mph ENE at the model cell was calm in the
      // water on 2026-08-02, so the offshore ceiling must sit above 23. n=1.
      offshore: { great: 25, caution: 32 },
      onshore: { great: 8, caution: 12 },
    },
    windGustMph: {
      // Same anchor: 29 mph gusts read at the cell during a calm session.
      offshore: { great: 31, caution: 40 },
      onshore: { great: 12, caution: 18 },
    },

    /**
     * PLACEHOLDER — NOT USED while calibration gap `tide-favorable-band` is
     * unresolved. The engine does not gate on tide until real numbers arrive.
     *
     * Pointed LOW-to-mid rather than high, on one in-water observation: a good
     * session at 2026-08-02 ~09:00, shortly after the 07:51 low of 0.0 ft, on a
     * rising tide. One data point is not a band, so these numbers do not drive
     * any verdict — but the placeholder should at least not point the wrong way.
     */
    favorableTideFt: { minFt: 0.0, maxFt: 1.0 },

    recentRainInchesBlocking: 0.25,
    minWindowHours: 2,
  },

  calibration: [
    {
      id: 'wind-gridded-models-cannot-resolve-this-cove',
      providerObservation:
        'Open-Meteo sea cell reported 23 mph sustained / 29 mph gusts from the ENE at 2026-08-02 09:00 HST. NWS gridded forecast for the same point and hour agreed within ~2 mph.',
      referenceObservation:
        'IN-WATER OBSERVATION, 2026-08-02 ~09:00 HST: felt calm in the water. Actual wind "nowhere near" 23 mph. Session was good.',
      affectedThresholds: ['thresholds.windSpeedMph.offshore', 'thresholds.windGustMph.offshore'],
      status: 'resolved',
      note:
        'Calibrated from ONE in-water observation (n=1) — treat the numbers as provisional. Two gridded models agreeing with each other told us nothing useful here: both run on grids of kilometres while this cove is tens of metres wide and sits in the lee of Black Point and Diamond Head, so neither resolves the sheltering. Only observation settled it, and observation says a 23/29 mph ENE model reading corresponds to calm water. The offshore ceilings are therefore anchored above that reading rather than the raw figure being adjusted — the data stays honest and the threshold carries the shelter. More mornings are needed, especially one with a genuinely rough ENE, to find where the offshore ceiling actually sits.',
    },
    {
      id: 'tide-favorable-band',
      providerObservation:
        'NOAA Honolulu 1612340 predicts roughly 0.1-2.0 ft MLLW at this beach through the week; 2026-08-02 spanned 0.16-1.74 ft.',
      referenceObservation:
        'Not yet established. The favourable band depends on this cove\'s reef elevation and entry, which no forecast source describes.',
      affectedThresholds: ['thresholds.favorableTideFt'],
      status: 'unresolved',
      note:
        'Tide is a BAND here, not "more water is better". Too low exposes reef and rock; too high can mean stronger current and less shallow standing area for children — so the high end is a negative, not a positive. The earlier implementation scored tide monotonically and labelled near-high tide "plenty of water", which was backwards for a family entry point. Height is measured in feet above MLLW rather than as a fraction of the day\'s range, because reef coverage is absolute: the rock sits at a fixed elevation. ONE in-water observation so far (2026-08-02 ~09:00, just after the 07:51 low of 0.0 ft, rising — a good session) points the band LOW-to-mid, not high. That is one point, not a curve, so the engine still does not gate on tide at all. Two things remain open: where the band edges actually sit, and whether STAGE belongs in the model — the observation was low-AND-rising, and rising may matter independently of height.',
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

  configVersion: '2026-08-02.2',
}
