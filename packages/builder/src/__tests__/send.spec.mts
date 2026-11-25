import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../index.mjs'

import type { AbstractRequestConfig, BuilderConfig } from '../index.mjs'

function setup(config: Omit<BuilderConfig, 'client'> = {}) {
  const calls: AbstractRequestConfig[] = []
  const api = builder({
    ...config,
    client: {
      request: async (request) => {
        calls.push(request)
        return { data: {}, status: 200, statusText: 'OK', headers: {} } as never
      },
    },
  })
  return { api, calls }
}

const seconds = z.codec(z.number(), z.date(), {
  decode: (value) => new Date(value * 1000),
  encode: (date) => date.getTime() / 1000,
})

describe("send: 'input' (the default)", () => {
  it.each([
    ['a stringbool', z.object({ v: z.stringbool() }), { v: 'true' }],
    ['a codec', z.object({ v: seconds }), { v: 5 }],
    ['a transform', z.object({ v: z.string().transform((s) => `h(${s})`) }), { v: 'x' }],
    [
      'a rename',
      z.object({ userId: z.string() }).transform((o) => ({ id: o.userId })),
      { userId: 'u' },
    ],
    ['a default', z.object({ v: z.string().default('x') }), {}],
    ['unknown keys', z.object({ v: z.string() }), { v: 'x', more: 1 }],
    ['a Valibot transform', v.object({ v: v.pipe(v.string(), v.transform(Number)) }), { v: '5' }],
  ])('should send what the caller passed as body: %s', async (_name, requestSchema, data) => {
    const { api, calls } = setup()
    const ep = api.declareEndpoint({ method: 'POST', url: '/x', requestSchema, response: 'void' })

    const result = await ep.safe({ data: data as never })

    expect(result.error).toBeNull()
    expect(calls[0]!.data).toBe(data)
  })

  it('should send what the caller passed as query and URL params', async () => {
    const { api, calls } = setup()
    const ep = api.declareEndpoint({
      method: 'GET',
      url: '/x/$id',
      urlParamsSchema: z.object({ id: z.string().transform((id) => `x${id}`) }),
      querySchema: z.object({ ids: z.string().transform((ids) => ids.split(',')) }),
      response: 'void',
    })

    await ep({ urlParams: { id: '7' }, params: { ids: 'a,b' } })

    expect(calls[0]).toMatchObject({ url: '/x/7', params: { ids: 'a,b' } })
  })

  it('should build form fields from what the caller passed', async () => {
    const { api, calls } = setup()
    const ep = api.declareEndpoint({
      method: 'POST',
      url: '/x',
      body: 'multipart',
      requestSchema: z.object({ name: z.string().transform((s) => s.toUpperCase()) }),
      response: 'void',
    })

    await ep({ data: { name: 'ada' } })

    expect((calls[0]!.data as FormData).get('name')).toBe('ada')
  })

  it('should send an empty object for a body that was left out', async () => {
    const { api, calls } = setup()
    const ep = api.declareEndpoint({
      method: 'POST',
      url: '/x',
      requestSchema: z.object({ v: z.string().default('x') }),
      response: 'void',
    })

    await ep()

    expect(calls[0]!.data).toEqual({})
  })

  it('should send nothing for a body that was left out when the schema accepts that', async () => {
    const { api, calls } = setup()
    const ep = api.declareEndpoint({
      method: 'POST',
      url: '/x',
      requestSchema: z.object({ v: z.string() }).optional(),
      response: 'void',
    })

    await ep()

    expect(calls[0]!.data).toBeUndefined()
  })

  describe('a URL parameter that was left out', () => {
    it.each([
      ['a default', z.object({ version: z.string().default('v1') }), {}],
      [
        'a default, for undefined',
        z.object({ version: z.string().default('v1') }),
        { version: undefined },
      ],
      [
        'a default, for null',
        z.object({
          version: z
            .string()
            .nullish()
            .transform((v) => v ?? 'v1'),
        }),
        { version: null },
      ],
      [
        'a default of all of them',
        z.object({ version: z.string() }).default({ version: 'v1' }),
        undefined,
      ],
      ['a Valibot default', v.object({ version: v.optional(v.string(), 'v1') }), {}],
    ])('should be what the schema produces: %s', async (_name, urlParamsSchema, urlParams) => {
      const { api, calls } = setup()
      const ep = api.declareEndpoint({
        method: 'GET',
        url: '/api/$version/users',
        urlParamsSchema,
        response: 'void',
      })

      const result = await ep.safe({ urlParams } as never)

      expect(result.error).toBeNull()
      expect(calls[0]!.url).toBe('/api/v1/users')
    })

    it('should not change the ones that were passed', async () => {
      const { api, calls } = setup()
      const ep = api.declareEndpoint({
        method: 'GET',
        url: '/$version/$id',
        urlParamsSchema: z.object({
          version: z.string().default('v1'),
          id: z.string().transform((id) => `x${id}`),
        }),
        response: 'void',
      })
      const urlParams = { id: '7' }

      await ep({ urlParams })

      expect(calls[0]!.url).toBe('/v1/7')
      expect(urlParams).toEqual({ id: '7' })
    })

    it('should still be refused without a default', async () => {
      const { api } = setup()
      const ep = api.declareEndpoint({
        method: 'GET',
        url: '/x/$id',
        urlParamsSchema: z.object({ id: z.string().optional() }),
        response: 'void',
      })

      expect((await ep.safe({ urlParams: {} })).error?.kind).toBe('config')
    })
  })

  it.each([
    ['an optional schema', z.object({ page: z.number() }).optional()],
    ['a schema with a default', z.object({ page: z.number() }).default({ page: 3 })],
    ['a schema that accepts an empty object', z.object({ page: z.number().optional() })],
    ['a Valibot schema', v.optional(v.object({ page: v.number() }))],
  ])('should send no query when params were left out: %s', async (_name, querySchema) => {
    const { api, calls } = setup()
    const ep = api.declareEndpoint({ method: 'GET', url: '/x', querySchema, response: 'void' })

    for (const result of [
      await ep.safe(),
      await ep.safe({}),
      await ep.safe({ params: null } as never),
    ]) {
      expect(result.error).toBeNull()
    }
    expect(calls.map((call) => call.params)).toEqual([{}, {}, {}])
  })

  it('should name the fields of a query that has to be passed', async () => {
    const { api } = setup()
    const ep = api.declareEndpoint({
      method: 'GET',
      url: '/x',
      querySchema: z.object({ page: z.number() }),
      response: 'void',
    })

    const result = await ep.safe({} as never)

    expect(result.error?.issues).toMatchObject([{ part: 'params', path: ['page'] }])
  })

  it('should still refuse input that fails the schema', async () => {
    const { api, calls } = setup()
    const ep = api.declareEndpoint({
      method: 'POST',
      url: '/x',
      requestSchema: z.object({ v: z.string().min(3) }),
      response: 'void',
    })

    const result = await ep.safe({ data: { v: 'x' } })

    expect(result.error?.kind).toBe('request-validation')
    expect(calls).toHaveLength(0)
  })
})

describe("send: 'output'", () => {
  it('should send what the schemas produced', async () => {
    const { api, calls } = setup({ send: 'output' })
    const ep = api.declareEndpoint({
      method: 'POST',
      url: '/x/$id',
      urlParamsSchema: z.object({ id: z.string().transform((id) => `x${id}`) }),
      querySchema: z.object({ page: z.number().default(1) }),
      requestSchema: z
        .object({ userId: z.string(), role: z.string().default('member') })
        .transform((o) => ({ user_id: o.userId, role: o.role })),
      response: 'void',
    })

    await ep({ urlParams: { id: '7' }, data: { userId: 'u' } })

    expect(calls[0]).toMatchObject({
      url: '/x/x7',
      params: { page: 1 },
      data: { user_id: 'u', role: 'member' },
    })
  })

  it('should send the default of params that were left out', async () => {
    const { api, calls } = setup({ send: 'output' })
    const ep = api.declareEndpoint({
      method: 'GET',
      url: '/x',
      querySchema: z.object({ page: z.number().default(1) }).default({ page: 3 }),
      response: 'void',
    })

    await ep()
    await ep({ params: {} })

    expect(calls.map((call) => call.params)).toEqual([{ page: 3 }, { page: 1 }])
  })

  it('should be kept by withClient()', async () => {
    const { api, calls } = setup({ send: 'output' })
    const other = api.withClient(api.getClient())
    const ep = other.declareEndpoint({
      method: 'POST',
      url: '/x',
      requestSchema: z.object({ v: z.string().default('x') }),
      response: 'void',
    })

    await ep()

    expect(calls[0]!.data).toEqual({ v: 'x' })
  })
})
