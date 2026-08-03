/**
 * ============================================================================
 * SURFLINE — UNOFFICIAL, UNDOCUMENTED, RATE-LIMITED, AND CURRENTLY BLOCKED
 * ============================================================================
 *
 * ⚠️  IF A "SURF REPORT UNAVAILABLE" BUG REPORT COMES IN, CHECK THIS FILE FIRST.
 *
 * This talks to Surfline's *internal* API (`services.surfline.com/kbyg/...`).
 * Surfline has confirmed they do not offer a public API. These endpoints are
 * reverse-engineered from their web client and can change shape, move, or
 * disappear without notice. Nothing here is a stable contract.
 *
 * CURRENT STATUS (verified 2026-08-02): **BLOCKED.**
 * Every endpoint returns HTTP 403 behind Cloudflare Bot Management — a `__cf_bm`
 * cookie plus a `/cdn-cgi/challenge-platform/` JavaScript challenge — including
 * with a full set of browser-like headers (User-Agent, Accept, Referer, Origin).
 * Getting past that would mean defeating bot detection, which CoveCheck does not
 * do. Datacenter IPs such as Vercel's are blocked more aggressively still, so
 * this would not work from production even if it worked from a laptop.
 *
 * Consequently this adapter is **disabled unless `SURFLINE_ENABLED` is set**, and
 * `fetchNearbySurfReport` resolves to `{ status: 'disabled' }`. The code is kept
 * intact and tested so it is ready if legitimate access ever exists — a
 * partnership, a licensed key, or a documented endpoint.
 *
 * ALSO UNVERIFIED: the Zod schemas below were written from the documented-by-
 * observation shapes of these endpoints and have **never been validated against a
 * live 200 response**, because no 200 was obtainable. Expect to correct them the
 * first time real data flows.
 *
 * OTHER LIMITS, per the brief:
 *   - Unauthenticated access reaches only ~5-6 days out, at coarser granularity
 *     than Surfline's premium product.
 *   - Cromwell's is a snorkelling cove, not a named surf break. Surfline's spot
 *     database is organised around surf breaks, so the nearest match is a
 *     *different place*. Its name and distance are always surfaced in the UI.
 *
 * HARD RULE: this is display-only. It must never reach the verdict engine,
 * `exposedSwellHeightFt`, or confidence scoring. See `lib/engine/` — nothing
 * there imports this file, and nothing there should.
 */

import { z } from 'zod'

const BASE = 'https://services.surfline.com'

/** Per-attempt timeout. Kept short: this is a nice-to-have and must not delay a verdict. */
const TIMEOUT_MS = 4_000

/**
 * Beyond this, the matched break is a different stretch of coast and the UI says
 * so rather than presenting the number as if it described Cromwell's.
 */
export const MAX_REPRESENTATIVE_MILES = 3

// ---------------------------------------------------------------------------
// Unverified response schemas — see the header comment.
// ---------------------------------------------------------------------------

/**
 * Spot ids read off Surfline's public website, not from their API.
 *
 * Black Point is the headland Cromwell's sits on, and Surfline files it under
 * their South Shore Oahu forecast — same coast and same exposure as the cove,
 * which is a far better match than a generic nearest-break search would find.
 * Confirmed 2026-08-02 at surfline.com/surf-report/black-point/5842041f4e65fad6a7708b34.
 *
 * Having the id removes the discovery call, but it does NOT get past the
 * Cloudflare block — verified: `forecasts/wave` and `spots/details` both still
 * return 403 with this id. Name and coordinates are deliberately NOT hardcoded
 * here; they come from `spots/details` so the distance shown in the UI is computed
 * from Surfline's own coordinates rather than from a guess of ours.
 */
export const KNOWN_SPOT_IDS: Record<string, string> = {
  cromwells: '5842041f4e65fad6a7708b34',
}

const spotDetailsSchema = z.object({
  spot: z.object({
    _id: z.string(),
    name: z.string(),
    lat: z.number(),
    lon: z.number(),
  }),
})

const nearbySpotsSchema = z.object({
  data: z.object({
    spots: z.array(
      z.object({
        _id: z.string(),
        name: z.string(),
        lat: z.number(),
        lon: z.number(),
      }),
    ),
  }),
})

const waveForecastSchema = z.object({
  associated: z
    .object({
      units: z.object({ waveHeight: z.string() }).partial().optional(),
      utcOffset: z.number().optional(),
    })
    .optional(),
  data: z.object({
    wave: z.array(
      z.object({
        timestamp: z.number(),
        surf: z.object({
          min: z.number(),
          max: z.number(),
          humanRelation: z.string().nullable().optional(),
        }),
      }),
    ),
  }),
})

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export type SurflineSpot = {
  id: string
  name: string
  latitude: number
  longitude: number
  /** Great-circle distance from the beach, in statute miles. */
  distanceMiles: number
  /** True when the spot is far enough away to describe different conditions. */
  isDistant: boolean
  /**
   * True when the spot appears to sit on a different coast of Oahu, so its
   * exposure differs from a south-facing cove regardless of distance.
   */
  likelyDifferentExposure: boolean
}

export type SurflineSurfHour = {
  /** ISO instant. */
  timestampUtc: string
  minFt: number
  maxFt: number
  /** Surfline's own words, e.g. "knee to thigh". */
  description: string | null
}

export type SurflineReport =
  | { status: 'ok'; spot: SurflineSpot; hours: SurflineSurfHour[]; fetchedAtUtc: string }
  | { status: 'disabled'; reason: string }
  | { status: 'unavailable'; reason: string }

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const EARTH_RADIUS_MILES = 3958.8
const toRad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance in statute miles. */
export function distanceMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Crude coast check for Oahu, and deliberately so.
 *
 * Surfline's spot payload does not state which way a break faces, so there is no
 * authoritative field to read. This uses island geography instead: anything north
 * of ~21.40°N is North Shore, and anything west of ~-158.05°E is the Waianae
 * (west) coast. Both experience swell completely unlike a south-facing cove.
 *
 * It will not catch a nearby east-facing break, which is why distance is reported
 * alongside it and neither claim is presented as authoritative.
 */
export function likelyDifferentExposureOnOahu(spot: { latitude: number; longitude: number }): boolean {
  return spot.latitude > 21.4 || spot.longitude < -158.05
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/**
 * Surfline reports surf in feet by default. Recorded explicitly so a future unit
 * change upstream is visible rather than silently rescaling the card.
 */
const EXPECTED_WAVE_UNIT = 'FT'

function isEnabled(): boolean {
  return Boolean(process.env.SURFLINE_ENABLED)
}

async function getJson(url: string, schema: z.ZodType<unknown>): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return schema.parse(await response.json())
}

/**
 * Nearest listed Surfline break to a point, or null.
 *
 * Uses the nearby-spots endpoint rather than a hardcoded spot id, so the name,
 * coordinates and therefore distance all come from Surfline rather than from an
 * assumption of ours.
 */
export async function findNearestSpot(
  latitude: number,
  longitude: number,
  searchRangeKm = 25,
): Promise<SurflineSpot | null> {
  const url = `${BASE}/kbyg/spots/nearby?latitude=${latitude}&longitude=${longitude}&range=${searchRangeKm}`
  const parsed = nearbySpotsSchema.parse(await getJson(url, nearbySpotsSchema))

  const ranked = parsed.data.spots
    .map((spot) => {
      const miles = distanceMiles(
        { latitude, longitude },
        { latitude: spot.lat, longitude: spot.lon },
      )
      return {
        id: spot._id,
        name: spot.name,
        latitude: spot.lat,
        longitude: spot.lon,
        distanceMiles: miles,
        isDistant: miles > MAX_REPRESENTATIVE_MILES,
        likelyDifferentExposure: likelyDifferentExposureOnOahu({
          latitude: spot.lat,
          longitude: spot.lon,
        }),
      }
    })
    .sort((a, b) => a.distanceMiles - b.distanceMiles)

  return ranked[0] ?? null
}

/** Parse a wave-forecast payload into display rows. Exported for testing. */
export function parseWaveForecast(payload: unknown): SurflineSurfHour[] {
  const parsed = waveForecastSchema.parse(payload)

  const unit = parsed.associated?.units?.waveHeight
  if (unit && unit.toUpperCase() !== EXPECTED_WAVE_UNIT) {
    throw new Error(`unexpected wave height unit ${unit}, expected ${EXPECTED_WAVE_UNIT}`)
  }

  return parsed.data.wave.map((entry) => ({
    timestampUtc: new Date(entry.timestamp * 1000).toISOString(),
    minFt: entry.surf.min,
    maxFt: entry.surf.max,
    description: entry.surf.humanRelation ?? null,
  }))
}

/**
 * The whole adapter, in one call that cannot fail loudly.
 *
 * Every path — disabled, blocked, timed out, wrong shape, domain gone — resolves
 * to a value. It never rejects and never throws, because a supplementary card
 * must not be able to take down a verdict.
 */
function toSpot(
  raw: { _id: string; name: string; lat: number; lon: number },
  beach: { latitude: number; longitude: number },
): SurflineSpot {
  const miles = distanceMiles(beach, { latitude: raw.lat, longitude: raw.lon })
  return {
    id: raw._id,
    name: raw.name,
    latitude: raw.lat,
    longitude: raw.lon,
    distanceMiles: miles,
    isDistant: miles > MAX_REPRESENTATIVE_MILES,
    likelyDifferentExposure: likelyDifferentExposureOnOahu({
      latitude: raw.lat,
      longitude: raw.lon,
    }),
  }
}

/** Authoritative name and coordinates for a known spot id. */
export async function fetchSpotDetails(
  spotId: string,
  beach: { latitude: number; longitude: number },
): Promise<SurflineSpot> {
  const url = `${BASE}/kbyg/spots/details?spotId=${encodeURIComponent(spotId)}`
  const parsed = spotDetailsSchema.parse(await getJson(url, spotDetailsSchema))
  return toSpot(parsed.spot, beach)
}

export async function fetchNearbySurfReport(
  beach: { latitude: number; longitude: number },
  overrides: { fetchNow?: () => Date; knownSpotId?: string } = {},
): Promise<SurflineReport> {
  if (!isEnabled()) {
    return {
      status: 'disabled',
      reason:
        'Surfline is an unofficial endpoint currently behind Cloudflare bot protection; set SURFLINE_ENABLED once legitimate access exists',
    }
  }

  try {
    // Prefer a spot id confirmed off the website; fall back to nearest-break search.
    const spot = overrides.knownSpotId
      ? await fetchSpotDetails(overrides.knownSpotId, beach)
      : await findNearestSpot(beach.latitude, beach.longitude)
    if (!spot) return { status: 'unavailable', reason: 'no Surfline break listed near this beach' }

    const url = `${BASE}/kbyg/spots/forecasts/wave?spotId=${encodeURIComponent(spot.id)}&days=5&intervalHours=3`
    const hours = parseWaveForecast(await getJson(url, waveForecastSchema))

    if (hours.length === 0) {
      return { status: 'unavailable', reason: `Surfline returned no forecast for ${spot.name}` }
    }

    return {
      status: 'ok',
      spot,
      hours,
      fetchedAtUtc: (overrides.fetchNow?.() ?? new Date()).toISOString(),
    }
  } catch (cause) {
    // Deliberately broad. This includes the entire domain going away.
    const message = cause instanceof Error ? cause.message : String(cause)
    return { status: 'unavailable', reason: `Surfline request failed — ${message}` }
  }
}
