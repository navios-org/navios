import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../http/builder.mjs'

import type { AbstractResponse, Client, EndpointParams, Schema } from '../index.mjs'

function clientReturning(reply: () => Partial<AbstractResponse<unknown>>) {
  const calls: unknown[] = []
  const client: Client = {
    request: async (config) => {
      calls.push(config)
      return { status: 200, statusText: 'OK', headers: {}, data: null, ...reply() } as never
    },
  }
  return { client, calls }
}

/** A hand-written Standard Schema, standing in for any non-Zod library. */
function standard<Input, Output>(
  check: (value: unknown) => Output | Error,
  options: { async?: boolean } = {},
): Schema<Input, Output> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) => {
        const outcome = check(value)
        const result =
          outcome instanceof Error
            ? { issues: [{ message: outcome.message, path: ['field'] }] }
            : { value: outcome }
        return options.async ? Promise.resolve(result) : result
      },
    },
  }
}

const positive = standard<{ n: number }, { n: number; checked: true }>((value) => {
  const n = (value as { n?: unknown })?.n
  return typeof n === 'number' && n > 0 ? { n, checked: true } : new Error('n must be positive')
})

describe('Standard Schema support', () => {
  it('types args and results from a non-Zod schema', () => {
    const api = builder()
    const ep = api.declareEndpoint({
      method: 'POST',
      url: '/numbers',
      requestSchema: positive,
      responseSchema: standard<unknown, { total: number }>((value) => value as { total: number }),
    })

    expectTypeOf<EndpointParams<typeof ep>['data']>().toEqualTypeOf<{ n: number }>()
    expectTypeOf(ep).returns.resolves.toEqualTypeOf<{ total: number }>()
  })

  it('validates request and response with the schema and returns its output', async () => {
    const { client, calls } = clientReturning(() => ({ data: { total: 3 } }))
    const api = builder({ client })
    const ep = api.declareEndpoint({
      method: 'POST',
      url: '/numbers',
      requestSchema: positive,
      responseSchema: standard<unknown, { total: number }>((value) =>
        typeof (value as { total?: unknown }).total === 'number'
          ? (value as { total: number })
          : new Error('total missing'),
      ),
    })

    await expect(ep({ data: { n: 2 } })).resolves.toEqual({ total: 3 })
    expect(calls[0]).toHaveProperty('data', { n: 2 })
  })

  it('reports issues from a non-Zod schema as request-validation', async () => {
    const { client, calls } = clientReturning(() => ({ data: {} }))
    const ep = builder({ client }).declareEndpoint({
      method: 'POST',
      url: '/numbers',
      requestSchema: positive,
      response: 'void',
    })

    const res = await ep.safe({ data: { n: -1 } })

    expect(res.error?.kind).toBe('request-validation')
    expect(res.error?.issues).toEqual([
      { message: 'n must be positive', path: ['field'], part: 'data' },
    ])
    expect(calls).toHaveLength(0)
  })

  it('supports schemas that validate asynchronously', async () => {
    const { client } = clientReturning(() => ({ data: { ok: 'yes' } }))
    const ep = builder({ client }).declareEndpoint({
      method: 'GET',
      url: '/async',
      responseSchema: standard<unknown, { ok: string }>((value) => value as { ok: string }, {
        async: true,
      }),
      errorSchema: {
        409: standard<unknown, { reason: string }>((value) => value as { reason: string }, {
          async: true,
        }),
      },
    })

    await expect(ep()).resolves.toEqual({ ok: 'yes' })
  })

  it('mixes vendors: Zod for one slot, another library for the next', async () => {
    const { client } = clientReturning(() => ({ status: 409, data: { reason: 'taken' } }))
    const ep = builder({ client }).declareEndpoint({
      method: 'POST',
      url: '/users',
      requestSchema: z.object({ name: z.string() }),
      responseSchema: z.object({ id: z.string() }),
      errorSchema: {
        409: standard<unknown, { reason: string }>((value) => value as { reason: string }),
      },
    })

    const res = await ep.safe({ data: { name: 'Ada' } })

    expect(res.error).toMatchObject({ kind: 'http', status: 409, body: { reason: 'taken' } })
    if (!res.ok && res.error.kind === 'http') {
      expectTypeOf(res.error.body).toEqualTypeOf<{ reason: string }>()
    }
  })

  it('supports Zod schemas with asynchronous refinements', async () => {
    const { client, calls } = clientReturning(() => ({ data: {} }))
    const ep = builder({ client }).declareEndpoint({
      method: 'POST',
      url: '/users',
      requestSchema: z.object({
        name: z.string().refine(async (name) => name !== 'taken', 'name is taken'),
      }),
      response: 'void',
    })

    await expect(ep({ data: { name: 'free' } })).resolves.toBeUndefined()
    const res = await ep.safe({ data: { name: 'taken' } })

    expect(res.error?.kind).toBe('request-validation')
    expect(res.error?.issues?.[0]?.message).toBe('name is taken')
    expect(calls).toHaveLength(1)
  })

  it('reports a schema that throws as a validation failure, not a raw exception', async () => {
    const { client } = clientReturning(() => ({ data: {} }))
    const boom = new Error('schema exploded')
    const ep = builder({ client }).declareEndpoint({
      method: 'POST',
      url: '/users',
      requestSchema: standard<unknown, unknown>(() => {
        throw boom
      }),
      response: 'void',
    })

    const res = await ep.safe({ data: {} })

    expect(res.error?.kind).toBe('request-validation')
    expect(res.error?.cause).toBe(boom)
  })

  it('keeps the ZodError as cause for Zod schemas', async () => {
    const { client } = clientReturning(() => ({ data: {} }))
    const ep = builder({ client }).declareEndpoint({
      method: 'POST',
      url: '/users',
      requestSchema: z.object({ name: z.string() }),
      response: 'void',
    })

    const res = await ep.safe({ data: { name: 1 as never } })

    expect(res.error?.cause).toBeInstanceOf(z.ZodError)
  })
})

describe('responses: per-status success schemas', () => {
  const created = z.object({ id: z.string(), created: z.literal(true) })
  const existing = z.object({ id: z.string(), name: z.string() })

  function declare(reply: () => Partial<AbstractResponse<unknown>>) {
    const { client } = clientReturning(reply)
    return builder({ client }).declareEndpoint({
      method: 'PUT',
      url: '/users/$id',
      responses: { 200: existing, 201: created, 204: null },
    })
  }

  it('types the result as the union of every status', () => {
    const ep = declare(() => ({}))
    expectTypeOf(ep).returns.resolves.toEqualTypeOf<
      { id: string; name: string } | { id: string; created: true } | undefined
    >()
  })

  it('validates the body with the schema of the status that came back', async () => {
    await expect(
      declare(() => ({ status: 200, data: { id: '1', name: 'Ada', extra: 1 } }))({
        urlParams: { id: 1 },
      }),
    ).resolves.toEqual({ id: '1', name: 'Ada' })

    await expect(
      declare(() => ({ status: 201, data: { id: '1', created: true } }))({ urlParams: { id: 1 } }),
    ).resolves.toEqual({ id: '1', created: true })
  })

  it('resolves to undefined for a null entry and exposes the status through safe()', async () => {
    const res = await declare(() => ({ status: 204, data: '' })).safe({ urlParams: { id: 1 } })

    expect(res).toMatchObject({ ok: true, data: undefined })
    expect(res.response?.status).toBe(204)
  })

  it('reports a body that does not match its status schema', async () => {
    const res = await declare(() => ({ status: 201, data: { id: '1', name: 'Ada' } })).safe({
      urlParams: { id: 1 },
    })

    expect(res.error).toMatchObject({ kind: 'response-validation', status: 201 })
  })

  it('reports a 2xx status that is not declared', async () => {
    const res = await declare(() => ({ status: 202, data: {} })).safe({ urlParams: { id: 1 } })

    expect(res.error).toMatchObject({ kind: 'response-validation', status: 202 })
    expect(res.error?.issues?.[0]?.message).toContain('202')
  })

  it('does not require responseSchema when responses is given', () => {
    const api = builder()
    api.declareEndpoint({ method: 'GET', url: '/x', responses: { 200: existing } })
    // @ts-expect-error neither responseSchema nor responses
    api.declareEndpoint({ method: 'GET', url: '/x' })
  })
})
