import { describe, expect, it } from 'vitest'

import { EndpointError } from './endpoint-error.mjs'
import { getCookie, getHeader, getRetryAfterMs } from './response-headers.mjs'

describe('response header helpers', () => {
  it('getHeader returns string or null', () => {
    const meta = {
      status: 200,
      statusText: 'OK',
      headers: new Headers({ etag: 'abc' }),
    }
    expect(getHeader(meta, 'etag')).toBe('abc')
    expect(getHeader(meta, 'missing')).toBeNull()
    expect(getHeader(null, 'etag')).toBeNull()
  })

  it('getCookie parses set-cookie name', () => {
    const meta = {
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'set-cookie': 'session=xyz; Path=/' }),
    }
    expect(getCookie(meta, 'session')).toBe('xyz')
  })

  it('getRetryAfterMs parses seconds and HTTP-date forms', () => {
    const a = {
      status: 429,
      statusText: '',
      headers: new Headers({ 'retry-after': '120' }),
    }
    expect(getRetryAfterMs(a)).toBe(120_000)
    const future = new Date(Date.now() + 60_000).toUTCString()
    const b = {
      status: 429,
      statusText: '',
      headers: new Headers({ 'retry-after': future }),
    }
    expect(getRetryAfterMs(b)).toBeGreaterThan(0)
  })
})

describe('EndpointError.toJSON', () => {
  it('should leave out the cookies a response sets', () => {
    const error = new EndpointError({
      kind: 'http-unknown',
      endpoint: { method: 'POST', url: '/login' },
      status: 429,
      response: {
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers([
          ['set-cookie', 'session=secret'],
          ['retry-after', '30'],
        ]),
      },
    })

    expect(error.toJSON().response?.headers).toEqual({ 'retry-after': '30' })
    expect(error.response?.headers.get('set-cookie')).toBe('session=secret')
  })
})
