import { describe, expect, it } from 'vitest'

import {
  isEnvelopeError,
  isHttpError,
  isNetworkError,
  isUnknownHttpError,
  isValidationError,
} from './guards.mjs'

describe('envelope error guards', () => {
  it('isHttpError narrows by kind and status', () => {
    const e = { kind: 'http', status: 404, body: { kind: 'not_found' } } as const
    expect(isHttpError(e)).toBe(true)
    expect(isHttpError(e, 404)).toBe(true)
    expect(isHttpError(e, 500)).toBe(false)
  })

  it('isHttpError returns false for other kinds', () => {
    expect(isHttpError({ kind: 'network', cause: new Error('x') } as const)).toBe(false)
  })

  it('isUnknownHttpError narrows', () => {
    expect(isUnknownHttpError({ kind: 'http-unknown', status: 502, body: 'Bad Gateway' })).toBe(
      true,
    )
    expect(isUnknownHttpError({ kind: 'http', status: 404, body: {} } as const)).toBe(false)
  })

  it('isValidationError narrows', () => {
    expect(isValidationError({ kind: 'validation', status: 200, issues: [], body: {} })).toBe(true)
  })

  it('isNetworkError narrows', () => {
    expect(isNetworkError({ kind: 'network', cause: new Error('timeout') })).toBe(true)
  })

  it('isEnvelopeError matches any variant', () => {
    expect(isEnvelopeError({ kind: 'http', status: 404, body: {} })).toBe(true)
    expect(isEnvelopeError({ kind: 'http-unknown', status: 502, body: 'x' })).toBe(true)
    expect(isEnvelopeError({ kind: 'validation', status: 200, issues: [], body: {} })).toBe(true)
    expect(isEnvelopeError({ kind: 'network', cause: new Error('x') })).toBe(true)
    expect(isEnvelopeError({ kind: 'other' })).toBe(false)
    expect(isEnvelopeError(null)).toBe(false)
  })

  it('guards are null/undefined safe', () => {
    expect(isHttpError(null)).toBe(false)
    expect(isHttpError(undefined)).toBe(false)
    expect(isHttpError('string')).toBe(false)
    expect(isUnknownHttpError(null)).toBe(false)
    expect(isValidationError(null)).toBe(false)
    expect(isNetworkError(null)).toBe(false)
    expect(isEnvelopeError(null)).toBe(false)
  })
})
