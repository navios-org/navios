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
const text = api.declareEndpoint({ method: 'GET', url: '/text', response: 'text' })
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

  it('types the chunks of a stream', () => {
    handler(download, async function* () {
      yield 'text'
      yield new Uint8Array()
    })
    // @ts-expect-error a chunk is a string or bytes
    handler(download, async function* () {
      yield { a: 1 }
    })
    // @ts-expect-error a chunk is a string or bytes
    handler(text, async function* () {
      yield 1
    })
  })

  it('accepts a Web Response from a stream, text or blob endpoint, and not from a JSON one', () => {
    handler(download, () => new Response('body'))
    handler(download, async () => new Response(null, { status: 302 }))
    handler(text, () => new Response('text'))
    // @ts-expect-error a JSON endpoint returns its body
    handler(getUser, () => new Response('{}'))
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

describe('@Endpoint method form without a return annotation', () => {
  const getTask = api.declareEndpoint({
    method: 'GET',
    url: '/tasks/$id',
    responseSchema: z.discriminatedUnion('state', [
      z.object({ state: z.literal('open'), priority: z.enum(['low', 'high']) }),
      z.object({ state: z.literal('done'), by: z.string() }),
    ]),
    errorSchema: { 404: z.object({ code: z.literal('NOT_FOUND') }) },
  })
  const createTask = api.declareEndpoint({
    method: 'POST',
    url: '/tasks',
    responses: { 201: z.object({ state: z.enum(['open', 'done']) }), 202: null },
  })

  it('accepts literal fields, replies, streams and void', () => {
    @Controller()
    class Good {
      @Endpoint(getTask)
      async getTask({ urlParams }: HandlerParams<typeof getTask>, _ctx: RequestContext) {
        if (urlParams.id === 'missing') {
          return reply(404, { code: 'NOT_FOUND' })
        }
        return urlParams.id === 'done'
          ? { state: 'done', by: 'ann' }
          : { state: 'open', priority: 'high' }
      }

      @Endpoint(createTask)
      async createTask() {
        return Math.random() > 0.5 ? reply(202) : reply(201, { state: 'open' })
      }

      @Endpoint(download)
      download() {
        return (async function* () {
          yield 'chunk'
        })()
      }

      @Endpoint(remove)
      async remove(_params: HandlerParams<typeof remove>) {}
    }
    void Good
  })

  it('still rejects a wrong shape, status or parameter type', () => {
    @Controller()
    class Bad {
      // @ts-expect-error by is missing
      @Endpoint(getTask)
      async wrongShape() {
        return { state: 'done' }
      }

      // @ts-expect-error a responses endpoint must return reply()
      @Endpoint(createTask)
      async noReply() {
        return { state: 'open' }
      }

      // @ts-expect-error 200 is not declared
      @Endpoint(createTask)
      async wrongStatus() {
        return reply(200, { state: 'open' })
      }

      // @ts-expect-error a stream endpoint must return a stream
      @Endpoint(download)
      async notAStream() {
        return 'text'
      }

      // @ts-expect-error the endpoint has no such URL parameter
      @Endpoint(getTask)
      async wrongParams(_params: { urlParams: { slug: string } }) {
        return { state: 'done', by: 'ann' }
      }
    }
    void Bad
  })

  it('checks literal values when the return type is annotated', () => {
    @Controller()
    class Strict {
      @Endpoint(getTask)
      async getTask(): HandlerResult<typeof getTask> {
        // @ts-expect-error 'urgent' is not a declared priority
        return { state: 'open', priority: 'urgent' }
      }
    }
    void Strict
  })
})

describe('request context', () => {
  it('types the controls of the response', () => {
    const check = (ctx: RequestContext) => {
      ctx.reply.header('x-a', ['a', 'b'] as const)
      ctx.reply.header('retry-after', 5)
      ctx.reply.append('x-a', 'c')
      ctx.reply.cookie('a', '1', { partitioned: true, secure: true })
      ctx.reply.deleteCookie('a', { path: '/', domain: 'a.test' })
      // @ts-expect-error a header value is text or a number
      ctx.reply.header('x-a', true)
      // @ts-expect-error a deleted cookie has no lifetime
      ctx.reply.deleteCookie('a', { maxAge: 1 })
    }
    expectTypeOf(check).toBeFunction()
  })

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

    @RequestValue()
    class Row {
      resolve(_ctx: RequestContext) {
        return { then() {} } as unknown as PromiseLike<{ id: number }>
      }
    }

    // Type-level only: never called.
    const check = (ctx: RequestContext) => {
      expectTypeOf(ctx.get(Row)).toEqualTypeOf<Promise<{ id: number }>>()
      expectTypeOf(ctx.urlParams.id).toEqualTypeOf<string>()
      expectTypeOf(ctx.query.page).toEqualTypeOf<string | string[] | undefined>()
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
