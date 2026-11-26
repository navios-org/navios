import { describe, expect, it } from 'vitest'

import { LiveRequests } from '../context/live-requests.mjs'

import type { RequestContext } from '../context/request-context.mjs'

// What the list needs of a request: its two links.
function request(name: string): RequestContext {
  return { name, previousLive: null, nextLive: null } as unknown as RequestContext
}

const names = (live: LiveRequests) =>
  [...live].map((ctx) => (ctx as unknown as { name: string }).name)

describe('LiveRequests', () => {
  it('holds a request once, however often it is added', () => {
    const live = new LiveRequests()
    const a = request('a')
    live.add(a)
    live.add(a)
    expect(live.size).toBe(1)
    expect(names(live)).toEqual(['a'])
  })

  it('removes the first, a middle and the last request', () => {
    const live = new LiveRequests()
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(request)
    for (const ctx of [a, b, c, d]) {
      live.add(ctx)
    }
    expect(names(live)).toEqual(['d', 'c', 'b', 'a'])

    expect(live.delete(c)).toBe(true)
    expect(names(live)).toEqual(['d', 'b', 'a'])
    expect(live.delete(d)).toBe(true)
    expect(names(live)).toEqual(['b', 'a'])
    expect(live.delete(a)).toBe(true)
    expect(names(live)).toEqual(['b'])
    expect(live.delete(b)).toBe(true)
    expect(names(live)).toEqual([])
    expect(live.size).toBe(0)
  })

  it('ignores a request it does not hold', () => {
    const live = new LiveRequests()
    const a = request('a')
    expect(live.delete(a)).toBe(false)
    live.add(a)
    live.delete(a)
    expect(live.delete(a)).toBe(false)
    expect(live.size).toBe(0)
  })

  it('takes a request back after it was removed', () => {
    const live = new LiveRequests()
    const [a, b] = ['a', 'b'].map(request)
    live.add(a)
    live.add(b)
    live.delete(a)
    live.add(a)
    expect(names(live)).toEqual(['a', 'b'])
    expect(live.size).toBe(2)
  })

  it('iterates the requests as they were, while they are removed', () => {
    const live = new LiveRequests()
    const all = ['a', 'b', 'c'].map(request)
    for (const ctx of all) {
      live.add(ctx)
    }
    const seen: RequestContext[] = []
    for (const ctx of live) {
      seen.push(ctx)
      live.delete(ctx)
    }
    expect(seen).toHaveLength(3)
    expect(live.size).toBe(0)
  })
})
