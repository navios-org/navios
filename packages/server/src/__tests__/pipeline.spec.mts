import { createContextKey } from '@navios/core'
import { inject, Injectable, InjectableScope } from '@navios/di'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { RequestContextToken, RequestValue } from '../context/index.mjs'
import {
  GuardDeniedError,
  HttpException,
  NotFoundException,
  ValidationError,
} from '../errors/index.mjs'
import { validateSchema } from '../pipeline/validate-schema.mjs'
import { reply } from '../responses/index.mjs'
import { ManagedBody } from '../responses/managed-body.mjs'
import { sseStream } from '../sse/index.mjs'

import type { RequestContext } from '../context/index.mjs'
import type { HttpGuard as Guard, HttpInterceptor as Interceptor } from '../routing/index.mjs'
import type { RouteEndpointConfig, RouteResult } from '../routing/index.mjs'

import { drain, input, JSON_TYPE, setup } from './pipeline-setup.mjs'

import type { Answer } from './pipeline-setup.mjs'

describe('validateSchema', () => {
  it('returns the value directly for a synchronous schema', () => {
    const result = validateSchema(z.object({ a: z.number() }), { a: 1, b: 2 }, 'body')
    expect(result).toEqual({ a: 1 })
  })

  it('throws ValidationError with the source and issues', () => {
    try {
      validateSchema(z.object({ a: z.number() }), { a: 'x' }, 'query')
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).source).toBe('query')
      expect((error as ValidationError).issues[0].path).toEqual(['a'])
    }
  })

  it('returns a promise only for an asynchronous schema', async () => {
    const schema = z.string().refine(async (value) => value.length > 1)
    const result = validateSchema(schema, 'ok', 'body')
    expect(result).toBeInstanceOf(Promise)
    expect(await result).toBe('ok')
    await expect(validateSchema(schema, 'x', 'body')).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('compileRoute', () => {
  it('stays synchronous when nothing is asynchronous', () => {
    const { execute } = setup({ responseSchema: z.object({ ok: z.boolean() }) }, () => ({
      ok: true,
    }))
    const result = execute(input())
    expect(result).not.toBeInstanceOf(Promise)
    expect(result).toEqual({
      status: 200,
      headers: JSON_TYPE,
      body: { ok: true },
      sent: expect.any(String),
    })
  })

  it('validates url params, query and body and passes them to the handler', async () => {
    const seen: unknown[] = []
    const { execute } = setup(
      {
        method: 'POST',
        url: '/users/$id',
        querySchema: z.object({ page: z.coerce.number() }),
        requestSchema: z.object({ name: z.string() }),
        responseSchema: z.object({ id: z.string() }),
      },
      async (params) => {
        seen.push(params)
        return { id: params.urlParams.id, extra: 'stripped' }
      },
    )
    const result = await execute(
      input({
        urlParams: { id: '7' },
        query: () => ({ page: '2' }),
        body: async () => ({ name: 'n' }),
      }),
    )
    expect(seen).toEqual([{ urlParams: { id: '7' }, params: { page: 2 }, data: { name: 'n' } }])
    expect(result).toEqual({
      status: 200,
      headers: JSON_TYPE,
      body: { id: '7' },
      sent: expect.any(String),
    })
  })

  it('answers 400 problem+json with issues for an invalid query', () => {
    const handler = vi.fn()
    const { execute } = setup({ querySchema: z.object({ page: z.number() }) }, handler)
    const result = execute(input({ query: () => ({ page: 'x' }) })) as Answer
    expect(result.status).toBe(400)
    expect(result.headers).toEqual({ 'content-type': 'application/problem+json' })
    expect(result.body).toMatchObject({
      title: 'Bad Request',
      source: 'query',
      errors: [{ path: 'page' }],
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('runs guards before the body is read and never reads it when a guard denies', async () => {
    const body = vi.fn(() => ({ name: 'n' }))
    const handler = vi.fn()
    const deny: Guard = { canActivate: () => false }
    const { execute } = setup(
      { method: 'POST', requestSchema: z.object({ name: z.string() }) },
      handler,
      { guards: [deny] },
    )
    const result = (await execute(input({ body }))) as Answer
    expect(result.status).toBe(403)
    expect(result.body).toMatchObject({ title: 'Forbidden' })
    expect(body).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })

  it('runs guards in order and stops at the first denial', async () => {
    const order: string[] = []
    const guard = (name: string, allow: boolean, async_ = false): Guard => ({
      canActivate: () => {
        order.push(name)
        return async_ ? Promise.resolve(allow) : allow
      },
    })
    const { execute } = setup({}, () => 'never', {
      guards: [guard('a', true), guard('b', true, true), guard('c', false), guard('d', true)],
    })
    const result = await execute(input())
    expect(order).toEqual(['a', 'b', 'c'])
    expect(result.status).toBe(403)
  })

  it('maps a guard that throws an unknown error to a 500 without the error text', () => {
    const handler = vi.fn()
    const broken: Guard = {
      canActivate: () => {
        throw new Error('db password is hunter2')
      },
    }
    const { execute, unhandled } = setup({}, handler, { guards: [broken] })
    const result = execute(input()) as Answer
    expect(result.status).toBe(500)
    expect(JSON.stringify(result.body)).not.toContain('hunter2')
    expect(unhandled).toHaveLength(1)
    expect(handler).not.toHaveBeenCalled()
  })

  it('exposes the error text only when asked to', () => {
    const { execute } = setup(
      {},
      () => {
        throw new Error('visible')
      },
      { exposeErrorDetails: true },
    )
    expect((execute(input()) as Answer).body).toMatchObject({ detail: 'visible' })
  })

  it('sends HttpException as problem+json unless the status is declared', () => {
    const undeclared = setup({}, () => {
      throw new NotFoundException('User not found')
    })
    expect(undeclared.execute(input())).toMatchObject({
      status: 404,
      headers: { 'content-type': 'application/problem+json' },
      body: { title: 'Not Found', detail: 'User not found', status: 404 },
    })

    const declared = setup({ errorSchema: { 404: z.object({ message: z.string() }) } }, () => {
      throw new HttpException(404, { message: 'gone' })
    })
    expect(declared.execute(input())).toEqual({
      status: 404,
      headers: JSON_TYPE,
      body: { message: 'gone' },
      sent: expect.any(String),
    })
  })

  it('supports reply() for declared success and error statuses', () => {
    const config = {
      responses: { 201: z.object({ id: z.string() }), 204: null },
      errorSchema: { 409: z.object({ reason: z.string() }) },
    }
    expect(setup(config, () => reply(201, { id: '1', x: 1 })).execute(input())).toEqual({
      status: 201,
      headers: JSON_TYPE,
      body: { id: '1' },
      sent: expect.any(String),
    })
    expect(setup(config, () => reply(204)).execute(input())).toEqual({
      status: 204,
      headers: {},
      body: null,
      sent: null,
    })
    expect(setup(config, () => reply(409, { reason: 'taken' })).execute(input())).toEqual({
      status: 409,
      headers: JSON_TYPE,
      body: { reason: 'taken' },
      sent: expect.any(String),
    })
  })

  it('answers 500 for an undeclared status or a non-reply value', () => {
    const config = { responses: { 201: z.object({ id: z.string() }) } }
    const undeclared = setup(config, () => reply(202, {}))
    expect((undeclared.execute(input()) as Answer).status).toBe(500)
    expect(String(undeclared.unhandled[0])).toContain('status 202')

    const plain = setup(config, () => ({ id: '1' }))
    expect((plain.execute(input()) as Answer).status).toBe(500)
    expect(String(plain.unhandled[0])).toContain('must return reply(status, body)')
  })

  it('answers 500 when the response violates its schema, and skips the check when disabled', () => {
    const config = { responseSchema: z.object({ ok: z.boolean() }) }
    const strict = setup(config, () => ({ ok: 'no' }))
    expect((strict.execute(input()) as Answer).status).toBe(500)
    expect(strict.unhandled[0]).toBeInstanceOf(ValidationError)

    const loose = setup(config, () => ({ ok: 'no' }), { validateResponses: false })
    expect(loose.execute(input())).toEqual({
      status: 200,
      headers: JSON_TYPE,
      body: { ok: 'no' },
      sent: expect.any(String),
    })
  })

  it('answers 204 for a void endpoint and passes streams through', async () => {
    expect(setup({ response: 'void' }, () => 'ignored').execute(input())).toEqual({
      status: 204,
      headers: {},
      body: null,
      sent: null,
    })
    // A stream may acquire request resources while it is sent, so it is always
    // released.
    const { execute } = setup({ response: 'stream' }, () => new Response('a').body)
    expect(await execute(input())).toMatchObject({
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
      body: expect.any(ManagedBody),
      release: expect.any(Function),
    })
  })

  it('runs outer interceptors around the guards and inner ones behind them', async () => {
    const order: string[] = []
    const make = (name: string): Interceptor => ({
      async intercept(_ctx, next) {
        order.push(`${name}:in`)
        const result = await next()
        order.push(`${name}:out`)
        return { ...result, headers: { ...result.headers, [`x-${name}`]: '1' } }
      },
    })
    const guard: Guard = {
      canActivate: () => {
        order.push('guard')
        return true
      },
    }
    const { execute } = setup(
      {},
      () => {
        order.push('handler')
        return 'ok'
      },
      { outer: [make('app')], interceptors: [make('outer'), make('inner')], guards: [guard] },
    )
    const result = await execute(input())
    expect(order).toEqual([
      'app:in',
      'guard',
      'outer:in',
      'inner:in',
      'handler',
      'inner:out',
      'outer:out',
      'app:out',
    ])
    expect(result.headers).toEqual({ ...JSON_TYPE, 'x-inner': '1', 'x-outer': '1', 'x-app': '1' })
  })

  it('does not run an inner interceptor for a request that a guard denies', async () => {
    const cached: Interceptor = {
      intercept: async () => ({ status: 200, body: { secret: 42 }, kind: 'json' }),
    }
    const seen: unknown[] = []
    const outer: Interceptor = {
      async intercept(_ctx, next) {
        try {
          return await next()
        } catch (error) {
          seen.push(error)
          throw error
        }
      },
    }
    const { execute } = setup({}, () => 'ok', {
      outer: [outer],
      interceptors: [cached],
      guards: [{ canActivate: async () => false }],
    })
    expect((await execute(input())).status).toBe(403)
    expect(seen[0]).toBeInstanceOf(GuardDeniedError)
  })

  it('gives an inner interceptor what a guard has set', async () => {
    const User = createContextKey<string>('user')
    const { execute } = setup({}, () => 'ok', {
      guards: [
        {
          canActivate(ctx) {
            ctx.set(User, 'ann')
            return true
          },
        },
      ],
      interceptors: [
        {
          async intercept(ctx, next) {
            ctx.reply.header('x-user', ctx.get(User))
            return next()
          },
        },
      ],
    })
    expect((await execute(input())).headers).toMatchObject({ 'x-user': 'ann' })
  })

  it('lets an interceptor observe a thrown error, which is mapped afterwards', async () => {
    const seen: unknown[] = []
    const observer: Interceptor = {
      async intercept(_ctx, next) {
        try {
          return await next()
        } catch (error) {
          seen.push(error)
          throw error
        }
      },
    }
    const { execute } = setup(
      {},
      () => {
        throw new NotFoundException('nope')
      },
      { interceptors: [observer] },
    )
    expect((await execute(input())).status).toBe(404)
    expect(seen[0]).toBeInstanceOf(NotFoundException)
  })

  it('uses the most specific registered error mapper', async () => {
    class DomainError extends Error {}
    class UserMissing extends DomainError {}
    const { execute, errors } = setup({}, () => {
      throw new UserMissing('u')
    })
    errors.add(DomainError, () => reply(400, { kind: 'domain' }))
    errors.add(UserMissing, async (error) => reply(404, { message: error.message }))
    expect(await execute(input())).toEqual({
      status: 404,
      headers: JSON_TYPE,
      body: { message: 'u' },
      sent: expect.any(String),
    })
  })
})

describe('RequestContext', () => {
  it('passes headers, cookies, raw and reply controls', () => {
    const { execute } = setup({}, (_params, ctx: RequestContext) => {
      ctx.reply.header('X-Rate-Limit', '10')
      ctx.reply.cookie('sid', 'abc', { httpOnly: true })
      return {
        auth: ctx.headers.get('authorization'),
        web: ctx.headers.toWebHeaders().get('authorization'),
        theme: ctx.cookies.get('theme'),
        raw: ctx.raw,
        route: ctx.route.handlerName,
        id: ctx.id,
      }
    })
    const result = execute(
      input({
        headerMap: { authorization: 'Bearer t', cookie: 'a=1; theme=dark%20mode' },
        id: 'r1',
      }),
    ) as Answer
    expect(result.body).toEqual({
      auth: 'Bearer t',
      web: 'Bearer t',
      theme: 'dark mode',
      raw: { native: true },
      route: 'handle',
      id: 'r1',
    })
    expect(result.headers).toEqual({
      ...JSON_TYPE,
      'x-rate-limit': '10',
      'set-cookie': ['sid=abc; Path=/; HttpOnly'],
    })
    expect(result.release).toBeUndefined()
  })

  it('carries a typed value from a guard to the handler', () => {
    const CurrentUser = createContextKey<{ name: string }>('CurrentUser')
    const guard: Guard = {
      canActivate(ctx) {
        ctx.set(CurrentUser, { name: 'ann' })
        return true
      },
    }
    const { execute } = setup({}, (_params, ctx: RequestContext) => ctx.get(CurrentUser).name, {
      guards: [guard],
    })
    expect((execute(input()) as Answer).body).toBe('ann')
  })

  it('throws for an unset key and returns undefined from find()', () => {
    const Missing = createContextKey<string>('Missing')
    const found = setup({}, (_params, ctx: RequestContext) => String(ctx.find(Missing)))
    expect((found.execute(input()) as Answer).body).toBe('undefined')

    const thrown = setup({}, (_params, ctx: RequestContext) => ctx.get(Missing))
    expect((thrown.execute(input()) as Answer).status).toBe(500)
    expect(String(thrown.unhandled[0])).toContain('Context key Missing is not set')
  })

  it('computes a request value once per request, and not at all when unread', async () => {
    let resolved = 0
    let disposed = 0

    @Injectable()
    class Auth {
      load(token: string | undefined) {
        return token ? { user: token } : null
      }
    }

    @RequestValue()
    class Session {
      private readonly auth = inject(Auth)
      async resolve(ctx: RequestContext) {
        resolved++
        await Promise.resolve()
        return this.auth.load(ctx.headers.get('authorization'))
      }
      dispose() {
        disposed++
      }
    }

    const reads = setup({}, async (_params, ctx: RequestContext) => {
      const [a, b] = await Promise.all([ctx.get(Session), ctx.get(Session)])
      return { same: a === b, user: a?.user }
    })
    const result = await reads.execute(input({ headerMap: { authorization: 't' } }))
    expect(result.body).toEqual({ same: true, user: 't' })
    expect(resolved).toBe(1)
    expect(disposed).toBe(0)
    await result.release!()
    expect(disposed).toBe(1)

    const unread = setup({}, () => 'ok', { container: reads.container })
    const second = unread.execute(input()) as Answer
    expect(resolved).toBe(1)
    expect(second.release).toBeUndefined()
  })

  it('lets set() pre-fill a request value', async () => {
    @RequestValue()
    class Tenant {
      resolve(): string {
        throw new Error('should not run')
      }
    }

    const { execute } = setup({}, (_params, ctx: RequestContext) => {
      ctx.set(Tenant, 'acme')
      return ctx.get(Tenant)
    })
    expect((execute(input()) as Answer).body).toBe('acme')
  })

  it('rejects every reader once when a request value fails, and retries on the next request', async () => {
    let attempts = 0

    @RequestValue()
    class Flaky {
      async resolve() {
        attempts++
        if (attempts === 1) {
          throw new Error('first request fails')
        }
        return 'ok'
      }
    }

    const { execute } = setup({}, async (_params, ctx: RequestContext) => {
      const settled = await Promise.allSettled([ctx.get(Flaky), ctx.get(Flaky)])
      return settled.map((entry) => entry.status)
    })
    expect((await execute(input())).body).toEqual(['rejected', 'rejected'])
    expect(attempts).toBe(1)
    expect((await execute(input())).body).toEqual(['fulfilled', 'fulfilled'])
    expect(attempts).toBe(2)
  })

  it('detects a cycle between request values', () => {
    @RequestValue()
    class A {
      resolve(ctx: RequestContext): unknown {
        return ctx.get(B)
      }
    }

    @RequestValue()
    class B {
      resolve(ctx: RequestContext): unknown {
        return ctx.get(A)
      }
    }

    const { execute, unhandled } = setup({}, (_params, ctx: RequestContext) => ctx.get(A))
    expect((execute(input()) as Answer).status).toBe(500)
    expect(String(unhandled[0])).toContain('Circular request values: A -> B -> A')
  })

  it('creates a DI scope only when a request-scoped service is used', async () => {
    let created = 0
    let destroyed = 0

    @Injectable({ scope: InjectableScope.Request })
    class UnitOfWork {
      ctx = inject(RequestContextToken)
      constructor() {
        created++
      }
      onServiceDestroy() {
        destroyed++
      }
    }

    const used = setup({}, (_params, ctx: RequestContext) => {
      const first = ctx.use(UnitOfWork)
      return first === ctx.use(UnitOfWork) && first.ctx === ctx
    })
    const result = used.execute(input()) as Answer
    expect(result.body).toBe(true)
    expect(created).toBe(1)
    await result.release!()
    expect(destroyed).toBe(1)

    const unused = setup({}, () => 'ok')
    expect((unused.execute(input()) as Answer).release).toBeUndefined()
  })
})

describe('compileRoute: streams and declared errors', () => {
  it('keeps headers that an async generator sets before its first chunk', async () => {
    const { execute } = setup(
      { response: 'stream' },
      async function* (_params, ctx: RequestContext) {
        ctx.reply.header('content-type', 'text/event-stream')
        yield 'a'
        yield 'b'
      },
    )
    const result = await execute(input())
    expect(result.headers).toEqual({ 'content-type': 'text/event-stream' })
    const chunks: unknown[] = []
    for await (const chunk of result.body as AsyncIterable<unknown>) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['a', 'b'])
  })

  it('takes the content type of a Blob', () => {
    const { execute } = setup({ response: 'blob' }, () => new Blob(['x'], { type: 'image/png' }))
    expect((execute(input()) as Answer).headers).toEqual({ 'content-type': 'image/png' })
  })

  it('reports a string HttpException as a problem even when the status is declared', () => {
    const { execute } = setup({ errorSchema: { 404: z.object({ message: z.string() }) } }, () => {
      throw new NotFoundException('User not found')
    })
    expect(execute(input())).toMatchObject({
      status: 404,
      headers: { 'content-type': 'application/problem+json' },
      body: { detail: 'User not found' },
    })
  })
})

describe('compileRoute: taking the response over', () => {
  it('skips response validation when the handler wrote the response itself', () => {
    let sent = false
    const { execute, unhandled } = setup({ responseSchema: z.object({ ok: z.boolean() }) }, () => {
      sent = true
      return undefined
    })
    const result = execute({ ...input(), responded: () => sent }) as Answer
    expect(result.status).toBe(200)
    expect(result.body).toBeNull()
    expect(unhandled).toEqual([])
  })
})

describe('RequestContext: onFinish', () => {
  it('runs callbacks at release with the final status, including a mapped error status', async () => {
    const seen: Array<number | undefined> = []
    const observer: Interceptor = {
      intercept(ctx, next) {
        ctx.onFinish(() => {
          seen.push(ctx.responseStatus)
        })
        return next()
      },
    }
    class Conflict extends Error {}
    const failing = setup(
      {},
      () => {
        throw new Conflict('taken')
      },
      { interceptors: [observer] },
    )
    failing.errors.add(Conflict, () => reply(409, { reason: 'taken' }))
    const failed = await failing.execute(input())
    expect(failed.status).toBe(409)
    expect(seen).toEqual([])
    await failed.release!()
    expect(seen).toEqual([409])

    const ok = setup({}, () => 'fine', { interceptors: [observer] })
    await (
      await ok.execute(input())
    ).release!()
    expect(seen).toEqual([409, 200])
  })
})

describe('compileRoute: custom result kinds', () => {
  it('answers 500 naming the kind when no encoder is registered for it', async () => {
    const { result } = await import('../responses/custom-result.mjs')
    const { execute, unhandled } = setup({ response: 'text' }, () => result('xml', '<a/>'))
    expect((execute(input()) as Answer).status).toBe(500)
    expect(String(unhandled[0])).toContain('no encoder is registered')
  })
})

/** A promise as some libraries return it: thenable, but not a native Promise. */
function thenable<T>(value: T, onThen?: () => void): Promise<T> {
  return {
    // oxlint-disable-next-line no-thenable
    then(resolve: (value: T) => void) {
      onThen?.()
      resolve(value)
    },
  } as unknown as Promise<T>
}

describe('compileRoute: thenables that are not native promises', () => {
  it('denies the request when a guard thenable resolves to false', async () => {
    const guard: Guard = { canActivate: () => thenable(false) }
    const { execute } = setup({}, () => 'secret', { guards: [guard] })
    expect((await execute(input())).status).toBe(403)
  })

  it('lets the request through when a guard thenable resolves to true', async () => {
    const guard: Guard = { canActivate: () => thenable(true) }
    const { execute } = setup({}, () => 'ok', { guards: [guard] })
    expect((await execute(input())).body).toBe('ok')
  })

  it('denies the request when a guard answers with anything but true', async () => {
    for (const answer of [{ session: 1 }, 'yes', 1]) {
      const guard = { canActivate: () => answer } as unknown as Guard
      const { execute } = setup({}, () => 'secret', { guards: [guard] })
      expect((await execute(input())).status).toBe(403)
      const asynchronous = { canActivate: async () => answer } as unknown as Guard
      const other = setup({}, () => 'secret', { guards: [asynchronous] })
      expect((await other.execute(input())).status).toBe(403)
    }
  })

  it('awaits a handler thenable before validating the response', async () => {
    const { execute } = setup({ responseSchema: z.object({ ok: z.boolean() }) }, () =>
      thenable({ ok: true }),
    )
    expect(await execute(input())).toMatchObject({ status: 200, body: { ok: true } })
  })

  it('awaits an interceptor thenable', async () => {
    const interceptor: Interceptor = {
      intercept(ctx) {
        ctx.reply.header('x-seen', 'yes')
        return thenable<RouteResult>({ status: 202, body: 'i', kind: 'text' })
      },
    }
    const { execute } = setup({}, () => 'ok', { interceptors: [interceptor] })
    expect(await execute(input())).toMatchObject({ status: 202, headers: { 'x-seen': 'yes' } })
  })

  it('awaits a schema that validates with a thenable', async () => {
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: () => thenable({ issues: [{ message: 'never valid' }] }),
      },
    }
    const { execute } = setup({ method: 'POST', requestSchema: schema }, () => 'ok')
    expect((await execute(input({ body: () => ({}) }))).status).toBe(400)
  })

  it('awaits an error mapper thenable', async () => {
    class Custom extends Error {}
    const { execute, errors } = setup({}, () => {
      throw new Custom()
    })
    errors.add(Custom, () => thenable(reply(418, { mapped: true })))
    expect(await execute(input())).toEqual({
      status: 418,
      headers: JSON_TYPE,
      body: { mapped: true },
      sent: expect.any(String),
    })
  })

  it('computes a request value that is a lazy thenable once per request', async () => {
    let runs = 0

    @RequestValue()
    class Lazy {
      resolve() {
        return thenable('row', () => runs++)
      }
    }

    const { execute } = setup({}, async (_params, ctx: RequestContext) => [
      await ctx.get(Lazy),
      await ctx.get(Lazy),
    ])
    expect((await execute(input())).body).toEqual(['row', 'row'])
    expect(runs).toBe(1)
  })
})

describe('compileRoute: interceptor results', () => {
  it('answers 500 naming an interceptor that returns no result', async () => {
    class Forgetful implements Interceptor {
      async intercept(_ctx: RequestContext, next: () => Promise<RouteResult>) {
        await next()
        return undefined as unknown as RouteResult
      }
    }
    const { execute, unhandled } = setup({}, () => 'ok', { interceptors: [new Forgetful()] })
    expect((await execute(input())).status).toBe(500)
    expect(String(unhandled[0])).toContain('Interceptor Forgetful')
  })
})

describe('compileRoute: resources used while a response streams', () => {
  function tracked() {
    const events: string[] = []

    @Injectable({ scope: InjectableScope.Request })
    class UnitOfWork {
      onServiceDestroy() {
        events.push('destroy')
      }
    }
    return { events, UnitOfWork }
  }

  it('releases a scope first used inside a server-sent event generator', async () => {
    const { events, UnitOfWork } = tracked()
    const { execute } = setup({ response: 'stream' }, (_params, ctx: RequestContext) =>
      sseStream(
        (async function* () {
          ctx.use(UnitOfWork)
          ctx.onFinish(() => {
            events.push('finish')
          })
          yield { data: 'x' }
        })(),
      ),
    )
    const result = await execute(input())
    await drain(result)
    await result.release?.()
    expect(events).toEqual(['finish', 'destroy'])
  })

  it('releases a scope first used after the first chunk of a generator', async () => {
    const { events, UnitOfWork } = tracked()
    const { execute } = setup(
      { response: 'stream' },
      async function* (_params, ctx: RequestContext) {
        yield 'a'
        ctx.use(UnitOfWork)
        yield 'b'
      },
    )
    const result = await execute(input())
    expect(await drain(result)).toEqual(['a', 'b'])
    await result.release?.()
    expect(events).toEqual(['destroy'])
  })

  it('releases a scope first used inside a web stream', async () => {
    const { events, UnitOfWork } = tracked()
    const { execute } = setup(
      { response: 'stream' },
      (_params, ctx: RequestContext) =>
        new ReadableStream(
          {
            pull(controller) {
              ctx.use(UnitOfWork)
              controller.close()
            },
          },
          { highWaterMark: 0 },
        ),
    )
    const result = await execute(input())
    await drain(result)
    await result.release?.()
    expect(events).toEqual(['destroy'])
  })

  it('refuses to create a scope once the response has finished', async () => {
    const { events, UnitOfWork } = tracked()
    let late: RequestContext | undefined
    const { execute } = setup(
      { response: 'stream' },
      async function* (_params, ctx: RequestContext) {
        late = ctx
        yield 'a'
      },
    )
    const result = await execute(input())
    // The client went away.
    await result.release?.()
    expect(() => late!.use(UnitOfWork)).toThrow('response has finished')
    expect(events).toEqual([])
  })

  it('refuses to compute a disposable request value once the response has finished', async () => {
    let disposed = 0

    @RequestValue()
    class Transaction {
      resolve() {
        return { id: 1 }
      }
      dispose() {
        disposed++
      }
    }

    let late: RequestContext | undefined
    const { execute } = setup({ response: 'stream' }, async function* (_params, ctx) {
      late = ctx
      yield 'a'
    })
    const result = await execute(input())
    await drain(result)
    await result.release?.()
    expect(() => late!.get(Transaction)).toThrow('response has finished')
    expect(disposed).toBe(0)
  })

  it('runs a callback registered after the response has finished at once', async () => {
    let late: RequestContext | undefined
    const { execute } = setup({ response: 'stream' }, async function* (_params, ctx) {
      late = ctx
      yield 'a'
    })
    const result = await execute(input())
    await drain(result)
    await result.release?.()
    let ran = 0
    late!.onFinish(() => {
      ran++
    })
    expect(ran).toBe(1)
  })
})

describe('compileRoute: url params and query', () => {
  it('passes url params of a prefix to a handler whose own url has none', async () => {
    const { execute } = setup({ url: '/members' }, (params) => params.urlParams, {
      path: '/orgs/$orgId/members',
    })
    const result = await execute(input({ urlParams: { orgId: '7' } }))
    expect(result.body).toEqual({ orgId: '7' })
  })

  it('keeps url params of a prefix next to the validated ones', async () => {
    const { execute } = setup(
      { url: '/users/$id', urlParamsSchema: z.object({ id: z.coerce.number() }) },
      (params) => params.urlParams,
      { path: '/orgs/$orgId/users/$id' },
    )
    const result = await execute(input({ urlParams: { orgId: '7', id: '1' } }))
    expect(result.body).toEqual({ orgId: '7', id: 1 })
  })

  it('lets a guard read url params and the query from the context', async () => {
    const seen: unknown[] = []
    const guard: Guard = {
      canActivate(ctx) {
        seen.push(ctx.urlParams, ctx.query)
        return ctx.urlParams.id === '1'
      },
    }
    const { execute } = setup({ url: '/users/$id' }, () => 'ok', { guards: [guard] })
    const request = input({ urlParams: { id: '1' }, query: () => ({ tag: ['a', 'b'] }) })
    expect((await execute(request)).body).toBe('ok')
    expect(seen).toEqual([{ id: '1' }, { tag: ['a', 'b'] }])
    expect((await execute(input({ urlParams: { id: '2' } }))).status).toBe(403)
  })

  it('parses the query once per request', async () => {
    let parsed = 0
    const { execute } = setup(
      { querySchema: z.object({ a: z.string() }) },
      (params, ctx: RequestContext) => [params.params, ctx.query.a],
    )
    const result = await execute(
      input({
        query: () => {
          parsed++
          return { a: '1' }
        },
      }),
    )
    expect(result.body).toEqual([{ a: '1' }, '1'])
    expect(parsed).toBe(1)
  })
})

describe('compileRoute: next() called again', () => {
  it('reads the body from the adapter once', async () => {
    const body = vi.fn(async () => ({ name: 'n' }))
    const seen: unknown[] = []
    const retry: Interceptor = {
      async intercept(_ctx, next) {
        await next().catch(() => {})
        return next()
      },
    }
    let calls = 0
    const { execute } = setup(
      { method: 'POST', requestSchema: z.object({ name: z.string() }) },
      (params) => {
        seen.push(params.data)
        if (calls++ === 0) {
          throw new Error('try again')
        }
        return 'ok'
      },
      { interceptors: [retry] },
    )
    expect((await execute(input({ body }))).body).toBe('ok')
    expect(seen).toEqual([{ name: 'n' }, { name: 'n' }])
    expect(body).toHaveBeenCalledTimes(1)
  })
})

describe('ErrorPipeline: a mapper that returns no response', () => {
  it('answers 500 from the pipeline itself, not from an adapter fallback', async () => {
    class Weird extends Error {}
    const sync = setup({}, () => {
      throw new Weird()
    })
    sync.errors.add(Weird, () => undefined as never)
    const result = sync.execute(input()) as Answer
    expect(result.status).toBe(500)
    expect(result.headers).toEqual({ 'content-type': 'application/problem+json' })
    expect(String(sync.unhandled[0])).toContain('error mapper for Weird did not return a response')

    const asynchronous = setup({}, () => {
      throw new Weird()
    })
    asynchronous.errors.add(Weird, async () => ({}) as never)
    expect((await asynchronous.execute(input())).status).toBe(500)
  })
})

describe('headersSchema', () => {
  const schema = z.looseObject({ 'x-tenant': z.string() })

  it('reads the record of the adapter without building web headers', async () => {
    const headers = vi.fn(() => new Headers())
    const { execute } = setup({ headersSchema: schema }, ({ headers }) => headers)
    const result = await execute(input({ headers, headerRecord: () => ({ 'x-tenant': 'acme' }) }))
    expect(result.body).toEqual({ 'x-tenant': 'acme' })
    expect(headers).not.toHaveBeenCalled()
  })

  it('builds the record from web headers for an adapter that has none', async () => {
    const { execute } = setup({ headersSchema: schema }, ({ headers }) => headers)
    const result = await execute(input({ headerMap: { 'X-Tenant': 'acme' } }))
    expect(result.body).toEqual({ 'x-tenant': 'acme' })
  })
})

describe('compileRoute: a context used after a response that holds nothing', () => {
  it('refuses a scope, and a disposable request value, once such a response is sealed', () => {
    let created = 0

    @Injectable({ scope: InjectableScope.Request })
    class UnitOfWork {
      constructor() {
        created++
      }
    }

    @RequestValue()
    class Transaction {
      resolve() {
        return { id: 1 }
      }
      dispose() {}
    }

    let late: RequestContext | undefined
    const { execute } = setup({}, (_params, ctx: RequestContext) => {
      late = ctx
      return { ok: true }
    })
    const result = execute(input()) as Answer
    expect(result.release).toBeUndefined()
    // Detached work the handler started reaches for the request afterwards.
    expect(() => late!.use(UnitOfWork)).toThrow('response has finished')
    expect(() => late!.get(Transaction)).toThrow('response has finished')
    expect(created).toBe(0)
    let ran = 0
    late!.onFinish(() => {
      ran++
    })
    expect(ran).toBe(1)
  })

  it('does the same when the response carries headers, and when it is an error', async () => {
    @Injectable({ scope: InjectableScope.Request })
    class UnitOfWork {}

    let late: RequestContext | undefined
    const withHeader = setup({}, (_params, ctx: RequestContext) => {
      late = ctx
      ctx.reply.header('x-a', '1')
      return { ok: true }
    })
    expect((withHeader.execute(input()) as Answer).release).toBeUndefined()
    expect(() => late!.use(UnitOfWork)).toThrow('response has finished')

    const failing = setup({}, (_params, ctx: RequestContext) => {
      late = ctx
      throw new NotFoundException('nope')
    })
    expect((failing.execute(input()) as Answer).status).toBe(404)
    expect(() => late!.use(UnitOfWork)).toThrow('response has finished')
  })
})

describe('compileRoute: an error pipeline that fails', () => {
  function tracked() {
    const events: string[] = []

    @Injectable({ scope: InjectableScope.Request })
    class UnitOfWork {
      onServiceDestroy() {
        events.push('destroy')
      }
    }
    return { events, UnitOfWork }
  }

  it('answers a bare 500 with release when reporting the error throws', async () => {
    const { events, UnitOfWork } = tracked()
    const { execute } = setup(
      {},
      (_params, ctx: RequestContext) => {
        ctx.use(UnitOfWork)
        throw new Error('boom')
      },
      {
        onUnhandled: () => {
          throw new Error('logger down')
        },
      },
    )
    const result = execute(input()) as Answer
    expect(result.status).toBe(500)
    expect(result.body).toMatchObject({ status: 500, title: 'Internal Server Error' })
    await result.release!()
    expect(events).toEqual(['destroy'])
  })

  it('answers a bare 500 with release when it throws after an asynchronous mapper', async () => {
    class DomainError extends Error {}
    const { events, UnitOfWork } = tracked()
    const { execute, errors } = setup(
      {},
      async (_params, ctx: RequestContext) => {
        ctx.use(UnitOfWork)
        throw new DomainError('boom')
      },
      {
        onUnhandled: () => {
          throw new Error('logger down')
        },
      },
    )
    errors.add(DomainError, async () => {
      throw new Error('mapper down')
    })
    const result = await execute(input())
    expect(result.status).toBe(500)
    await result.release!()
    expect(events).toEqual(['destroy'])
  })
})

describe('ErrorPipeline: built-in mappings and user mappers', () => {
  const catchAll = () => reply(418, { caught: true })

  it('keeps the built-in mappings when a mapper is registered for Error', async () => {
    const schema = z.object({ a: z.number() })
    const thrown = setup({}, () => {
      throw new NotFoundException('User not found')
    })
    thrown.errors.add(Error, catchAll)
    expect((thrown.execute(input()) as Answer).status).toBe(404)

    const denied = setup({}, () => ({}), { guards: [{ canActivate: () => false }] })
    denied.errors.add(Error, catchAll)
    expect((denied.execute(input()) as Answer).status).toBe(403)

    const invalid = setup({ querySchema: schema }, () => ({}))
    invalid.errors.add(Error, catchAll)
    expect((invalid.execute(input()) as Answer).status).toBe(400)

    // What no built-in handles still reaches the mapper.
    const unknown = setup({}, () => {
      throw new TypeError('boom')
    })
    unknown.errors.add(Error, catchAll)
    expect((unknown.execute(input()) as Answer).status).toBe(418)

    const response = setup({ responseSchema: schema }, () => ({ a: 'x' }))
    response.errors.add(Error, catchAll)
    expect((response.execute(input()) as Answer).status).toBe(418)
  })

  it('lets a mapper registered for a built-in class, or a subclass of it, override it', () => {
    const thrown = setup({}, () => {
      throw new NotFoundException('User not found')
    })
    thrown.errors.add(HttpException, catchAll)
    expect((thrown.execute(input()) as Answer).status).toBe(418)

    const specific = setup({}, () => {
      throw new NotFoundException('User not found')
    })
    specific.errors.add(Error, () => reply(599, {}))
    specific.errors.add(NotFoundException, catchAll)
    expect((specific.execute(input()) as Answer).status).toBe(418)

    const invalid = setup({ querySchema: z.object({ a: z.number() }) }, () => ({}))
    invalid.errors.add(ValidationError, catchAll)
    expect((invalid.execute(input()) as Answer).status).toBe(418)

    const denied = setup({}, () => ({}), { guards: [{ canActivate: () => false }] })
    denied.errors.add(GuardDeniedError, catchAll)
    expect((denied.execute(input()) as Answer).status).toBe(418)
  })
})

describe('ErrorPipeline: HttpException', () => {
  it('reports a thrown HttpException of status 500 or above, and answers with its own body', () => {
    const error = new HttpException(503, 'Database is down')
    const { execute, unhandled } = setup({}, () => {
      throw error
    })
    const result = execute(input()) as Answer
    expect(result.status).toBe(503)
    expect(result.body).toMatchObject({ status: 503, detail: 'Database is down' })
    expect(unhandled).toEqual([error])
  })

  it('does not report an HttpException below 500', () => {
    const { execute, unhandled } = setup({}, () => {
      throw new NotFoundException('nope')
    })
    expect((execute(input()) as Answer).status).toBe(404)
    expect(unhandled).toEqual([])
  })

  it('keeps the status of a problem when the body of an HttpException names another', () => {
    const { execute } = setup({}, () => {
      throw new HttpException(403, {
        status: 200,
        title: 'Account suspended',
        type: 'https://example.com/problems/suspended',
        reason: 'banned',
      })
    })
    const result = execute(input()) as Answer
    expect(result.status).toBe(403)
    expect(result.body).toEqual({
      type: 'https://example.com/problems/suspended',
      title: 'Account suspended',
      status: 403,
      reason: 'banned',
    })
  })
})

describe('RequestContext: cookies', () => {
  it('reads a cookie named like a member of Object.prototype, and nothing for one not sent', () => {
    const { execute } = setup({}, (_params, ctx: RequestContext) => ({
      missing: ctx.cookies.get('constructor') ?? null,
      proto: ctx.cookies.get('__proto__') ?? null,
    }))
    expect((execute(input({ headerMap: { cookie: 'a=1' } })) as Answer).body).toEqual({
      missing: null,
      proto: null,
    })

    const sent = setup({}, (_params, ctx: RequestContext) => ({
      value: ctx.cookies.get('constructor'),
      names: Object.keys(ctx.cookies.all()),
    }))
    expect(
      (sent.execute(input({ headerMap: { cookie: 'constructor=x; toString=y' } })) as Answer).body,
    ).toEqual({ value: 'x', names: ['constructor', 'toString'] })
  })

  it('validates the cookies with a schema', () => {
    const { execute } = setup(
      { cookiesSchema: z.object({ session: z.string() }) } as Partial<RouteEndpointConfig>,
      (params) => params.cookies,
    )
    expect((execute(input({ headerMap: { cookie: 'session=abc' } })) as Answer).body).toEqual({
      session: 'abc',
    })
  })
})
