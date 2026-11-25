import { describe, expect, it } from 'vitest'

import { appendQuery } from '../append-query.mjs'

describe('appendQuery', () => {
  it('should return the URL untouched when there is nothing to append', () => {
    expect(appendQuery('/ws', undefined)).toBe('/ws')
    expect(appendQuery('/ws', {})).toBe('/ws')
    expect(appendQuery('/ws', { a: undefined, b: null, c: [] })).toBe('/ws')
  })

  it('should serialize primitives, dates and arrays', () => {
    const since = new Date('2024-01-02T03:04:05.678Z')
    expect(appendQuery('/ws', { q: 'a b', n: 1, ok: false, since })).toBe(
      '/ws?q=a+b&n=1&ok=false&since=2024-01-02T03%3A04%3A05.678Z',
    )
    expect(appendQuery('/ws', { tag: ['a', undefined, 'b', null, since] })).toBe(
      '/ws?tag=a&tag=b&tag=2024-01-02T03%3A04%3A05.678Z',
    )
  })

  it('should continue an existing query string', () => {
    expect(appendQuery('/ws?v=2', { token: 't' })).toBe('/ws?v=2&token=t')
    expect(appendQuery('/ws?', { token: 't' })).toBe('/ws?token=t')
    expect(appendQuery('/ws?v=2&', { token: 't' })).toBe('/ws?v=2&token=t')
  })

  it('should keep a fragment at the end', () => {
    expect(appendQuery('/events#top', { token: 't' })).toBe('/events?token=t#top')
    expect(appendQuery('/events?v=2#top', { token: 't' })).toBe('/events?v=2&token=t#top')
  })
})
