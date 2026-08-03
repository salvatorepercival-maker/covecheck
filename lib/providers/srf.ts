import { z } from 'zod'
import type { ShoreAspect, SurfZoneBand, SurfZoneForecast } from '../types'
import { fetchProviderJson, NWS_USER_AGENT, type ProviderResult } from './http'

/**
 * NWS Surf Zone Forecast (product type SRF, office HFO).
 *
 * This is the only source that reports surf *face* height per shore aspect,
 * which is the quantity the Cromwell's thresholds were written in. It is also the
 * only fragile source: the JSON envelope is stable but the shore table inside
 * `productText` is fixed-width plain text.
 *
 * The table looks like this, and the parser derives every column position from
 * the text rather than hardcoding offsets:
 *
 *                         Tonight                    Monday
 *   Shores                  Surf                       Surf
 *                        PM     AM                  AM     PM
 *   South Facing         1-3    1-3                 1-3    1-3
 *
 * Because this source only bounds magnitude and never gates a verdict on its own,
 * a parse failure degrades to "no bound available" instead of failing the render.
 */

const PRODUCT_LIST = 'https://api.weather.gov/products/types/SRF/locations/HFO'

const productListSchema = z.object({
  '@graph': z.array(z.object({ id: z.string(), issuanceTime: z.string() })),
})

const productSchema = z.object({
  id: z.string(),
  issuanceTime: z.string(),
  productText: z.string(),
})

export type SrfParseResult = {
  forecast: SurfZoneForecast | null
  /** Layout problems worth logging. Non-empty with a null forecast means the table moved. */
  warnings: string[]
}

const SHORE_ROW = /^(North|West|South|East)\s+Facing\b/i
const SURF_BAND = /^(\d+)-(\d+)$/
const DAY_HEADER_STOPWORDS = new Set(['Shores', 'Surf'])

type Token = { text: string; start: number }

function tokenize(line: string): Token[] {
  return [...line.matchAll(/\S+/g)].map((m) => ({ text: m[0], start: m.index }))
}

/** Center offset of a token, used to associate sub-columns with day headers. */
const centerOf = (t: Token) => t.start + t.text.length / 2

/**
 * Slice out one island's section.
 *
 * Sections start with a bare `Oahu-` line and run until the next island header or
 * the next NWS zone code block (e.g. `HIZ003-029>031-040300-`).
 */
export function extractIslandSection(productText: string, island: string): string[] | null {
  const lines = productText.split('\n')
  const startIndex = lines.findIndex((line) => line.trim() === `${island}-`)
  if (startIndex === -1) return null

  const rest = lines.slice(startIndex + 1)
  const endOffset = rest.findIndex(
    (line) => /^[A-Z]{2}Z\d/.test(line.trim()) || /^\.[A-Z]/.test(line.trim()),
  )

  return endOffset === -1 ? rest : rest.slice(0, endOffset)
}

export function parseSurfZoneForecast(
  productText: string,
  issuanceTime: string,
  island: string,
): SrfParseResult {
  const warnings: string[] = []
  const section = extractIslandSection(productText, island)
  if (!section) {
    return { forecast: null, warnings: [`no section found for island ${JSON.stringify(island)}`] }
  }

  // The AM/PM line is the sub-column ruler: every value column lines up with it.
  const periodLine = section.find((line) => {
    const tokens = tokenize(line)
    return tokens.length >= 2 && tokens.every((t) => t.text === 'AM' || t.text === 'PM')
  })
  if (!periodLine) {
    return { forecast: null, warnings: ['could not locate the AM/PM sub-column header row'] }
  }
  const periodTokens = tokenize(periodLine)

  // Day headers sit above it: a line of words that are neither AM/PM nor table labels.
  const periodLineIndex = section.indexOf(periodLine)
  const dayTokens =
    section
      .slice(0, periodLineIndex)
      .map(tokenize)
      .filter(
        (tokens) =>
          tokens.length > 0 &&
          tokens.every(
            (t) => /^[A-Za-z]+$/.test(t.text) && !DAY_HEADER_STOPWORDS.has(t.text) && t.text !== 'AM' && t.text !== 'PM',
          ),
      )
      .at(-1) ?? []

  if (dayTokens.length === 0) {
    warnings.push('no day header row found; columns will be labelled by period only')
  }

  // Label each sub-column by the day header nearest to it horizontally.
  const columnLabels = periodTokens.map((period) => {
    if (dayTokens.length === 0) return period.text
    const nearest = dayTokens.reduce((best, candidate) =>
      Math.abs(centerOf(candidate) - centerOf(period)) < Math.abs(centerOf(best) - centerOf(period))
        ? candidate
        : best,
    )
    return `${nearest.text} ${period.text}`
  })

  const bands: SurfZoneBand[] = []

  for (const line of section) {
    if (!SHORE_ROW.test(line)) continue
    const shore = line.trim().split(/\s+/)[0].toLowerCase() as ShoreAspect

    const valueTokens = tokenize(line).filter((t) => SURF_BAND.test(t.text))
    if (valueTokens.length !== periodTokens.length) {
      warnings.push(
        `${shore} facing row has ${valueTokens.length} surf values but ${periodTokens.length} columns; skipped`,
      )
      continue
    }

    valueTokens.forEach((token, index) => {
      const match = SURF_BAND.exec(token.text)
      if (!match) return

      // Values should sit under their header. Drifting alignment means the layout
      // changed and the column labels can no longer be trusted.
      const drift = Math.abs(token.start - periodTokens[index].start)
      if (drift > 2) {
        warnings.push(
          `${shore} facing column ${index} is offset ${drift} chars from its "${columnLabels[index]}" header`,
        )
      }

      bands.push({
        shore,
        column: columnLabels[index],
        minFt: Number(match[1]),
        maxFt: Number(match[2]),
      })
    })
  }

  if (bands.length === 0) {
    return { forecast: null, warnings: [...warnings, 'no shore rows parsed from the section'] }
  }

  return {
    forecast: { island, issuedUtc: new Date(issuanceTime).toISOString(), bands },
    warnings,
  }
}

/** Bands for one shore aspect, in column order. */
export function bandsForShore(
  forecast: SurfZoneForecast,
  shore: ShoreAspect,
): readonly SurfZoneBand[] {
  return forecast.bands.filter((band) => band.shore === shore)
}

/** Fetch the latest SRF product for HFO and parse one island's table. */
export async function fetchSurfZoneForecast(
  island: string,
  overrides: { fetchImpl?: typeof fetch } = {},
): Promise<ProviderResult<SrfParseResult>> {
  const headers = { 'User-Agent': NWS_USER_AGENT, Accept: 'application/ld+json' }

  const list = await fetchProviderJson({
    provider: 'srf',
    url: PRODUCT_LIST,
    schema: productListSchema,
    headers,
    fetchImpl: overrides.fetchImpl,
  })
  if (!list.ok) return list

  const latest = list.data['@graph'][0]
  if (!latest) {
    return {
      ok: false,
      error: { kind: 'schema_mismatch', message: 'SRF product list was empty' },
      fetchedAtUtc: list.fetchedAtUtc,
      provider: 'srf',
    }
  }

  const product = await fetchProviderJson({
    provider: 'srf',
    url: `https://api.weather.gov/products/${latest.id}`,
    schema: productSchema,
    headers,
    fetchImpl: overrides.fetchImpl,
  })
  if (!product.ok) return product

  return {
    ...product,
    data: parseSurfZoneForecast(product.data.productText, product.data.issuanceTime, island),
  }
}
