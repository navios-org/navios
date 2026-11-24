import { builder } from '@navios/builder'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'

import { Controller, createContextKey, Endpoint, handler, reply, RequestValue } from '../index.mjs'

import type { HandlerParams, HandlerResult, RequestContext } from '../index.mjs'

const api = builder()

const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  querySchema: z.object({ expand: z.coerce.boolean().default(false) }),
  responseSchema: z.object({ id: z.string(), name: z.string() }),
  errorSchema: { 404: z.object({ message: z.string() }) },
})

const createUser = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({ name: z.string() }),
  responses: { 201: z.object({ id: z.string() }), 204: null },
})

const download = api.declareEndpoint({ method: 'GET', url: '/file', response: 'stream' })
const remove = api.declareEndpoint({ method: 'DELETE', url: '/users/$id', response: 'void' })

describe('handler() field form', () => {
  it('infers params and context without annotations', () => {
    handler(getUser, (params, ctx) => {
      expectTypeOf(params.urlParams.id).toEqualTypeOf<string>()
      expectTypeOf(params.params.expand).toEqualTypeOf<boolean>()
      expectTypeOf(ctx).toEqualTypeOf<RequestContext>()
      return { id: params.urlParams.id, name: 'n' }
    })
    handler(createUser, ({ data }) => {
      expectTypeOf(data).toEqualTypeOf<{ name: string }>()
      return reply(201, { id: '1' })
    })
  })

  it('rejects a wrong return value', () => {
    // @ts-expect-error name is missing
    handler(getUser, () => ({ id: '1' }))
    // @ts-expect-error a responses endpoint must return reply()
    handler(createUser, () => ({ id: '1' }))
    // @ts-expect-error 200 is not declared
    handler(createUser, () => reply(200, { id: '1' }))
    // @ts-expect-error wrong body for 201
    handler(createUser, () => reply(201, { id: 1 }))
    // @ts-expect-error a stream endpoint must return a stream
    handler(download, () => 'text')
  })

  it('accepts declared error replies, bodiless statuses, streams and void', () => {
    handler(getUser, () => reply(404, { message: 'missing' }))
    handler(createUser, () => reply(204))
    handler(download, () => new ReadableStream())
    handler(download, async function* () {
      yield 'chunk'
    })
    handler(remove, () => {})
    // @ts-expect-error 409 is not declared in errorSchema
    handler(getUser, () => reply(409, { message: 'conflict' }))
  })
})

describe('@Endpoint method form', () => {
  it('checks the method signature', () => {
    @Controller()
    class Good {
      @Endpoint(getUser)
      async getUser(params: HandlerParams<typeof getUser>): HandlerResult<typeof getUser> {
        return { id: params.urlParams.id, name: 'n' }
      }

      @Endpoint(remove)
      remove() {}
    }
    void Good

    @Controller()
    class Bad {
      // @ts-expect-error wrong return type
      @Endpoint(getUser)
      async getUser(_params: HandlerParams<typeof getUser>) {
        return { id: 1 }
      }
    }
    void Bad
  })
})

describe('request context', () => {
  it('types context keys and request values', () => {
    const CurrentUser = createContextKey<{ name: string }>('CurrentUser')

    @RequestValue()
    class Session {
      async resolve(_ctx: RequestContext) {
        return { token: 't' } as { token: string } | null
      }
    }

    @RequestValue()
    class Tenant {
      resolve(_ctx: RequestContext) {
        return 'acme'
      }
    }

    // Type-level only: never called.
    const check = (ctx: RequestContext) => {
      expectTypeOf(ctx.get(CurrentUser)).toEqualTypeOf<{ name: string }>()
      expectTypeOf(ctx.find(CurrentUser)).toEqualTypeOf<{ name: string } | undefined>()
      expectTypeOf(ctx.get(Session)).toEqualTypeOf<Promise<{ token: string } | null>>()
      expectTypeOf(ctx.get(Tenant)).toEqualTypeOf<string>()
      ctx.set(CurrentUser, { name: 'ann' })
      ctx.set(Session, { token: 't' })
      // @ts-expect-error wrong value type
      ctx.set(CurrentUser, { name: 1 })
      expectTypeOf(ctx.headers.get('x')).toEqualTypeOf<string | undefined>()
      expectTypeOf(ctx.raw).toEqualTypeOf<unknown>()
    }
    void check
  })
})
