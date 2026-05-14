import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { classifyError } from './classify-error.mjs'

describe('classifyError', () => {
  it('returns http variant for matched errorSchema entry', () => {
    const schema = { 404: z.object({ msg: z.string() }) }
    const error = {
      response: {
        data: { msg: 'not found' },
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
      },
    }
    const result = classifyError(error, schema)
    expect(result.kind).toBe('http')
    if (result.kind === 'http') {
      expect(result.status).toBe(404)
      expect(result.body).toEqual({ msg: 'not found', status: 404 })
    }
  })

  it('returns http-unknown for unmatched status', () => {
    const schema = { 404: z.object({ msg: z.string() }) }
    const error = {
      response: { data: 'ouch', status: 500, statusText: 'Server Error', headers: new Headers() },
    }
    const result = classifyError(error, schema)
    expect(result.kind).toBe('http-unknown')
    if (result.kind === 'http-unknown') {
      expect(result.status).toBe(500)
      expect(result.body).toBe('ouch')
    }
  })

  it('returns http-unknown when no errorSchema is provided', () => {
    const error = {
      response: { data: { x: 1 }, status: 418, statusText: 'Teapot', headers: new Headers() },
    }
    const result = classifyError(error, undefined)
    expect(result.kind).toBe('http-unknown')
  })

  it('returns validation when matched schema fails to parse', () => {
    const schema = { 400: z.object({ msg: z.string() }) }
    const error = {
      response: { data: { msg: 42 }, status: 400, statusText: 'Bad', headers: new Headers() },
    }
    const result = classifyError(error, schema)
    expect(result.kind).toBe('validation')
    if (result.kind === 'validation') {
      expect(result.status).toBe(400)
      expect(result.issues.length).toBeGreaterThan(0)
    }
  })

  it('classifies non-Zod throw from a schema transform as validation', () => {
    const schema = {
      400: z.unknown().transform(() => {
        throw new Error('boom')
      }),
    }
    const error = {
      response: { data: 'irrelevant', status: 400, statusText: 'Bad', headers: new Headers() },
    }
    const result = classifyError(error, schema)
    expect(result.kind).toBe('validation')
    if (result.kind === 'validation') {
      expect(result.status).toBe(400)
      expect(result.issues).toEqual([])
      expect(result.body).toBe('irrelevant')
    }
  })

  it('returns network when error has no response', () => {
    const result = classifyError(new TypeError('Failed to fetch'), undefined)
    expect(result.kind).toBe('network')
  })

  it('returns network for AbortError (signal aborted)', () => {
    const abort = new DOMException('aborted', 'AbortError')
    const result = classifyError(abort, undefined)
    expect(result.kind).toBe('network')
  })
})
