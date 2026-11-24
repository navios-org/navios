import { type } from 'arktype'
import * as v from 'valibot'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../builder.mjs'

import type { AbstractResponse, Client, EndpointParams } from '../index.mjs'

function clientReturning(reply: () => Partial<AbstractResponse<unknown>>) {
  const calls: { data?: unknown; params?: unknown; url: string }[] = []
  const client: Client = {
    request: async (config) => {
      calls.push(config)
      return { status: 200, statusText: 'OK', headers: {}, data: null, ...reply() } as never
    },
  }
  return { client, calls }
}

describe('Standard Schema: Valibot', () => {
  const createUser = v.object({
    name: v.pipe(v.string(), v.minLength(2)),
    age: v.optional(v.pipe(v.number(), v.minValue(0))),
  })
  const user = v.object({ id: v.string(), name: v.string() })
  const conflict = v.object({ reason: v.string() })

  function declare(reply: () => Partial<AbstractResponse<unknown>>) {
    const http = clientReturning(reply)
    const endpoint = builder({ client: http.client }).declareEndpoint({
      method: 'POST',
      url: '/users/$orgId',
      urlParamsSchema: v.object({ orgId: v.pipe(v.string(), v.uuid()) }),
      querySchema: v.object({ notify: v.optional(v.boolean()) }),
      requestSchema: createUser,
      responseSchema: user,
      errorSchema: { 409: conflict },
    })
    return { ...http, endpoint }
  }
  const orgId = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'

  it('infers args and results from Valibot schemas', () => {
    const { endpoint } = declare(() => ({}))

    expectTypeOf<EndpointParams<typeof endpoint>['data']>().toEqualTypeOf<{
      name: string
      age?: number | undefined
    }>()
    expectTypeOf<EndpointParams<typeof endpoint>['urlParams']>().toEqualTypeOf<{ orgId: string }>()
    expectTypeOf(endpoint).returns.resolves.toEqualTypeOf<{ id: string; name: string }>()
  })

  it('validates the request and parses the response', async () => {
    const { endpoint, calls } = declare(() => ({ data: { id: '1', name: 'Ada', extra: true } }))

    const result = await endpoint({ urlParams: { orgId }, data: { name: 'Ada' } })

    // Valibot's object schema drops unknown keys, proving the response was parsed.
    expect(result).toEqual({ id: '1', name: 'Ada' })
    expect(calls[0]).toMatchObject({ url: `/users/${orgId}`, data: { name: 'Ada' } })
  })

  it('reports Valibot issues as request-validation and sends nothing', async () => {
    const { endpoint, calls } = declare(() => ({ data: {} }))

    const badBody = await endpoint.safe({ urlParams: { orgId }, data: { name: 'A' } })
    const badUrl = await endpoint.safe({ urlParams: { orgId: 'nope' }, data: { name: 'Ada' } })

    expect(badBody.error?.kind).toBe('request-validation')
    expect(badBody.error?.issues?.[0]?.message).toEqual(expect.any(String))
    expect(badBody.error?.issues?.[0]?.path).toBeDefined()
    expect(badUrl.error?.kind).toBe('request-validation')
    expect(calls).toHaveLength(0)
  })

  it('types and parses error bodies with a Valibot errorSchema', async () => {
    const { endpoint } = declare(() => ({ status: 409, data: { reason: 'taken', extra: 1 } }))

    const res = await endpoint.safe({ urlParams: { orgId }, data: { name: 'Ada' } })

    expect(res.error).toMatchObject({ kind: 'http', status: 409, body: { reason: 'taken' } })
    if (!res.ok && res.error.kind === 'http') {
      expectTypeOf(res.error.status).toEqualTypeOf<409>()
      expectTypeOf(res.error.body).toEqualTypeOf<{ reason: string }>()
    }
  })

  it('reports a response that fails a Valibot schema as response-validation', async () => {
    const { endpoint } = declare(() => ({ data: { id: 1 } }))

    const res = await endpoint.safe({ urlParams: { orgId }, data: { name: 'Ada' } })

    expect(res.error).toMatchObject({ kind: 'response-validation', status: 200 })
    expect(res.error?.issues?.length).toBeGreaterThan(0)
  })

  it('supports async Valibot schemas', async () => {
    const http = clientReturning(() => ({ data: { ok: true } }))
    const endpoint = builder({ client: http.client }).declareEndpoint({
      method: 'POST',
      url: '/names',
      requestSchema: v.objectAsync({
        name: v.pipeAsync(
          v.string(),
          v.checkAsync(async (name) => name !== 'taken', 'name is taken'),
        ),
      }),
      response: 'void',
    })

    await expect(endpoint({ data: { name: 'free' } })).resolves.toBeUndefined()
    const res = await endpoint.safe({ data: { name: 'taken' } })

    expect(res.error?.kind).toBe('request-validation')
    expect(res.error?.issues?.[0]?.message).toBe('name is taken')
    expect(http.calls).toHaveLength(1)
  })
})

describe('Standard Schema: ArkType', () => {
  const createUser = type({ name: 'string >= 2', 'age?': 'number >= 0' })
  const user = type({ id: 'string', name: 'string' })

  function declare(reply: () => Partial<AbstractResponse<unknown>>) {
    const http = clientReturning(reply)
    const endpoint = builder({ client: http.client }).declareEndpoint({
      method: 'POST',
      url: '/users',
      querySchema: type({ 'notify?': 'boolean' }),
      requestSchema: createUser,
      responses: { 200: user, 204: null },
      errorSchema: { 409: type({ reason: 'string' }) },
    })
    return { ...http, endpoint }
  }

  it('infers args and results from ArkType schemas', () => {
    const { endpoint } = declare(() => ({}))

    expectTypeOf<EndpointParams<typeof endpoint>['data']>().toEqualTypeOf<{
      name: string
      age?: number
    }>()
    expectTypeOf(endpoint).returns.resolves.toEqualTypeOf<
      { id: string; name: string } | undefined
    >()
  })

  it('validates the request and parses the response for its status', async () => {
    const { endpoint, calls } = declare(() => ({ data: { id: '1', name: 'Ada' } }))

    await expect(endpoint({ data: { name: 'Ada', age: 36 } })).resolves.toEqual({
      id: '1',
      name: 'Ada',
    })
    expect(calls[0]).toMatchObject({ data: { name: 'Ada', age: 36 } })
  })

  it('resolves to undefined for a null responses entry', async () => {
    const { endpoint } = declare(() => ({ status: 204, data: '' }))

    await expect(endpoint({ data: { name: 'Ada' } })).resolves.toBeUndefined()
  })

  it('reports ArkType issues as request-validation and sends nothing', async () => {
    const { endpoint, calls } = declare(() => ({ data: {} }))

    const res = await endpoint.safe({ data: { name: 'A', age: -1 } })

    expect(res.error?.kind).toBe('request-validation')
    expect(res.error?.issues?.length).toBeGreaterThan(0)
    expect(res.error?.issues?.[0]?.message).toEqual(expect.any(String))
    expect(calls).toHaveLength(0)
  })

  it('types and parses error bodies with an ArkType errorSchema', async () => {
    const { endpoint } = declare(() => ({ status: 409, data: { reason: 'taken' } }))

    const res = await endpoint.safe({ data: { name: 'Ada' } })

    expect(res.error).toMatchObject({ kind: 'http', status: 409, body: { reason: 'taken' } })
    if (!res.ok && res.error.kind === 'http') {
      expectTypeOf(res.error.body).toEqualTypeOf<{ reason: string }>()
    }
  })

  it('reports a response that fails an ArkType schema as response-validation', async () => {
    const { endpoint } = declare(() => ({ data: { id: 1, name: 'Ada' } }))

    const res = await endpoint.safe({ data: { name: 'Ada' } })

    expect(res.error).toMatchObject({ kind: 'response-validation', status: 200 })
  })
})

describe('Standard Schema: documented samples', () => {
  it('ArkType query schema and array response, as shown in the schemas guide', async () => {
    const http = clientReturning(() => ({ data: [{ id: '1', name: 'Ada' }] }))
    const listUsers = builder({ client: http.client }).declareEndpoint({
      method: 'GET',
      url: '/users',
      querySchema: type({ 'page?': 'number >= 1' }),
      responseSchema: type({ id: 'string', name: 'string' }).array(),
    })

    await expect(listUsers({ params: { page: 2 } })).resolves.toEqual([{ id: '1', name: 'Ada' }])
    await expect(listUsers()).resolves.toHaveLength(1)
    expect((await listUsers.safe({ params: { page: 0 } })).error?.kind).toBe('request-validation')
    expectTypeOf(listUsers).returns.resolves.toEqualTypeOf<{ id: string; name: string }[]>()
  })
})

describe('Standard Schema: three libraries on one endpoint', () => {
  it('uses Zod, Valibot and ArkType in different slots', async () => {
    const http = clientReturning(() => ({ data: { id: '1', name: 'Ada' } }))
    const endpoint = builder({ client: http.client }).declareEndpoint({
      method: 'PUT',
      url: '/users/$userId',
      urlParamsSchema: z.object({ userId: z.coerce.number().int() }),
      requestSchema: v.object({ name: v.string() }),
      responseSchema: type({ id: 'string', name: 'string' }),
    })

    const result = await endpoint({ urlParams: { userId: '42' }, data: { name: 'Ada' } })

    expect(result).toEqual({ id: '1', name: 'Ada' })
    expect(http.calls[0]?.url).toBe('/users/42')
    expectTypeOf(result).toEqualTypeOf<{ id: string; name: string }>()

    const res = await endpoint.safe({ urlParams: { userId: 'x' }, data: { name: 'Ada' } })
    expect(res.error?.kind).toBe('request-validation')
    expect(res.error?.cause).toBeInstanceOf(z.ZodError)
  })
})
