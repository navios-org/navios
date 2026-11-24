import { InjectableScope, registerInjectable } from '@navios/di'

import { NaviosFactory } from '../application/navios-factory.mjs'
import { createContextKey, registerRequestValue } from '../context/context-key.mjs'
import { AttributeFactory } from '../decorators/attribute.mjs'
import { registerController, registerModule } from '../decorators/decorators.mjs'
import { handler } from '../decorators/handler.mjs'
import { HttpException, UnauthorizedException } from '../errors/http-exception.mjs'
import { reply } from '../routing/reply.mjs'

import type { AdapterDefinition } from '../adapter/http-adapter.mjs'
import type { NaviosApplication } from '../application/navios-application.mjs'
import type { RequestContext } from '../context/request-context.mjs'
import type { Guard } from '../routing/compile-route.mjs'

import { s } from './schema.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The test-runner functions the suite needs. Pass Vitest's or `bun:test`'s.
 */
export interface ConformanceRunner {
  describe: (name: string, fn: () => void) => void
  it: (name: string, fn: () => Promise<void> | void) => void
  expect: (value: any) => any
  beforeAll: (fn: () => Promise<void> | void) => void
  afterAll: (fn: () => Promise<void> | void) => void
}

export interface ConformanceOptions {
  runner: ConformanceRunner
  /** Shown in the suite title. */
  name: string
  /** Creates the adapter under test. `multipart` must be enabled. */
  adapter: () => AdapterDefinition<any>
  /** Options for `app.listen()` that bind an ephemeral local port. */
  listenOptions: unknown
}

const endpoint = <Config extends Record<string, unknown>>(config: Config) => ({ config }) as any

/**
 * The behaviour every HTTP adapter must show, exercised over real HTTP.
 * Adapter packages run it from their own test suite:
 *
 * ```ts
 * import { afterAll, beforeAll, describe, expect, it } from 'vitest'
 * import { runAdapterConformance } from '@navios/core/conformance'
 *
 * runAdapterConformance({
 *   runner: { describe, it, expect, beforeAll, afterAll },
 *   name: 'fastify',
 *   adapter: () => defineFastifyEnvironment({ multipart: true }),
 *   listenOptions: { port: 0, host: '127.0.0.1' },
 * })
 * ```
 */
export function runAdapterConformance(options: ConformanceOptions): void {
  const { describe, it, expect, beforeAll, afterAll } = options.runner

  describe(`adapter conformance: ${options.name}`, () => {
    let app: NaviosApplication<any>
    let base: string
    const events: string[] = []
    let slowStarted: (() => void) | null = null
    let releaseSlow: (() => void) | null = null

    const CurrentUser = createContextKey<{ name: string }>('CurrentUser')
    const Public = AttributeFactory.createAttribute(Symbol.for('navios.conformance.Public'))

    class Session {
      resolve(ctx: RequestContext) {
        events.push('session:resolve')
        const header = ctx.headers.get('authorization')
        return header ? { name: header.replace('Bearer ', '') } : null
      }
      dispose() {
        events.push('session:dispose')
      }
    }
    registerRequestValue(Session)

    class AuthGuard implements Guard {
      canActivate(ctx: RequestContext) {
        if (AttributeFactory.has(Public, ctx.route)) {
          return true
        }
        const session = ctx.get(Session)
        if (!session) {
          throw new UnauthorizedException('Missing authorization header')
        }
        ctx.set(CurrentUser, session)
        return true
      }
    }
    registerInjectable(AuthGuard)

    class UnitOfWork {
      readonly id = Math.random()
      onServiceDestroy() {
        events.push('uow:destroy')
      }
    }
    registerInjectable(UnitOfWork, { scope: InjectableScope.Request })

    const user = s.object({ id: s.string(), name: s.string() })

    class PublicController {
      simple = handler(
        endpoint({
          method: 'GET',
          url: '/simple',
          responseSchema: s.object({ message: s.string() }),
        }),
        () => ({ message: 'ok' }),
      )

      urlParams = handler(
        endpoint({
          method: 'GET',
          url: '/items/$id/parts/$partId',
          responseSchema: s.object({ id: s.string(), partId: s.string() }),
        }),
        ({ urlParams }: any) => urlParams,
      )

      query = handler(
        endpoint({
          method: 'GET',
          url: '/search',
          querySchema: s.object({ q: s.string(), limit: s.number({ coerce: true }) }),
          responseSchema: s.object({ q: s.string(), limit: s.number() }),
        }),
        ({ params }: any) => params,
      )

      create = handler(
        endpoint({
          method: 'POST',
          url: '/users',
          requestSchema: s.object({ name: s.string({ min: 1 }) }),
          responses: { 201: user },
          errorSchema: { 409: s.object({ reason: s.string() }) },
        }),
        ({ data }: any) =>
          data.name === 'taken'
            ? reply(409, { reason: 'name is taken' })
            : reply(201, { id: '1', name: data.name, internal: 'must be stripped' }),
      )

      remove = handler(
        endpoint({ method: 'DELETE', url: '/users/$id', response: 'void' }),
        () => undefined,
      )

      noContent = handler(
        endpoint({ method: 'PUT', url: '/users/$id', responses: { 204: null } }),
        () => reply(204),
      )

      declaredError = handler(
        endpoint({
          method: 'GET',
          url: '/declared-error',
          responseSchema: user,
          errorSchema: { 404: s.object({ message: s.string() }) },
        }),
        () => {
          throw new HttpException(404, { message: 'declared body' })
        },
      )

      undeclaredError = handler(
        endpoint({ method: 'GET', url: '/undeclared-error', responseSchema: user }),
        () => {
          throw new HttpException(418, 'teapot')
        },
      )

      crash = handler(endpoint({ method: 'GET', url: '/crash', responseSchema: user }), () => {
        throw new Error('db password is hunter2')
      })

      badResponse = handler(
        endpoint({ method: 'GET', url: '/bad-response', responseSchema: user }),
        () => ({ id: 1 }) as any,
      )

      headers = handler(
        endpoint({
          method: 'GET',
          url: '/headers',
          responseSchema: s.object({ agent: s.string(), theme: s.string() }),
        }),
        (_params: any, ctx: RequestContext) => {
          ctx.reply.header('x-custom', 'yes')
          ctx.reply.cookie('sid', 'a b', { httpOnly: true, path: '/' })
          return {
            agent: ctx.headers.get('x-agent') ?? '',
            theme: ctx.cookies.get('theme') ?? '',
          }
        },
      )

      text = handler(
        endpoint({ method: 'GET', url: '/text', response: 'text' }),
        () => 'plain text',
      )

      stream = handler(
        endpoint({ method: 'GET', url: '/stream', response: 'stream' }),
        async function* () {
          yield 'chunk-1;'
          yield 'chunk-2;'
        },
      )

      webStream = handler(
        endpoint({ method: 'GET', url: '/web-stream', response: 'stream' }),
        () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('web-stream'))
              controller.close()
            },
          }),
      )

      upload = handler(
        endpoint({
          method: 'POST',
          url: '/upload',
          body: 'multipart',
          requestSchema: s.object({ title: s.string(), file: s.file() }),
          responseSchema: s.object({ title: s.string(), filename: s.string(), size: s.number() }),
        }),
        async ({ data }: any) => ({
          title: data.title,
          filename: data.file.name,
          size: (await data.file.arrayBuffer()).byteLength,
        }),
      )

      scoped = handler(
        endpoint({
          method: 'GET',
          url: '/scoped',
          responseSchema: s.object({ same: s.boolean() }),
        }),
        (_params: any, ctx: RequestContext) => ({
          same: ctx.use(UnitOfWork) === ctx.use(UnitOfWork),
        }),
      )

      slow = handler(
        endpoint({ method: 'GET', url: '/slow', responseSchema: s.object({ done: s.boolean() }) }),
        async () => {
          slowStarted?.()
          await new Promise<void>((resolve) => {
            releaseSlow = resolve
          })
          return { done: true }
        },
      )

      abortable = handler(
        endpoint({
          method: 'GET',
          url: '/abortable',
          responseSchema: s.object({ done: s.boolean() }),
        }),
        async (_params: any, ctx: RequestContext) => {
          ctx.use(UnitOfWork)
          events.push('abortable:start')
          await new Promise<void>((resolve) => {
            ctx.signal.addEventListener('abort', () => {
              events.push('abortable:aborted')
              resolve()
            })
          })
          throw new Error('client went away')
        },
      )
    }
    registerController(PublicController, { attributes: [Public()] })

    class PrivateController {
      me = handler(
        endpoint({ method: 'GET', url: '/me', responseSchema: s.object({ name: s.string() }) }),
        (_params: any, ctx: RequestContext) => ({ name: ctx.get(CurrentUser).name }),
      )

      guarded = handler(
        endpoint({
          method: 'POST',
          url: '/guarded',
          requestSchema: s.object({ name: s.string() }),
          responseSchema: s.object({ name: s.string() }),
        }),
        ({ data }: any) => data,
      )
    }
    registerController(PrivateController)

    class PrivateModule {}
    registerModule(PrivateModule, { controllers: [PrivateController], guards: [AuthGuard] })

    class AppModule {}
    registerModule(AppModule, {
      controllers: [PublicController],
      imports: [PrivateModule],
      prefix: '/api',
    })

    const url = (path: string) => `${base}/api${path}`
    const json = (body: unknown, headers: Record<string, string> = {}) => ({
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
    const waitFor = async (predicate: () => boolean) => {
      for (let i = 0; i < 200 && !predicate(); i++) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    }

    beforeAll(async () => {
      app = await NaviosFactory.create(AppModule, {
        adapter: options.adapter(),
        logger: false,
        requestScopedServices: 'allow',
        shutdownTimeout: 2000,
      })
      const address = await app.listen(options.listenOptions)
      base = address.replace(/\/$/, '').replace('[::1]', '127.0.0.1')
    })

    afterAll(async () => {
      await app.close()
    })

    it('serves JSON with url params and a coerced query', async () => {
      const simple = await fetch(url('/simple'))
      expect(simple.status).toBe(200)
      expect(simple.headers.get('content-type')).toContain('application/json')
      expect(await simple.json()).toEqual({ message: 'ok' })

      const params = await fetch(url('/items/a%20b/parts/7'))
      expect(await params.json()).toEqual({ id: 'a b', partId: '7' })

      const query = await fetch(url('/search?q=hello&limit=5'))
      expect(await query.json()).toEqual({ q: 'hello', limit: 5 })
    })

    it('answers 400 problem+json for an invalid query, an invalid body and malformed JSON', async () => {
      const query = await fetch(url('/search?q=hello&limit=abc'))
      expect(query.status).toBe(400)
      expect(query.headers.get('content-type')).toContain('application/problem+json')
      expect((await query.json()).source).toBe('query')

      const body = await fetch(url('/users'), json({ name: '' }))
      expect(body.status).toBe(400)
      expect((await body.json()).source).toBe('body')

      const malformed = await fetch(url('/users'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"name": ',
      })
      expect(malformed.status).toBe(400)
      expect(malformed.headers.get('content-type')).toContain('application/problem+json')
    })

    it('uses declared statuses, strips undeclared fields and sends bodiless statuses', async () => {
      const created = await fetch(url('/users'), json({ name: 'ann' }))
      expect(created.status).toBe(201)
      expect(await created.json()).toEqual({ id: '1', name: 'ann' })

      const conflict = await fetch(url('/users'), json({ name: 'taken' }))
      expect(conflict.status).toBe(409)
      expect(await conflict.json()).toEqual({ reason: 'name is taken' })

      const removed = await fetch(url('/users/1'), { method: 'DELETE' })
      expect(removed.status).toBe(204)
      expect(await removed.text()).toBe('')

      const updated = await fetch(url('/users/1'), { method: 'PUT' })
      expect(updated.status).toBe(204)
      expect(await updated.text()).toBe('')
    })

    it('maps errors the same way everywhere', async () => {
      const declared = await fetch(url('/declared-error'))
      expect(declared.status).toBe(404)
      expect(await declared.json()).toEqual({ message: 'declared body' })

      const undeclared = await fetch(url('/undeclared-error'))
      expect(undeclared.status).toBe(418)
      expect(undeclared.headers.get('content-type')).toContain('application/problem+json')
      expect((await undeclared.json()).detail).toBe('teapot')

      const crash = await fetch(url('/crash'))
      expect(crash.status).toBe(500)
      const crashText = await crash.text()
      expect(crashText.includes('hunter2')).toBe(false)
      expect(JSON.parse(crashText).title).toBe('Internal Server Error')

      const badResponse = await fetch(url('/bad-response'))
      expect(badResponse.status).toBe(500)

      const missing = await fetch(url('/does-not-exist'))
      expect(missing.status).toBe(404)
      expect(missing.headers.get('content-type')).toContain('application/problem+json')
      expect((await missing.json()).title).toBe('Not Found')
    })

    it('runs guards before the body is validated', async () => {
      const anonymous = await fetch(url('/guarded'), json({ name: 123 }))
      expect(anonymous.status).toBe(401)
      expect((await anonymous.json()).detail).toBe('Missing authorization header')

      const invalid = await fetch(
        url('/guarded'),
        json({ name: 123 }, { authorization: 'Bearer ann' }),
      )
      expect(invalid.status).toBe(400)

      const valid = await fetch(
        url('/guarded'),
        json({ name: 'x' }, { authorization: 'Bearer ann' }),
      )
      expect(await valid.json()).toEqual({ name: 'x' })
    })

    it('carries a guard value to the handler and computes request values lazily', async () => {
      events.length = 0
      await fetch(url('/simple'))
      expect(events).toEqual([])

      const me = await fetch(url('/me'), { headers: { authorization: 'Bearer ann' } })
      expect(await me.json()).toEqual({ name: 'ann' })
      await waitFor(() => events.includes('session:dispose'))
      expect(events).toEqual(['session:resolve', 'session:dispose'])
    })

    it('reads request headers and cookies and writes response headers and cookies', async () => {
      const response = await fetch(url('/headers'), {
        headers: { 'x-agent': 'conformance', cookie: 'a=1; theme=dark' },
      })
      expect(await response.json()).toEqual({ agent: 'conformance', theme: 'dark' })
      expect(response.headers.get('x-custom')).toBe('yes')
      expect(response.headers.get('set-cookie')).toBe('sid=a%20b; Path=/; HttpOnly')
    })

    it('sends text and streams', async () => {
      const text = await fetch(url('/text'))
      expect(text.headers.get('content-type')).toContain('text/plain')
      expect(await text.text()).toBe('plain text')

      expect(await (await fetch(url('/stream'))).text()).toBe('chunk-1;chunk-2;')
      expect(await (await fetch(url('/web-stream'))).text()).toBe('web-stream')
    })

    it('parses multipart bodies into fields and files', async () => {
      const form = new FormData()
      form.append('title', 'report')
      form.append('file', new File(['hello world'], 'hello.txt', { type: 'text/plain' }))
      const response = await fetch(url('/upload'), { method: 'POST', body: form })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ title: 'report', filename: 'hello.txt', size: 11 })
    })

    it('disposes a request scope after the response', async () => {
      events.length = 0
      const response = await fetch(url('/scoped'))
      expect(await response.json()).toEqual({ same: true })
      await waitFor(() => events.includes('uow:destroy'))
      expect(events).toEqual(['uow:destroy'])
    })

    it('aborts ctx.signal and releases the scope when the client disconnects', async () => {
      events.length = 0
      const controller = new AbortController()
      const pending = fetch(url('/abortable'), { signal: controller.signal }).catch(() => null)
      await waitFor(() => events.includes('abortable:start'))
      controller.abort()
      await pending
      await waitFor(() => events.includes('uow:destroy'))
      expect(events).toEqual(['abortable:start', 'abortable:aborted', 'uow:destroy'])
    })

    it('handles a request in process with inject()', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/simple' })
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ message: 'ok' })
    })

    it('waits for in-flight requests when closing', async () => {
      const started = new Promise<void>((resolve) => {
        slowStarted = resolve
      })
      const pending = fetch(url('/slow'))
      await started
      const closing = app.close()
      setTimeout(() => releaseSlow?.(), 30)
      const response = await pending
      expect(await response.json()).toEqual({ done: true })
      await closing
    })
  })
}
