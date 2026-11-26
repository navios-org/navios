import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../builder.mjs'

import type { AbstractResponse, Client } from '../client.mjs'

function replying(reply: Partial<AbstractResponse<unknown>>): Client {
  return {
    request: async () =>
      ({ status: 200, statusText: 'OK', headers: {}, data: null, ...reply }) as never,
  }
}

const apiError = z.object({ error: z.object({ message: z.string() }) })
const userSchema = z.object({ id: z.string() })

describe('builder({ errorSchema })', () => {
  it('parses a shared status on an endpoint that declares no errorSchema', async () => {
    const api = builder({ errorSchema: { 401: apiError } })
    const getUser = api.declareEndpoint({ method: 'GET', url: '/me', responseSchema: userSchema })

    const result = await getUser.safe(undefined, {
      client: replying({ status: 401, data: { error: { message: 'Sign in' } } }),
    })

    expect(result.error).toMatchObject({
      kind: 'http',
      status: 401,
      body: { error: { message: 'Sign in' } },
    })
  })

  it("adds the endpoint's statuses and lets its own entry win", async () => {
    const api = builder({ errorSchema: { 404: apiError, 500: apiError } })
    const own404 = z.object({ missing: z.literal(true) })
    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/users/$id',
      responseSchema: userSchema,
      errorSchema: { 404: own404, 409: apiError },
    })

    const missing = await getUser.safe(
      { urlParams: { id: 1 } },
      { client: replying({ status: 404, data: { missing: true } }) },
    )
    const failed = await getUser.safe(
      { urlParams: { id: 1 } },
      { client: replying({ status: 500, data: { error: { message: 'boom' } } }) },
    )

    expect(missing.error).toMatchObject({ kind: 'http', status: 404, body: { missing: true } })
    expect(failed.error).toMatchObject({ kind: 'http', status: 500 })
    expect(getUser.config.errorSchema).toEqual({ 404: own404, 409: apiError, 500: apiError })
  })

  it('reports a shared status whose body does not match as response-validation', async () => {
    const api = builder({ errorSchema: { 500: apiError } })
    const getUser = api.declareEndpoint({ method: 'GET', url: '/me', responseSchema: userSchema })

    const result = await getUser.safe(undefined, {
      client: replying({ status: 500, data: '<html>' }),
    })

    expect(result.error?.kind).toBe('response-validation')
  })

  it('exposes the shared schemas and applies them with any client', async () => {
    const shared = { 401: apiError }
    const api = builder({ errorSchema: shared })
    const getMe = api.declareEndpoint({ method: 'GET', url: '/me', responseSchema: userSchema })
    const other = replying({ status: 401, data: { error: { message: 'x' } } })

    expect(api.errorSchema).toBe(shared)
    expect((await getMe.safe(undefined, { client: other })).error?.kind).toBe('http')
  })

  it('leaves the declaration untouched on a builder without shared schemas', () => {
    const api = builder()
    const options = { method: 'GET', url: '/me', responseSchema: userSchema } as const
    const getMe = api.declareEndpoint(options)

    expect(api.errorSchema).toEqual({})
    expect(getMe.config).toBe(options)
  })
})
