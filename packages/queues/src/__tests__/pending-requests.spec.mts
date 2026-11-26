import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PendingRequests, REQUEST_TIMEOUT_MS } from '../brokers/pending-requests.mjs'

describe('PendingRequests', () => {
  let requests: PendingRequests

  beforeEach(() => {
    vi.useFakeTimers()
    requests = new PendingRequests()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should resolve a request with its parsed reply', async () => {
    const reply = requests.create('a', 'topic: users')

    expect(requests.settle('a', '{"name":"Ada"}')).toBe(true)
    await expect(reply).resolves.toEqual({ name: 'Ada' })
  })

  it('should reject a request whose reply is not JSON', async () => {
    const reply = requests.create('a', 'topic: users')

    expect(requests.settle('a', 'not json')).toBe(true)
    await expect(reply).rejects.toThrow(SyntaxError)
  })

  it('should ignore a reply that no request waits for', async () => {
    const reply = requests.create('a', 'topic: users')

    expect(requests.settle('b', '{}')).toBe(false)
    expect(requests.settle('a', '1')).toBe(true)
    expect(requests.settle('a', '2')).toBe(false)
    await expect(reply).resolves.toBe(1)
  })

  it('should reject a request that gets no reply in time', async () => {
    const reply = requests.create('a', 'topic: users')
    const settled = expect(reply).rejects.toThrow('Request timeout for topic: users')

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)

    await settled
    expect(requests.settle('a', '{}')).toBe(false)
  })

  it('should wait as long as it is told', async () => {
    const reply = requests.create('a', 'topic: users', 100)
    const settled = expect(reply).rejects.toThrow('Request timeout for topic: users')

    await vi.advanceTimersByTimeAsync(100)

    await settled
  })

  it('should not time out a settled request', async () => {
    const reply = requests.create('a', 'topic: users')
    requests.settle('a', '{}')

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)

    await expect(reply).resolves.toEqual({})
    expect(vi.getTimerCount()).toBe(0)
  })

  it('should reject one request with the given reason', async () => {
    const reply = requests.create('a', 'topic: users')
    const other = requests.create('b', 'topic: users')
    const reason = new Error('send failed')

    requests.fail('a', reason)

    await expect(reply).rejects.toBe(reason)
    expect(requests.settle('b', '2')).toBe(true)
    await expect(other).resolves.toBe(2)
  })

  it('should reject every waiting request and clear their timers', async () => {
    const first = requests.create('a', 'topic: users')
    const second = requests.create('b', 'topic: orders')

    requests.rejectAll()

    await expect(first).rejects.toThrow('Connection closed')
    await expect(second).rejects.toThrow('Connection closed')
    expect(vi.getTimerCount()).toBe(0)
    expect(requests.settle('a', '{}')).toBe(false)
  })
})
