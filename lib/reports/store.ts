/**
 * Visit-report storage.
 *
 * Upstash Redis over its REST API — no SDK, just fetch — configured by the env
 * vars the Vercel Marketplace integration creates (KV_REST_API_URL/TOKEN) or the
 * plain Upstash ones. Without them:
 *   - in development and tests, an in-memory store, so the flow can be exercised;
 *   - in production, `null` — the API then refuses with 503 rather than accepting
 *     a report it would silently drop.
 */

export type ReportStore = {
  /** Append a stored report (already serialized). */
  append(json: string): Promise<void>
  /** Most recent first. */
  list(limit: number): Promise<string[]>
  /** Increment a counter that expires after `ttlSeconds`; returns the new count. */
  hit(key: string, ttlSeconds: number): Promise<number>
  /** A small JSON value by key (closure checks). */
  getValue(key: string): Promise<string | null>
  setValue(key: string, value: string): Promise<void>
}

const LIST_KEY = 'covecheck:reports:v1'

function upstashStore(url: string, token: string): ReportStore {
  async function call(command: (string | number)[]): Promise<unknown> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`report store: HTTP ${res.status}`)
    const body = (await res.json()) as { result?: unknown; error?: string }
    if (body.error) throw new Error(`report store: ${body.error}`)
    return body.result
  }
  return {
    async append(json) {
      await call(['LPUSH', LIST_KEY, json])
    },
    async list(limit) {
      return ((await call(['LRANGE', LIST_KEY, 0, limit - 1])) as string[]) ?? []
    },
    async hit(key, ttlSeconds) {
      const count = Number(await call(['INCR', key]))
      if (count === 1) await call(['EXPIRE', key, ttlSeconds])
      return count
    },
    async getValue(key) {
      return ((await call(['GET', key])) as string | null) ?? null
    },
    async setValue(key, value) {
      await call(['SET', key, value])
    },
  }
}

function memoryStore(): ReportStore {
  const reports: string[] = []
  const counters = new Map<string, { count: number; until: number }>()
  const values = new Map<string, string>()
  return {
    async append(json) {
      reports.unshift(json)
    },
    async list(limit) {
      return reports.slice(0, limit)
    },
    async hit(key, ttlSeconds) {
      const now = Date.now()
      const entry = counters.get(key)
      if (!entry || entry.until < now) {
        counters.set(key, { count: 1, until: now + ttlSeconds * 1000 })
        return 1
      }
      entry.count += 1
      return entry.count
    },
    async getValue(key) {
      return values.get(key) ?? null
    },
    async setValue(key, value) {
      values.set(key, value)
    },
  }
}

let memory: ReportStore | null = null

export function getReportStore(env: Record<string, string | undefined> = process.env): ReportStore | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN
  if (url && token) return upstashStore(url, token)
  if (env.NODE_ENV === 'production') return null
  memory ??= memoryStore()
  return memory
}
