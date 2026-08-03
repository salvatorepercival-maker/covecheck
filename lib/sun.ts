/**
 * Sunrise, sunset and civil twilight, computed locally.
 *
 * These are pure astronomy from latitude, longitude and date, so there is no
 * provider to call and no key to hold — and no dependency either. The NOAA
 * sunrise equation is a few lines and accurate to about a minute at Hawaiʻi's
 * latitude, which is far finer than this display needs.
 *
 * "First light" and "last light" are **civil twilight**: the sun 6° below the
 * horizon, the conventional point at which there is enough light to see without
 * artificial help. That is the number that matters for arriving at a beach.
 */

import { HAWAII_UTC_OFFSET_HOURS } from './time'

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Sun altitude at the moment of sunrise/sunset, allowing for refraction and the solar disc. */
const SUNRISE_ALTITUDE_DEG = -0.833
/** Civil twilight. */
const CIVIL_TWILIGHT_ALTITUDE_DEG = -6

/** Julian date for local midnight of a `YYYY-MM-DD` calendar day at a given UTC offset. */
function julianDayFor(date: string, utcOffsetHours: number): number {
  const [year, month, day] = date.split('-').map(Number)
  // Days from the Unix epoch to the Julian epoch.
  const utcMidnightMs = Date.UTC(year, month - 1, day) - utcOffsetHours * 3_600_000
  return utcMidnightMs / 86_400_000 + 2440587.5
}

export type SunEvent = {
  /** Minutes past local midnight, or null when the event does not occur that day. */
  minutesOfDay: number | null
}

export type SunTimes = {
  firstLight: number | null
  sunrise: number | null
  sunset: number | null
  lastLight: number | null
}

/**
 * Solve the sunrise equation for one altitude, returning local minutes past
 * midnight for the morning and evening crossings.
 *
 * Returns nulls when the sun never reaches that altitude — at Hawaiʻi's latitude
 * that never happens, but the guard keeps the function honest for other beaches.
 */
function crossingsFor(
  julianDay: number,
  latitude: number,
  longitude: number,
  altitudeDeg: number,
  utcOffsetHours: number,
): { morning: number | null; evening: number | null } {
  // West longitude is positive in this formulation — the sign that matters.
  const westLongitude = -longitude
  const daysSinceJ2000 = julianDay - 2451545.0
  const cycle = Math.round(daysSinceJ2000 - 0.0009 - westLongitude / 360)

  const approxTransit = (hourAngleDeg: number) =>
    0.0009 + (hourAngleDeg + westLongitude) / 360 + cycle

  const meanSolarTime = approxTransit(0)
  const meanAnomaly = (357.5291 + 0.98560028 * meanSolarTime) % 360
  const center =
    1.9148 * Math.sin(toRad(meanAnomaly)) +
    0.02 * Math.sin(toRad(2 * meanAnomaly)) +
    0.0003 * Math.sin(toRad(3 * meanAnomaly))
  const eclipticLongitude = (meanAnomaly + center + 102.9372 + 180) % 360

  const solarTransitJd = (approx: number) =>
    2451545.0 +
    approx +
    0.0053 * Math.sin(toRad(meanAnomaly)) -
    0.0069 * Math.sin(toRad(2 * eclipticLongitude))

  const solarNoonJd = solarTransitJd(meanSolarTime)
  const declination = Math.asin(Math.sin(toRad(23.4397)) * Math.sin(toRad(eclipticLongitude)))

  const cosHourAngle =
    (Math.sin(toRad(altitudeDeg)) - Math.sin(toRad(latitude)) * Math.sin(declination)) /
    (Math.cos(toRad(latitude)) * Math.cos(declination))

  // Sun stays above or below this altitude all day (polar cases).
  if (cosHourAngle > 1 || cosHourAngle < -1) return { morning: null, evening: null }

  const hourAngleDeg = toDeg(Math.acos(cosHourAngle))
  const settingJd = solarTransitJd(approxTransit(hourAngleDeg))
  // Sunrise is the mirror of sunset about solar noon.
  const risingJd = solarNoonJd - (settingJd - solarNoonJd)

  const toLocalMinutes = (jd: number) => {
    const ms = (jd - 2440587.5) * 86_400_000 + utcOffsetHours * 3_600_000
    const local = new Date(ms)
    return local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60
  }

  return { morning: toLocalMinutes(risingJd), evening: toLocalMinutes(settingJd) }
}

/**
 * Sun times for a local calendar date, as minutes past local midnight.
 *
 * Defaults to Hawaiʻi's constant UTC-10, matching `lib/time.ts`.
 */
export function sunTimesFor(
  date: string,
  latitude: number,
  longitude: number,
  utcOffsetHours: number = HAWAII_UTC_OFFSET_HOURS,
): SunTimes {
  const jd = julianDayFor(date, utcOffsetHours)

  const daylight = crossingsFor(jd, latitude, longitude, SUNRISE_ALTITUDE_DEG, utcOffsetHours)
  const twilight = crossingsFor(jd, latitude, longitude, CIVIL_TWILIGHT_ALTITUDE_DEG, utcOffsetHours)

  return {
    firstLight: twilight.morning,
    sunrise: daylight.morning,
    sunset: daylight.evening,
    lastLight: twilight.evening,
  }
}

/** "5:42am" — lowercase and compact, for quiet supporting text. */
export function formatSunTime(minutesOfDay: number | null): string | null {
  if (minutesOfDay === null) return null
  const rounded = Math.round(minutesOfDay)
  const hour24 = Math.floor(rounded / 60) % 24
  const minute = rounded % 60
  const suffix = hour24 < 12 ? 'am' : 'pm'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${String(minute).padStart(2, '0')}${suffix}`
}
