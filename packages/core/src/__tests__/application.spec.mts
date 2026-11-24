import { builder } from '@navios/builder'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import {
  AttributeFactory,
  Controller,
  createContextKey,
  currentContext,
  definePlugin,
  Endpoint,
  handler,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
  Module,
  NaviosFactory,
  NotFoundException,
  provide,
  reply,
  RequestValue,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '../index.mjs'
import { createTestClient, defineInMemoryEnvironment } from '../testing/index.mjs'

import type {
  Guard,
  HandlerParams,
  Interceptor,
  NaviosApplication,
  NaviosApplicationOptions,
  RequestContext,
  RouteResult,
} from '../index.mjs'

const api = builder()

const userSchema = z.object({ id: z.string(), name: z.string() })

const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: userSchema,
  errorSchema: { 404: z.object({ message: z.string() }) },
})

const createUser = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({ name: z.string().min(1) }),
  responses: { 201: userSchema },
})

const listUsers = api.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({ limit: z.coerce.number().default(10) }),
  responseSchema: z.array(userSchema),
})

const me = api.declareEndpoint({
  method: 'GET',
  url: '/me',
  responseSchema: z.object({ name: z.string() }),
})

const ping = api.declareEndpoint({
  method: 'GET',
  url: '/ping',
  responseSchema: z.object({ ok: z.boolean() }),
})

const apps: NaviosApplication<any>[] = []

async function createApp(
  module: new () => unknown,
  options: Partial<NaviosApplicationOptions<any>> = {},
) {
  const app = await NaviosFactory.create(module, {
    adapter: defineInMemoryEnvironment(),
    logger: false,
    ...options,
  })
  apps.push(app)
  return app
}

afterEach(async () => {
  while (apps.length > 0) {
    await apps.pop()!.close()
  }
})

@Injectable()
class UsersService {
  private readonly users = new Map([['1', { id: '1', name: 'Ann' }]])
  private next = 2

  find(id: string) {
    return this.users.get(id) ?? null
  }

  list(limit: number) {
    return [...this.users.values()].slice(0, limit)
  }

  create(name: string) {
    const user = { id: String(this.next++), name }
    this.users.set(user.id, user)
    return user
  }
}

describe('handlers', () => {
  it('serves field-form and method-form handlers identically', async () => {
    @Controller()
    class FieldController {
      private readonly users = inject(UsersService)

      getUser = handler(getUser, ({ urlParams }) => {
        return this.users.find(urlParams.id) ?? reply(404, { message: 'User not found' })
      })

      createUser = handler(createUser, async ({ data }) => reply(201, this.users.create(data.name)))
    }

    @Controller()
    class MethodController {
      private readonly users = inject(UsersService)

      @Endpoint(listUsers)
      async list({ params }: HandlerParams<typeof listUsers>) {
        return this.users.list(params.limit)
      }
    }

    @Module({ controllers: [FieldController, MethodController] })
    class AppModule {}

    const app = await createApp(AppModule)
    const call = createTestClient(app)

    const found = await call(getUser, { urlParams: { id: '1' } })
    expect(found.status).toBe(200)
    expect(found.body).toEqual({ id: '1', name: 'Ann' })

    const missing = await call(getUser, { urlParams: { id: '9' } })
    expect(missing.status).toBe(404)
    expect(missing.body).toEqual({ message: 'User not found' })

    const created = await call(createUser, { data: { name: 'Bob' } })
    expect(created.status).toBe(201)
    expect(created.body).toEqual({ id: '2', name: 'Bob' })

    const invalid = await call(createUser, { data: { name: '' } })
    expect(invalid.status).toBe(400)
    expect(invalid.headers['content-type']).toBe('application/problem+json')

    const listed = await call(listUsers, { params: { limit: 1 } })
    expect(listed.body).toEqual([{ id: '1', name: 'Ann' }])

    expect(
      app.routes().map((route) => `${route.method} ${route.path} ${route.handlerName}`),
    ).toEqual(['GET /users/$id getUser', 'POST /users createUser', 'GET /users list'])
  })

  it('answers 404 problem+json for an unknown route', async () => {
    @Module({})
    class AppModule {}

    const app = await createApp(AppModule)
    const response = await app.inject({ method: 'GET', url: '/nope' })
    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ title: 'Not Found', status: 404 })
  })

  it('fails init when two handlers serve the same method and path', async () => {
    @Controller()
    class First {
      ping = handler(ping, () => ({ ok: true }))
    }

    @Controller()
    class Second {
      alsoPing = handler(ping, () => ({ ok: false }))
    }

    @Module({ controllers: [First, Second] })
    class AppModule {}

    const app = await createApp(AppModule)
    await expect(app.init()).rejects.toThrow(
      'GET /ping is served by both First.ping and Second.alsoPing',
    )
  })

  it('fails init with the original error when a controller constructor throws', async () => {
    @Controller()
    class Broken {
      constructor() {
        throw new Error('bad config')
      }
      ping = handler(ping, () => ({ ok: true }))
    }

    @Module({ controllers: [Broken] })
    class AppModule {}

    const app = await createApp(AppModule)
    await expect(app.init()).rejects.toThrow('bad config')
  })

  it('keeps failing after a failed init instead of serving no routes', async () => {
    @Controller()
    class Broken {
      constructor() {
        throw new Error('bad config')
      }
      ping = handler(ping, () => ({ ok: true }))
    }

    @Module({ controllers: [Broken] })
    class AppModule {}

    const app = await createApp(AppModule)
    await expect(app.init()).rejects.toThrow('bad config')
    await expect(app.init()).rejects.toThrow('bad config')
    await expect(app.inject({ method: 'GET', url: '/ping' })).rejects.toThrow('bad config')
  })

  it('initialises once when the first calls are concurrent', async () => {
    let setups = 0
    const counting = definePlugin({
      name: 'counting',
      async setup() {
        await Promise.resolve()
        setups++
      },
    })

    @Controller()
    class Ctl {
      ping = handler(ping, () => ({ ok: true }))
    }

    @Module({ controllers: [Ctl] })
    class AppModule {}

    const app = await createApp(AppModule, { plugins: [counting(undefined)] })
    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/ping' }),
      app.inject({ method: 'GET', url: '/ping' }),
      app.init().then(() => app.inject({ method: 'GET', url: '/ping' })),
    ])
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200])
    expect(setups).toBe(1)
  })

  it('fails init when a controller injects a request-scoped service', async () => {
    @Injectable({ scope: InjectableScope.Request })
    class PerRequest {}

    @Controller()
    class Wrong {
      dep = inject(PerRequest)
      ping = handler(ping, () => ({ ok: true }))
    }

    @Module({ controllers: [Wrong] })
    class AppModule {}

    const app = await createApp(AppModule)
    await expect(app.init()).rejects.toThrow(/Wrong -> PerRequest/)
  })
})

describe('guards, attributes and request state', () => {
  const Public = AttributeFactory.createAttribute(Symbol.for('test.Public'))
  const Roles = AttributeFactory.createAttribute(Symbol.for('test.Roles'), z.array(z.string()))
  const CurrentUser = createContextKey<{ name: string; roles: string[] }>('CurrentUser')

  @RequestValue()
  class Session {
    resolve(ctx: RequestContext) {
      const token = ctx.headers.get('authorization')
      return token ? { name: token, roles: token === 'admin' ? ['admin'] : [] } : null
    }
  }

  @Injectable()
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

  @Injectable()
  class RolesGuard implements Guard {
    canActivate(ctx: RequestContext) {
      const required = AttributeFactory.get(Roles, ctx.route)
      if (!required) {
        return true
      }
      const user = ctx.get(CurrentUser)
      return required.every((role) => user.roles.includes(role))
    }
  }

  const adminOnly = api.declareEndpoint({
    method: 'GET',
    url: '/admin',
    responseSchema: z.object({ name: z.string() }),
  })

  @Controller()
  class AccountController {
    me = handler(me, (_params, ctx) => ({ name: ctx.get(CurrentUser).name }))

    @Public()
    ping = handler(ping, () => ({ ok: true }))

    admin = handler(
      adminOnly,
      { guards: [RolesGuard], attributes: [Roles(['admin'])] },
      (_params, ctx) => ({ name: ctx.get(CurrentUser).name }),
    )
  }

  @Module({ controllers: [AccountController], guards: [AuthGuard] })
  class AppModule {}

  it('passes a typed value from a guard to a handler and honours attributes', async () => {
    const app = await createApp(AppModule)
    const call = createTestClient(app)

    expect((await call(ping)).status).toBe(200)

    const anonymous = await call(me)
    expect(anonymous.status).toBe(401)
    expect(anonymous.body).toMatchObject({ detail: 'Missing authorization header' })

    const user = await call(me, { headers: { authorization: 'ann' } })
    expect(user.body).toEqual({ name: 'ann' })

    expect((await call(adminOnly, { headers: { authorization: 'ann' } })).status).toBe(403)
    expect((await call(adminOnly, { headers: { authorization: 'admin' } })).body).toEqual({
      name: 'admin',
    })

    const route = app.routes().find((entry) => entry.handlerName === 'admin')!
    expect(route.guards).toEqual([AuthGuard, RolesGuard])
    expect(AttributeFactory.get(Roles, route)).toEqual(['admin'])
  })

  it('applies @UseGuards and @UseInterceptors at every level in order', async () => {
    const order: string[] = []
    const guard = (name: string) => {
      @Injectable()
      class Named implements Guard {
        canActivate() {
          order.push(name)
          return true
        }
      }
      Object.defineProperty(Named, 'name', { value: name })
      return Named
    }
    const ModuleGuard = guard('module')
    const ControllerGuard = guard('controller')
    const HandlerGuard = guard('handler-guard')

    @Injectable()
    class Timing implements Interceptor {
      async intercept(ctx: RequestContext, next: () => Promise<RouteResult>) {
        order.push('interceptor:in')
        const result = await next()
        ctx.reply.header('x-timed', 'yes')
        order.push('interceptor:out')
        return result
      }
    }

    @UseGuards(ControllerGuard)
    @UseInterceptors(Timing)
    @Controller()
    class Ctl {
      @UseGuards(HandlerGuard)
      @Endpoint(ping)
      async ping() {
        order.push('handler')
        return { ok: true }
      }
    }

    @Module({ controllers: [Ctl], guards: [ModuleGuard] })
    class Root {}

    const app = await createApp(Root)
    const response = await createTestClient(app)(ping)
    expect(order).toEqual([
      'interceptor:in',
      'module',
      'controller',
      'handler-guard',
      'handler',
      'interceptor:out',
    ])
    expect(response.headers['x-timed']).toBe('yes')
  })

  it('creates a DI scope only for handlers that use a request-scoped service', async () => {
    let created = 0
    let destroyed = 0

    @Injectable({ scope: InjectableScope.Request })
    class UnitOfWork {
      constructor() {
        created++
      }
      onServiceDestroy() {
        destroyed++
      }
    }

    const scoped = api.declareEndpoint({
      method: 'GET',
      url: '/scoped',
      responseSchema: z.object({ same: z.boolean() }),
    })

    @Controller()
    class Ctl {
      ping = handler(ping, () => ({ ok: true }))
      scoped = handler(scoped, (_params, ctx) => ({
        same: ctx.use(UnitOfWork) === ctx.use(UnitOfWork),
      }))
    }

    @Module({ controllers: [Ctl] })
    class Root {}

    const app = await createApp(Root, { requestScopedServices: 'allow' })
    const call = createTestClient(app)
    await call(ping)
    expect(created).toBe(0)
    expect((await call(scoped)).body).toEqual({ same: true })
    expect(created).toBe(1)
    expect(destroyed).toBe(1)

    const strict = await createApp(Root, { requestScopedServices: 'forbid' })
    expect((await createTestClient(strict)(scoped)).status).toBe(500)
  })

  it('exposes the current context through currentContext() when asyncContext is on', async () => {
    @Injectable()
    class Deep {
      path() {
        return currentContext()?.path ?? 'none'
      }
    }

    const where = api.declareEndpoint({
      method: 'GET',
      url: '/where',
      responseSchema: z.object({ path: z.string() }),
    })

    @Controller()
    class Ctl {
      private readonly deep = inject(Deep)
      where = handler(where, async () => {
        await Promise.resolve()
        return { path: this.deep.path() }
      })
    }

    @Module({ controllers: [Ctl] })
    class Root {}

    const app = await createApp(Root, { asyncContext: true })
    expect((await createTestClient(app)(where)).body).toEqual({ path: '/where' })
  })
})

describe('modules', () => {
  it('composes prefixes and takes the union of guards over every import path', async () => {
    const seen: string[] = []
    const guard = (name: string) => {
      @Injectable()
      class Named implements Guard {
        canActivate() {
          seen.push(name)
          return true
        }
      }
      return Named
    }
    const G1 = guard('g1')
    const G2 = guard('g2')

    const deep = api.declareEndpoint({
      method: 'GET',
      url: '/deep',
      responseSchema: z.object({ ok: z.boolean() }),
    })

    @Controller()
    class DeepController {
      deep = handler(deep, () => ({ ok: true }))
    }

    @Module({ controllers: [DeepController], prefix: 't' })
    class T {}

    @Module({ imports: [T] })
    class Shared {}

    @Module({ imports: [Shared], guards: [G1] })
    class A {}

    @Module({ imports: [Shared], guards: [G2] })
    class B {}

    @Module({ imports: [A, B], prefix: '/api' })
    class Root {}

    const app = await createApp(Root, { globalPrefix: 'v1' })
    const response = await app.inject({ method: 'GET', url: '/v1/api/t/deep' })
    expect(response.status).toBe(200)
    expect(seen).toEqual(['g1', 'g2'])

    // A second application importing T directly is not affected.
    seen.length = 0
    const other = await createApp(T)
    expect((await other.inject({ method: 'GET', url: '/t/deep' })).status).toBe(200)
    expect(seen).toEqual([])
  })

  it('applies module providers application-wide and runs onModuleInit after imports', async () => {
    const order: string[] = []
    const Greeting = InjectionToken.create<string>('Greeting')

    const greet = api.declareEndpoint({
      method: 'GET',
      url: '/greet',
      responseSchema: z.object({ text: z.string() }),
    })

    @Controller()
    class Ctl {
      private readonly greeting = inject(Greeting)
      greet = handler(greet, () => ({ text: this.greeting }))
    }

    @Module({ controllers: [Ctl] })
    class Child {
      onModuleInit() {
        order.push('child')
      }
    }

    @Module({ imports: [Child], providers: [provide(Greeting, { value: 'hello' })] })
    class Root {
      async onModuleInit() {
        order.push('root')
      }
    }

    const app = await createApp(Root)
    expect((await createTestClient(app)(greet)).body).toEqual({ text: 'hello' })
    expect(order).toEqual(['child', 'root'])
  })
})

describe('request values with asynchronous dependencies', () => {
  @Injectable()
  class SessionStore {
    ready = false
    async onServiceInit() {
      await new Promise((resolve) => setTimeout(resolve, 1))
      this.ready = true
    }
  }

  it('serves the first request when a module lists the request value', async () => {
    @RequestValue()
    class CurrentName {
      private readonly store = inject(SessionStore)
      resolve() {
        return this.store.ready ? 'ann' : 'not ready'
      }
    }

    @Controller()
    class Ctl {
      me = handler(me, (_params, ctx) => ({ name: ctx.get(CurrentName) }))
    }

    @Module({ controllers: [Ctl], requestValues: [CurrentName] })
    class AppModule {}

    const app = await createApp(AppModule)
    const response = await createTestClient(app)(me)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ name: 'ann' })
  })

  it('serves the first request when an unlisted request value has an async resolve', async () => {
    let runs = 0
    let disposed = 0

    @RequestValue()
    class CurrentName {
      private readonly store = inject(SessionStore)
      async resolve() {
        runs++
        return this.store.ready ? 'ann' : 'not ready'
      }
      dispose() {
        disposed++
      }
    }

    @Controller()
    class Ctl {
      me = handler(me, async (_params, ctx) => {
        const [first, second] = await Promise.all([ctx.get(CurrentName), ctx.get(CurrentName)])
        return { name: first === second ? first : 'different' }
      })
    }

    @Module({ controllers: [Ctl] })
    class AppModule {}

    const app = await createApp(AppModule)
    const response = await createTestClient(app)(me)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ name: 'ann' })
    expect(runs).toBe(1)
    expect(disposed).toBe(1)
  })

  it('names the fix when an unlisted synchronous request value is not ready', async () => {
    const errors: unknown[] = []

    @RequestValue()
    class CurrentName {
      private readonly store = inject(SessionStore)
      resolve() {
        return String(this.store.ready)
      }
    }

    @Controller()
    class Ctl {
      me = handler(me, (_params, ctx) => ({ name: ctx.get(CurrentName) }))
    }

    @Module({ controllers: [Ctl] })
    class AppModule {}

    const logger = {
      log() {},
      warn() {},
      debug() {},
      error: (...args: unknown[]) => errors.push(...args),
    }
    const app = await createApp(AppModule, { logger: logger as never })
    expect((await createTestClient(app)(me)).status).toBe(500)
    expect(errors.map(String).join(' ')).toContain('requestValues: [CurrentName]')
  })

  it('fails init when a listed request value reaches a request-scoped service', async () => {
    @Injectable({ scope: InjectableScope.Request })
    class PerRequest {}

    @RequestValue()
    class Wrong {
      dep = inject(PerRequest)
      resolve() {
        return 1
      }
    }

    @Module({ requestValues: [Wrong] })
    class AppModule {}

    const app = await createApp(AppModule)
    await expect(app.init()).rejects.toThrow(/Wrong -> PerRequest/)
  })

  it('fails init when a module lists a class that is not a request value', async () => {
    @Injectable()
    class Plain {}

    @Module({ requestValues: [Plain as never] })
    class AppModule {}

    const app = await createApp(AppModule)
    await expect(app.init()).rejects.toThrow('Plain is not a request value')
  })
})

describe('module prefixes with url params', () => {
  it('passes prefix params to the handler and to guards', async () => {
    const members = api.declareEndpoint({
      method: 'GET',
      url: '/members',
      responseSchema: z.object({ handler: z.any(), guard: z.any() }),
    })
    let seen: unknown

    @Injectable()
    class OrgGuard implements Guard {
      canActivate(ctx: RequestContext) {
        seen = ctx.urlParams.orgId
        return true
      }
    }

    @Controller()
    class Ctl {
      members = handler(members, (params, ctx) => ({
        handler: (params as { urlParams?: unknown }).urlParams,
        guard: ctx.urlParams,
      }))
    }

    @Module({ prefix: '/orgs/$orgId', controllers: [Ctl], guards: [OrgGuard] })
    class AppModule {}

    const app = await createApp(AppModule)
    const response = await app.inject({ method: 'GET', url: '/orgs/7/members' })
    expect(response.body).toEqual({ handler: { orgId: '7' }, guard: { orgId: '7' } })
    expect(seen).toBe('7')
  })
})

describe('in-memory adapter', () => {
  it('sends a JSON null as a body', async () => {
    const nullable = api.declareEndpoint({
      method: 'GET',
      url: '/nullable',
      responseSchema: userSchema.nullable(),
    })

    @Controller()
    class Ctl {
      nullable = handler(nullable, () => null)
    }

    @Module({ controllers: [Ctl] })
    class AppModule {}

    const app = await createApp(AppModule)
    const response = await app.inject({ method: 'GET', url: '/nullable' })
    expect(response.text).toBe('null')
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.body).toBeNull()
  })

  it('answers 500 when a body cannot be serialised', async () => {
    const unserialisable = api.declareEndpoint({
      method: 'GET',
      url: '/unserialisable',
      responseSchema: z.any(),
    })

    @Controller()
    class Ctl {
      unserialisable = handler(unserialisable, () => ({ count: 1n }))
    }

    @Module({ controllers: [Ctl] })
    class AppModule {}

    const app = await createApp(AppModule)
    const response = await app.inject({ method: 'GET', url: '/unserialisable' })
    expect(response.status).toBe(500)
    expect(response.headers['content-type']).toContain('application/problem+json')
  })
})

describe('lifecycle, errors and plugins', () => {
  it('runs bootstrap and shutdown hooks and destroys services on close()', async () => {
    const order: string[] = []

    @Injectable()
    class Database {
      onApplicationBootstrap() {
        order.push('bootstrap')
      }
      onApplicationShutdown() {
        order.push('shutdown')
      }
      onServiceDestroy() {
        order.push('destroy')
      }
    }

    @Controller()
    class Ctl {
      db = inject(Database)
      ping = handler(ping, () => ({ ok: true }))
    }

    @Module({ controllers: [Ctl] })
    class Root {}

    const app = await createApp(Root)
    await app.init()
    expect(order).toEqual(['bootstrap'])
    await app.close()
    expect(order).toEqual(['bootstrap', 'shutdown', 'destroy'])
    await expect(app.inject({ method: 'GET', url: '/ping' })).rejects.toThrow(/closed/)
  })

  it('maps domain errors with app.mapError', async () => {
    class UserMissing extends Error {}

    @Controller()
    class Ctl {
      getUser = handler(getUser, () => {
        throw new UserMissing('no such user')
      })
    }

    @Module({ controllers: [Ctl] })
    class Root {}

    const app = await createApp(Root)
    app.mapError(UserMissing, (error) => reply(404, { message: error.message }))
    const response = await createTestClient(app)(getUser, { urlParams: { id: '1' } })
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'no such user' })
  })

  it('hides unexpected error text and sends HttpException as a problem', async () => {
    const boom = api.declareEndpoint({
      method: 'GET',
      url: '/boom',
      responseSchema: z.object({ ok: z.boolean() }),
    })

    @Controller()
    class Ctl {
      boom = handler(boom, () => {
        throw new Error('db password is hunter2')
      })
      ping = handler(ping, () => {
        throw new NotFoundException('nothing here')
      })
    }

    @Module({ controllers: [Ctl] })
    class Root {}

    const app = await createApp(Root)
    const call = createTestClient(app)
    const unexpected = await call(boom)
    expect(unexpected.status).toBe(500)
    expect(unexpected.text).not.toContain('hunter2')
    const notFound = await call(ping)
    expect(notFound.status).toBe(404)
    expect(notFound.body).toMatchObject({ title: 'Not Found', detail: 'nothing here' })
  })

  it('sets plugins up in dependency order and lets them contribute routes', async () => {
    const order: string[] = []

    @Controller()
    class Extra {
      ping = handler(ping, () => ({ ok: true }))
    }

    @Module({ controllers: [Extra] })
    class ExtraModule {}

    const first = definePlugin({
      name: 'first',
      setup(pluginApi) {
        order.push('first')
        pluginApi.addModule(ExtraModule)
        pluginApi.onBootstrap((routes) => {
          order.push(`bootstrap:${routes.length}`)
        })
        pluginApi.onShutdown(() => {
          order.push('shutdown')
        })
      },
    })
    const second = definePlugin({
      name: 'second',
      dependsOn: ['first'],
      setup(_api, options: { label: string }) {
        order.push(options.label)
      },
    })

    @Module({})
    class Root {}

    const app = await createApp(Root)
    app.usePlugin(second({ label: 'second' })).usePlugin(first())
    expect((await createTestClient(app)(ping)).status).toBe(200)
    expect(order).toEqual(['first', 'second', 'bootstrap:1'])
    expect(() => app.usePlugin(first())).toThrow(/before init/)
    await app.close()
    expect(order.at(-1)).toBe('shutdown')
  })
})

describe('response encoders', () => {
  it('encodes a custom result inside the pipeline, with the request context', async () => {
    const { result } = await import('../index.mjs')
    const csv = api.declareEndpoint({ method: 'GET', url: '/csv', response: 'text' })
    const broken = api.declareEndpoint({ method: 'GET', url: '/broken', response: 'text' })

    @Controller()
    class Ctl {
      csv = handler(csv, () =>
        result('csv', [
          ['a', 'b'],
          ['1', '2'],
        ]),
      )
      broken = handler(broken, () => result('csv', null))
    }

    @Module({ controllers: [Ctl] })
    class Root {}

    const csvPlugin = definePlugin({
      name: 'csv',
      setup(pluginApi) {
        pluginApi.encoder('csv', (value, ctx) => {
          if (value.body === null) {
            throw new NotFoundException('nothing to export')
          }
          const separator = ctx.headers.get('x-separator') ?? ','
          return {
            ...value,
            kind: 'text',
            headers: { ...value.headers, 'content-type': 'text/csv' },
            body: (value.body as string[][]).map((row) => row.join(separator)).join('\n'),
          }
        })
      },
    })

    const app = await createApp(Root)
    app.usePlugin(csvPlugin())
    const call = createTestClient(app)

    const response = await call(csv, { headers: { 'x-separator': ';' } })
    expect(response.headers['content-type']).toBe('text/csv')
    expect(response.text).toBe('a;b\n1;2')

    const failed = await call(broken)
    expect(failed.status).toBe(404)
    expect(failed.body).toMatchObject({ detail: 'nothing to export' })
  })
})
