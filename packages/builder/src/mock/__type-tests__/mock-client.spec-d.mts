import { describe, expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../../http/builder.mjs'
import { createMockClient } from '../mock-client.mjs'

import type { Client } from '../../http/client.mjs'

const mocks = createMockClient()
const api = builder({ client: mocks })

const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  querySchema: z.object({ expand: z.boolean().optional() }),
  responseSchema: z.object({
    id: z.string(),
    createdAt: z.iso.datetime().transform((s) => new Date(s)),
  }),
  errorSchema: { 404: z.object({ message: z.string() }) },
})

describe('MockClient', () => {
  test('is a Client', () => {
    expectTypeOf(mocks).toExtend<Client>()
  })

  test('types the handler arguments from the endpoint', () => {
    mocks.on(getUser, (args) => {
      expectTypeOf(args.urlParams.userId).toEqualTypeOf<string | number>()
      expectTypeOf(args.params?.expand).toEqualTypeOf<boolean | undefined>()
      return { id: '1', createdAt: '2026-01-01T00:00:00Z' }
    })
  })

  test('expects the schema input as the body, not its output', () => {
    // @ts-expect-error a Date is the output of the schema; the server sends a string
    mocks.on(getUser, () => ({ id: '1', createdAt: new Date() }))
  })

  test('types respond bodies by the status', () => {
    mocks.on(getUser, (_, { respond }) => respond(404, { message: 'missing' }))
    // @ts-expect-error the 404 body is declared with a message
    mocks.on(getUser, (_, { respond }) => respond(404, { reason: 'missing' }))
    mocks.on(getUser, (_, { respond }) => respond(500))
  })

  test('accepts an object that carries the endpoint', () => {
    mocks.on({ endpoint: getUser }, (args) => {
      expectTypeOf(args.urlParams.userId).toEqualTypeOf<string | number>()
      return { id: '1', createdAt: '2026-01-01T00:00:00Z' }
    })
  })

  test('types recorded calls of one endpoint', () => {
    const [call] = mocks.calls(getUser)
    expectTypeOf(call!.args.urlParams.userId).toEqualTypeOf<string | number>()
  })

  test('types blob and void endpoints', () => {
    const download = api.declareEndpoint({ method: 'GET', url: '/f', response: 'blob' })
    const remove = api.declareEndpoint({ method: 'DELETE', url: '/f', response: 'void' })
    mocks.on(download, () => new Blob())
    // @ts-expect-error a blob endpoint answers with a Blob
    mocks.on(download, () => 'text')
    mocks.on(remove, () => {})
  })
})
