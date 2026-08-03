/**
 * Provider-neutral CoveCheck data model.
 *
 * NAMING RULE (load-bearing — see DECISIONS.md #1):
 * Every height field is named for the measurement that produced it. The August
 * 2026 calibration showed three different, all-correct "surf heights" for
 * Cromwell's on the same morning:
 *
 *   modelSigWaveHeightFt   4.5 ft  (offshore, all partitions, mostly E windswell)
 *   srfSouthFacingBand     1-3 ft  (NWS surf face, south-facing shores)
 *   exposedSwellHeightFt   ~0 ft   (only partitions inside Cromwell's swell window)
 *
 * A field called `waveHeightFt` invites code to apply a surf-face threshold to a
 * model number, which produces a permanently-red product. Do not add one.
 */

import type { DirectionRange } from './geo'

// ---------------------------------------------------------------------------
// Hourly conditions
// ---------------------------------------------------------------------------

export type TideStage = 'rising' | 'falling' | 'near-high' | 'near-low' | 'unknown'

export type HourlyBeachConditions = {
  /** Canonical Honolulu-local `YYYY-MM-DDTHH:mm`. */
  timestamp: string
  /** Same instant in UTC, for storage and comparison. */
  timestampUtc: string

  // --- Wave model: offshore significant heights. NOT surf-face heights. ---
  /** Open-Meteo `wave_height`: total sea state offshore, every partition combined. */
  modelSigWaveHeightFt: number | null
  modelSigWaveDirectionDeg: number | null
  modelSigWavePeriodSec: number | null
  /** Primary swell partition. */
  modelSwellHeightFt: number | null
  modelSwellDirectionDeg: number | null
  modelSwellPeriodSec: number | null
  /** Locally-generated windswell partition — the trade-wind signal we must exclude. */
  modelWindWaveHeightFt: number | null
  modelWindWaveDirectionDeg: number | null
  modelWindWavePeriodSec: number | null

  /**
   * DERIVED: partitions whose direction falls inside the beach's exposure
   * window, combined in quadrature. This is the wave input the engine reasons
   * about — still an offshore height, but only the energy that can reach this
   * beach. Null when the inputs needed to compute it are missing.
   */
  exposedSwellHeightFt: number | null
  /** Which partitions were counted, for explainability. */
  exposedPartitions: readonly ExposedPartition[]

  // --- Wind ---
  windSpeedMph: number | null
  windGustMph: number | null
  windDirectionDeg: number | null
  precipitationIn: number | null

  // --- Tide ---
  tideHeightFt: number | null
  tideStage: TideStage
  /**
   * Where this height sits within the local day's own range, 0-1.
   * Honolulu's daily range is ~1.6 ft, so absolute-foot tide thresholds are
   * meaningless here. See DECISIONS.md #3.
   */
  tideRangeFraction: number | null

  // --- Hazards ---
  activeHazards: readonly BeachHazard[]

  // --- Provenance ---
  sourceFreshness: SourceFreshness
}

export type ExposedPartition = {
  partition: 'swell' | 'wind_wave'
  heightFt: number
  directionDeg: number
}

// ---------------------------------------------------------------------------
// Hazards
// ---------------------------------------------------------------------------

export type HazardSeverity = 'advisory' | 'watch' | 'warning' | 'statement' | 'unknown'

export type BeachHazard = {
  /** NWS event name verbatim, e.g. "High Surf Advisory". */
  event: string
  severity: HazardSeverity
  headline: string | null
  onsetUtc: string | null
  endsUtc: string | null
  /** True when this event type is one CoveCheck treats as a hard blocker. */
  isBlocking: boolean
}

// ---------------------------------------------------------------------------
// Surf Zone Forecast (island-level, ~2 issuances/day — not hourly)
// ---------------------------------------------------------------------------

export type ShoreAspect = 'north' | 'west' | 'south' | 'east'

export type SurfZoneBand = {
  shore: ShoreAspect
  /** Column label from the SRF table, e.g. "Tonight PM" or "Monday AM". */
  column: string
  minFt: number
  maxFt: number
}

export type SurfZoneForecast = {
  /** Island section the bands were read from, e.g. "Oahu". */
  island: string
  issuedUtc: string
  bands: readonly SurfZoneBand[]
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

export type ProviderId = 'marine' | 'weather' | 'tides' | 'alerts' | 'srf'

export type SourceStatus = 'ok' | 'stale' | 'failed' | 'missing'

export type SourceFreshness = {
  [K in ProviderId]?: {
    /** When CoveCheck retrieved it. */
    fetchedAtUtc: string
    /** When the provider says the data was generated, when it tells us. Kept separate on purpose. */
    observedAtUtc: string | null
    status: SourceStatus
    ageSeconds: number | null
  }
}

// ---------------------------------------------------------------------------
// Beach profile
// ---------------------------------------------------------------------------

/**
 * A model grid cell actually used for a provider.
 *
 * Open-Meteo silently relocates coordinates to its nearest grid cell — for
 * Cromwell's it moved 3.9 km inland for marine and 8.8 km inland for weather,
 * both onto land cells. We therefore request a deliberately chosen sea point and
 * record what came back, so drift is visible instead of silent.
 */
export type ProviderCell = {
  /** What we ask the provider for. */
  requestedLat: number
  requestedLon: number
  /** What the provider resolved it to, observed at calibration time. */
  resolvedLat: number
  resolvedLon: number
  /** Resolved cell elevation in metres. Must be 0 for a sea cell. */
  resolvedElevationM: number
  /** Why this point was chosen rather than the beach's own coordinates. */
  rationale: string
}

/**
 * Wind limits that depend on whether the wind blows land-to-sea or sea-to-land.
 *
 * A single speed limit is the wrong model. 20 mph blowing offshore leaves a
 * sheltered cove glassy; 12 mph blowing onshore chops it up, because only the
 * onshore wind has ocean fetch behind it. Cross-shore is treated as onshore,
 * conservatively, since alongshore fetch can still build chop.
 */
export type DirectionalWindLimits = {
  offshore: { great: number; caution: number }
  onshore: { great: number; caution: number }
}

/**
 * The tide window a beach is actually pleasant in.
 *
 * Deliberately a band, not a minimum. At a shallow reef-entry cove both ends are
 * worse than the middle: too low exposes reef and rock, too high can mean
 * stronger current and less shallow standing area for children. A "more water is
 * better" scale gets the high end exactly backwards.
 *
 * Expressed in feet above MLLW rather than as a fraction of the day's range,
 * because reef coverage is absolute — the rock sits at a fixed elevation, so what
 * matters is depth over it, not where the tide sits within a varying daily swing.
 */
export type TideBandFt = {
  /** Below this, reef and rock start to be exposed. */
  minFt: number
  /** Above this, current strengthens and the shallow standing area shrinks. */
  maxFt: number
}

export type BeachThresholds = {
  /**
   * Ceilings on `exposedSwellHeightFt` — direction-filtered offshore height.
   * NOT comparable to an NWS surf-face band.
   */
  exposedSwellFt: { great: number; caution: number }
  /** Ceilings on the NWS south-facing surf-face band's upper bound. */
  srfSurfFaceFt: { great: number; caution: number }
  windSpeedMph: DirectionalWindLimits
  windGustMph: DirectionalWindLimits
  /** The tide band this beach is pleasant in, in feet above MLLW. */
  favorableTideFt: TideBandFt
  /** Rain in the preceding window that blocks a green verdict. */
  recentRainInchesBlocking: number
  /** Minimum continuous favorable hours to call something a "Great window". */
  minWindowHours: number
}

/**
 * A recorded disagreement between a provider's value and an independent
 * reference, held open until someone resolves it with observation.
 *
 * This exists so a known-wrong input cannot quietly become a shipped verdict.
 * `status: 'unresolved'` means the engine must not compare the raw provider
 * value against the paired threshold — see DECISIONS.md #2.
 */
export type CalibrationGap = {
  id: string
  /** What the pinned provider cell reported. */
  providerObservation: string
  /** What the independent reference said for the same moment. */
  referenceObservation: string
  /** Which thresholds are not yet safe to apply to raw provider values. */
  affectedThresholds: readonly string[]
  status: 'unresolved' | 'resolved'
  note: string
}

export type BeachProfile = {
  id: string
  name: string
  /** The actual beach, used for display and the NWS alerts point query. */
  latitude: number
  longitude: number
  timezone: string
  tideStationId: string
  /** Island section to read from the NWS Surf Zone Forecast. */
  srfIsland: string
  /** Shore aspect this beach faces, selecting the SRF row. */
  shoreAspect: ShoreAspect
  /** Swell arcs with a direct path to this beach. Energy outside these is discounted. */
  exposedSwellDirections: readonly DirectionRange[]
  /** Explicitly pinned provider sample points. */
  cells: { marine: ProviderCell; weather: ProviderCell }
  thresholds: BeachThresholds
  /** Open disagreements between pinned provider cells and independent references. */
  calibration: readonly CalibrationGap[]
  entryNotes: readonly string[]
  /** Bumped whenever thresholds or exposure windows change, and logged with every verdict. */
  configVersion: string
}
