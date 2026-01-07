import { describe, expect, it } from 'vitest'

import type { AbstractResponse } from '../../types/index.mjs'

import { UnknownResponseError } from '../unknown-response-error.mjs'

describe('UnknownResponseError', () => {
  const createResponse = (
    status: number,
    data: unknown = {},
  ): AbstractResponse<unknown> => ({
    data,
    status,
    statusText: 'Error',
    headers: {},
  })

  it('should have correct name', () => {
    const response = createResponse(500)
    const error = new UnknownResponseError(response, 500)

    expect(error.name).toBe('UnknownResponseError')
  })

  it('should include status code in message', () => {
    const response = createResponse(418)
    const error = new UnknownResponseError(response, 418)

    expect(error.message).toContain('418')
  })

  it('should store response and statusCode', () => {
    const response = createResponse(500, { foo: 'bar' })
    const error = new UnknownResponseError(response, 500)

    expect(error.response).toBe(response)
    expect(error.statusCode).toBe(500)
  })

  it('should be an instance of Error', () => {
    const response = createResponse(500)
    const error = new UnknownResponseError(response, 500)

    expect(error).toBeInstanceOf(Error)
  })

  it('should have a descriptive error message', () => {
    const response = createResponse(404)
    const error = new UnknownResponseError(response, 404)

    expect(error.message).toContain('Unknown error response')
    expect(error.message).toContain('404')
    expect(error.message).toContain('errorSchema')
  })

  it('should preserve response data', () => {
    const responseData = { error: 'Something went wrong', code: 'ERR_001' }
    const response = createResponse(500, responseData)
    const error = new UnknownResponseError(response, 500)

    expect(error.response.data).toEqual(responseData)
  })

  it('should work with different status codes', () => {
    const statusCodes = [400, 401, 403, 404, 500, 502, 503]

    for (const statusCode of statusCodes) {
      const response = createResponse(statusCode)
      const error = new UnknownResponseError(response, statusCode)

      expect(error.statusCode).toBe(statusCode)
      expect(error.message).toContain(String(statusCode))
    }
  })
})
