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

  it('should write objects as JSON, as a multipart body does', () => {
    // An object used to be written as `[object Object]`
    expect(appendQuery('/ws', { filter: { role: 'admin' }, ids: [[1, 2]] })).toBe(
      '/ws?filter=%7B%22role%22%3A%22admin%22%7D&ids=%5B1%2C2%5D',
    )
    const money = { toJSON: () => '12.50' }
    expect(appendQuery('/ws', { price: money, n: 10n })).toBe('/ws?price=12.50&n=10')
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
