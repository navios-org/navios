import { describe, expect, it } from 'vitest'

import { EndpointError } from './endpoint-error.mjs'
import { getCookie, getFilename, getHeader, getRetryAfterMs } from './response-headers.mjs'

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

describe('getFilename', () => {
  const meta = (value: string) => ({
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-disposition': value }),
  })

  it('reads a quoted and an unquoted filename', () => {
    expect(getFilename(meta('attachment; filename="report 2026.pdf"'))).toBe('report 2026.pdf')
    expect(getFilename(meta('attachment; filename=report.pdf'))).toBe('report.pdf')
  })

  it('unescapes a quoted name and keeps a semicolon inside quotes', () => {
    expect(getFilename(meta('attachment; filename="a \\"b\\"; c.txt"'))).toBe('a "b"; c.txt')
  })

  it('prefers filename* and decodes it as UTF-8', () => {
    const value = `attachment; filename="naive.pdf"; filename*=UTF-8''na%C3%AFve%20r%C3%A9sum%C3%A9.pdf`
    expect(getFilename(meta(value))).toBe('naïve résumé.pdf')
  })

  it('decodes filename* in ISO-8859-1', () => {
    expect(getFilename(meta("attachment; filename*=iso-8859-1'en'%E9t%E9.txt"))).toBe('été.txt')
  })

  it('falls back to filename when filename* cannot be decoded', () => {
    expect(getFilename(meta("attachment; filename=plain.txt; filename*=UTF-8''%E0%A4%A"))).toBe(
      'plain.txt',
    )
  })

  it('removes directory parts', () => {
    expect(getFilename(meta('attachment; filename="../../etc/passwd"'))).toBe('passwd')
    expect(getFilename(meta('attachment; filename="C:\\\\temp\\\\x.txt"'))).toBe('x.txt')
    expect(getFilename(meta('attachment; filename=".."'))).toBeNull()
  })

  it('accepts a plain header record, a raw value and null', () => {
    expect(getFilename({ headers: { 'Content-Disposition': 'inline; filename=a.csv' } })).toBe(
      'a.csv',
    )
    expect(getFilename('attachment; filename=b.csv')).toBe('b.csv')
    expect(getFilename(null)).toBeNull()
    expect(getFilename(meta('attachment'))).toBeNull()
    expect(getFilename({ headers: {} })).toBeNull()
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
