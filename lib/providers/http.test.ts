import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { fetchProviderJson } from './http'

const schema = z.object({ value: z.number() })
const noSleep = () => Promise.resolve()

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('fetchProviderJson', () => {
  it('returns validated data on success', async () => {
    const result = await fetchProviderJson({
      provider: 'marine',
      url: 'https://example.test/ok',
      schema,
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ value: 42 })),
      sleepImpl: noSleep,
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.value).toBe(42)
    expect(result.fetchedAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('rejects a 200 whose body does not match the schema', async () => {
    const result = await fetchProviderJson({
      provider: 'marine',
      url: 'https://example.test/wrong-shape',
      schema,
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ value: 'not a number' })),
      sleepImpl: noSleep,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('schema_mismatch')
      expect(result.error.message).toMatch(/value/)
    }
  })

  it('does not retry a schema mismatch, since the body is deterministic', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ nope: true }))
    await fetchProviderJson({
      provider: 'marine',
      url: 'https://example.test/bad',
      schema,
      attempts: 3,
      fetchImpl,
      sleepImpl: noSleep,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not retry a 4xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 404))
    const result = await fetchProviderJson({
      provider: 'tides',
      url: 'https://example.test/missing',
      schema,
      attempts: 3,
      fetchImpl,
      sleepImpl: noSleep,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    if (!result.ok) {
      expect(result.error.kind).toBe('http_status')
      expect(result.error.status).toBe(404)
    }
  })

  it('retries a 5xx and succeeds on a later attempt', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ value: 7 }))

    const result = await fetchProviderJson({
      provider: 'weather',
      url: 'https://example.test/flaky',
      schema,
      attempts: 3,
      fetchImpl,
      sleepImpl: noSleep,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
  })

  it('retries a 429', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({ value: 1 }))

    await fetchProviderJson({
      provider: 'weather',
      url: 'https://example.test/limited',
      schema,
      fetchImpl,
      sleepImpl: noSleep,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('caps total attempts and reports the last failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500))
    const result = await fetchProviderJson({
      provider: 'marine',
      url: 'https://example.test/down',
      schema,
      attempts: 3,
      fetchImpl,
      sleepImpl: noSleep,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.status).toBe(500)
  })

  it('never exceeds the hard attempt ceiling', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500))
    await fetchProviderJson({
      provider: 'marine',
      url: 'https://example.test/down',
      schema,
      attempts: 50,
      fetchImpl,
      sleepImpl: noSleep,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(5)
  })

  it('classifies an abort as a timeout and retries it', async () => {
    const abort = Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' })
    const fetchImpl = vi.fn().mockRejectedValueOnce(abort).mockResolvedValueOnce(jsonResponse({ value: 3 }))

    const result = await fetchProviderJson({
      provider: 'srf',
      url: 'https://example.test/slow',
      schema,
      fetchImpl,
      sleepImpl: noSleep,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
  })

  it('reports invalid JSON distinctly from a network failure', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('<html>not json</html>', { status: 200 }))

    const result = await fetchProviderJson({
      provider: 'srf',
      url: 'https://example.test/html',
      schema,
      fetchImpl,
      sleepImpl: noSleep,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('invalid_json')
  })

  it('backs off exponentially between retries', async () => {
    const delays: number[] = []
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500))

    await fetchProviderJson({
      provider: 'marine',
      url: 'https://example.test/down',
      schema,
      attempts: 4,
      fetchImpl,
      sleepImpl: async (ms) => {
        delays.push(ms)
      },
    })

    expect(delays).toEqual([250, 500, 1000])
  })

  it('passes provider headers through', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ value: 1 }))
    await fetchProviderJson({
      provider: 'alerts',
      url: 'https://example.test/nws',
      schema,
      headers: { 'User-Agent': 'CoveCheck/test' },
      fetchImpl,
      sleepImpl: noSleep,
    })

    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      headers: { 'User-Agent': 'CoveCheck/test' },
    })
  })
})
