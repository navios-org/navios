import { type } from 'arktype'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { EventSourceError } from '../eventsource/index.mjs'
import { builder } from '../index.mjs'
import { SocketError } from '../socket/index.mjs'

import type { Schema } from '../index.mjs'

function declare(requestSchema: Schema) {
  return builder({ client: { request: async () => ({}) as never } }).declareEndpoint({
    method: 'POST',
    url: '/login',
    requestSchema,
    response: 'void',
  })
}

describe('issues', () => {
  it.each([
    ['Zod', z.object({ user: z.object({ email: z.email() }), password: z.string() })],
    [
      'Valibot',
      v.object({ user: v.object({ email: v.pipe(v.string(), v.email()) }), password: v.string() }),
    ],
    ['ArkType', type({ user: { email: 'string.email' }, password: 'string' })],
  ])('should be plain data without the validated value: %s', async (_name, schema) => {
    const result = await declare(schema as Schema).safe({
      data: { user: { email: 'nope' }, password: 'hunter2' },
    })

    expect(result.error?.issues).toEqual([
      { message: expect.any(String), path: ['user', 'email'], part: 'data' },
    ])
    expect(JSON.stringify(result.error)).not.toContain('hunter2')
  })

  it('should keep what the schema library reported on cause', async () => {
    const zod = await declare(z.object({ a: z.string() })).safe({ data: {} })
    expect(zod.error?.cause).toBeInstanceOf(z.ZodError)

    const valibot = await declare(v.object({ a: v.string() })).safe({ data: {} })
    expect(valibot.error?.cause).toMatchObject([
      { kind: 'schema', type: 'object', expected: '"a"' },
    ])
  })

  it('should not make the error unserialisable', async () => {
    const result = await declare(z.object({ n: z.bigint().min(5n) })).safe({ data: { n: 1n } })

    expect(() => JSON.stringify(result.error)).not.toThrow()
  })

  it('should list the problems of every part of the input, with the part', async () => {
    const ep = builder({ client: { request: async () => ({}) as never } }).declareEndpoint({
      method: 'POST',
      url: '/u/$id',
      urlParamsSchema: z.object({ id: z.uuid() }),
      querySchema: z.object({ id: z.string() }),
      requestSchema: z.object({ id: z.number() }),
      response: 'void',
    })

    const result = await ep.safe({
      urlParams: { id: 'x' },
      params: { id: 1 as never },
      data: { id: 'x' as never },
    })

    expect(result.error?.issues).toMatchObject([
      { part: 'urlParams', path: ['id'] },
      { part: 'params', path: ['id'] },
      { part: 'data', path: ['id'] },
    ])
    expect(result.error?.cause).toBeInstanceOf(z.ZodError)
  })

  it('should have no part for a response', async () => {
    const ep = builder({
      client: {
        request: async () => ({ data: {}, status: 200, statusText: '', headers: {} }) as never,
      },
    }).declareEndpoint({ method: 'GET', url: '/u', responseSchema: z.object({ id: z.string() }) })

    const result = await ep.safe()

    expect(result.error?.issues).toEqual([{ message: expect.any(String), path: ['id'] }])
  })

  it.each([
    [
      'SocketError',
      (issues: never[]) => new SocketError({ kind: 'validation', topic: 't', issues }),
    ],
    [
      'EventSourceError',
      (issues: never[]) => new EventSourceError({ kind: 'validation', eventName: 'e', issues }),
    ],
  ])('should be plain data on a %s as well', (_name, make) => {
    const error = make([
      { message: 'no', path: [{ key: 'email', input: { password: 'hunter2' } }, 0], limit: 5n },
    ] as never[])

    expect(error.issues).toEqual([{ message: 'no', path: ['email', 0] }])
    expect(JSON.stringify(error)).not.toContain('hunter2')
  })
})
