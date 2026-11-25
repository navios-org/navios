import { describe, expect, it } from 'vitest'

import { HttpClientError, isHttpClientError } from '../http-client-error.mjs'

import { recordingClient } from './recording-client.mjs'

async function failure(respond: () => Response | Promise<Response>) {
  const { navios } = recordingClient({ headers: { Authorization: 'Bearer SECRET' } }, respond)
  const error: unknown = await navios
    .post('/login', { password: 'hunter2' })
    .catch((err: unknown) => err)
  return error as HttpClientError
}

describe('HttpClientError', () => {
  it('should carry the status and the parsed body of an error response', async () => {
    const error = await failure(() => Response.json({ code: 'X' }, { status: 409 }))

    expect(error).toBeInstanceOf(HttpClientError)
    expect(isHttpClientError(error)).toBe(true)
    expect(error.name).toBe('HttpClientError')
    expect(error.status).toBe(409)
    expect(error.response?.data).toEqual({ code: 'X' })
  })

  it('should be the error of a failure without a response as well', async () => {
    const cause = new TypeError('fetch failed')
    const error = await failure(() => Promise.reject(cause))

    expect(error).toBeInstanceOf(HttpClientError)
    expect(error.name).toBe('HttpClientError')
    expect(error.message).toBe('fetch failed')
    expect(error.status).toBeUndefined()
    expect(error.response).toBeNull()
    expect(error.cause).toBe(cause)
  })

  it.each([
    [new Response('', { status: 404 }), 'Request failed with status 404'],
    [
      new Response('', { status: 404, statusText: 'Not Found' }),
      'Request failed with status 404 (Not Found)',
    ],
  ])('should name the status in its message', async (response, message) => {
    expect((await failure(() => response)).message).toBe(message)
  })

  it('should leave credentials and bodies out of its JSON form', async () => {
    const error = await failure(
      () => new Response('{"a":1}', { status: 401, headers: { 'set-cookie': 'sid=SECRET' } }),
    )

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      name: 'HttpClientError',
      message: 'Request failed with status 401',
      status: 401,
      method: 'POST',
      url: '/login',
    })
    // Loggers that copy enumerable fields must not pick up the headers either
    expect(Object.keys(error)).not.toContain('config')
    expect(error.config.headers.authorization).toBe('Bearer SECRET')
  })

  it('should report a request that cannot be built with its own code', async () => {
    const { navios, calls } = recordingClient()

    const error = await navios.post('/', { n: 1n }).catch((err: unknown) => err)

    expect(error).toMatchObject({
      name: 'HttpClientError',
      code: 'ERR_BAD_OPTION_VALUE',
      response: null,
      cause: expect.any(TypeError),
    })
    expect(calls).toHaveLength(0)
  })

  it('should be told apart from other errors', () => {
    expect(isHttpClientError(new Error('x'))).toBe(false)
    expect(isHttpClientError(null)).toBe(false)
  })
})
