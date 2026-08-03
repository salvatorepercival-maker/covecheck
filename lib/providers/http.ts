import type { ZodType } from 'zod'
import type { ProviderId } from '../types'

/**
 * Shared fetch layer for every external provider.
 *
 * Two rules this file exists to enforce:
 *   1. A provider failure degrades, it does not throw. Callers get a result they
 *      must destructure, so "this source failed" cannot be mistaken for data.
 *   2. Nothing reaches the rest of the app unvalidated. A 200 response with an
 *      unexpected shape is a failure, not data.
 *
 * Notably absent: any default value. A failed or missing field stays absent all
 * the way through — never coerced to 0, which would read as "flat calm".
 */

export type ProviderFailure = {
  kind: 'timeout' | 'network' | 'http_status' | 'invalid_json' | 'schema_mismatch'
  message: string
  /** Present for `http_status`. */
  status?: number
}

export type ProviderResult<T> =
  | { ok: true; data: T; fetchedAtUtc: string; provider: ProviderId }
  | { ok: false; error: ProviderFailure; fetchedAtUtc: string; provider: ProviderId }

export type FetchOptions<T> = {
  provider: ProviderId
  url: string
  schema: ZodType<T>
  /** Per-attempt timeout. Total wall time can reach roughly timeoutMs * attempts plus backoff. */
  timeoutMs?: number
  /** Total attempts including the first. Capped so a dead provider cannot stall a page render. */
  attempts?: number
  headers?: Record<string, string>
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch
  /** Injectable for tests so backoff does not make suites slow. */
  sleepImpl?: (ms: number) => Promise<void>
}

const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_ATTEMPTS = 3
const MAX_ATTEMPTS = 5
const BASE_BACKOFF_MS = 250

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Retrying on a 4xx just burns the budget — the request itself is wrong. */
function isRetryable(failure: ProviderFailure): boolean {
  if (failure.kind === 'timeout' || failure.kind === 'network') return true
  if (failure.kind === 'http_status') {
    const status = failure.status ?? 0
    return status === 429 || status >= 500
  }
  // Schema and JSON failures are deterministic — a retry returns the same body.
  return false
}

async function attemptOnce<T>(
  options: FetchOptions<T>,
  timeoutMs: number,
): Promise<{ ok: true; data: T } | { ok: false; error: ProviderFailure }> {
  const doFetch = options.fetchImpl ?? fetch

  let response: Response
  try {
    response = await doFetch(options.url, {
      headers: options.headers,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (cause) {
    const isAbort =
      cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')
    return {
      ok: false,
      error: {
        kind: isAbort ? 'timeout' : 'network',
        message: cause instanceof Error ? cause.message : String(cause),
      },
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      error: {
        kind: 'http_status',
        status: response.status,
        message: `${options.provider} returned HTTP ${response.status}`,
      },
    }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (cause) {
    return {
      ok: false,
      error: {
        kind: 'invalid_json',
        message: cause instanceof Error ? cause.message : String(cause),
      },
    }
  }

  const parsed = options.schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: 'schema_mismatch',
        message: parsed.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; '),
      },
    }
  }

  return { ok: true, data: parsed.data }
}

/** Fetch, validate, and retry with exponential backoff. Resolves to a result; never rejects. */
export async function fetchProviderJson<T>(options: FetchOptions<T>): Promise<ProviderResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const attempts = Math.min(options.attempts ?? DEFAULT_ATTEMPTS, MAX_ATTEMPTS)
  const sleep = options.sleepImpl ?? defaultSleep

  let lastError: ProviderFailure = {
    kind: 'network',
    message: 'no attempt was made',
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const outcome = await attemptOnce(options, timeoutMs)

    if (outcome.ok) {
      return {
        ok: true,
        data: outcome.data,
        fetchedAtUtc: new Date().toISOString(),
        provider: options.provider,
      }
    }

    lastError = outcome.error
    if (!isRetryable(outcome.error) || attempt === attempts) break

    // 250ms, 500ms, 1s, 2s …
    await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1))
  }

  return {
    ok: false,
    error: lastError,
    fetchedAtUtc: new Date().toISOString(),
    provider: options.provider,
  }
}

/** Descriptive User-Agent, which api.weather.gov asks callers to send. */
export const NWS_USER_AGENT = 'CoveCheck/0.1 (https://covecheck.com)'
