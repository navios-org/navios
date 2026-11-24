# @navios/core

`@navios/core` is an HTTP server framework for TypeScript. Endpoints are declared once with `@navios/builder`; the server validates requests and responses against the declaration, and a client can call the same declaration with the same types.

- Handlers are typed from the endpoint declaration. Parameters, return values and status codes are checked at compile time.
- Schemas can come from any [Standard Schema](https://standardschema.dev) library. The examples use Zod.
- The HTTP server is provided by an adapter: [`@navios/adapter-fastify`](../adapter-fastify/README.md) for Node.js or [`@navios/adapter-bun`](../adapter-bun/README.md) for Bun. Application code is the same on both.
- Controllers, guards and interceptors are singletons. Per-request data is carried by a typed request context.
- Error responses are `application/problem+json`.

This README describes version 2.0. To upgrade from 1.x, read the [migration guide](./docs/migration.md).

## Install

```bash
yarn add @navios/core @navios/builder zod

# and one adapter
yarn add @navios/adapter-fastify fastify
# or
yarn add @navios/adapter-bun
```

Navios uses standard decorators. Projects that compile with `experimentalDecorators` use the [legacy decorators](./docs/legacy-decorators.md) entry point.

## Example

```ts
// api.mts
import { builder } from '@navios/builder'
import { z } from 'zod'

const api = builder()

const userSchema = z.object({ id: z.string(), name: z.string() })

export const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: userSchema,
  errorSchema: { 404: z.object({ message: z.string() }) },
})

export const createUser = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({ name: z.string().min(1) }),
  responses: { 201: userSchema },
})

export const me = api.declareEndpoint({
  method: 'GET',
  url: '/me',
  responseSchema: z.object({ name: z.string() }),
})
```

```ts
// auth.mts
import { createContextKey, Injectable, UnauthorizedException } from '@navios/core'

import type { Guard, RequestContext } from '@navios/core'

// A typed per-request slot: the guard sets it, handlers read it.
export const CurrentUser = createContextKey<{ name: string }>('CurrentUser')

@Injectable()
export class AuthGuard implements Guard {
  canActivate(ctx: RequestContext) {
    const header = ctx.headers.get('authorization')
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token')
    }
    ctx.set(CurrentUser, { name: header.slice(7) })
    return true
  }
}
```

```ts
// users.mts
import { Controller, Endpoint, inject, Injectable, Module, reply } from '@navios/core'

import type { HandlerParams, RequestContext } from '@navios/core'

import { createUser, getUser, me } from './api.mjs'
import { AuthGuard, CurrentUser } from './auth.mjs'

@Injectable()
export class UsersService {
  private readonly users = new Map([['1', { id: '1', name: 'Ann' }]])
  private next = 2

  find(id: string) {
    return this.users.get(id) ?? null
  }

  create(name: string) {
    const user = { id: String(this.next++), name }
    this.users.set(user.id, user)
    return user
  }
}

@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>) {
    return this.users.find(urlParams.id) ?? reply(404, { message: 'User not found' })
  }

  @Endpoint(createUser)
  async createUser({ data }: HandlerParams<typeof createUser>) {
    return reply(201, this.users.create(data.name))
  }

  @Endpoint(me)
  async me(_params: HandlerParams<typeof me>, ctx: RequestContext) {
    return { name: ctx.get(CurrentUser).name }
  }
}

@Module({ controllers: [UsersController], guards: [AuthGuard] })
export class AppModule {}
```

```ts
// main.mts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

import type { FastifyEnvironment } from '@navios/adapter-fastify'

import { AppModule } from './users.mjs'

// Optional: types ctx.raw and app.getServer() for the Fastify adapter.
declare module '@navios/core' {
  interface Register {
    environment: FastifyEnvironment
  }
}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})
app.enableShutdownHooks()

const url = await app.listen({ port: 3000 })
console.log(`Listening on ${url}`)
```

What this gives you:

- `GET /users/1` with a bearer token answers `200 {"id":"1","name":"Ann"}`; an unknown id answers `404 {"message":"User not found"}`, the body declared in `errorSchema`.
- A request without a token answers `401` as `application/problem+json`, before the body is read.
- `POST /users` with `{"name":""}` answers `400` as `application/problem+json`, with the failing field listed.
- Returning a user without `name`, or `reply(200, ...)` from `createUser`, does not compile.

## Documentation

- [Quick start](./docs/quick-start.md)
- [Controllers and handlers](./docs/controllers.md)
- [Request context](./docs/request-context.md)
- [Per-request state](./docs/request-state.md)
- [Guards and interceptors](./docs/guards-and-interceptors.md)
- [Attributes](./docs/attributes.md)
- [Modules](./docs/modules.md)
- [Errors](./docs/errors.md)
- [Application setup and lifecycle](./docs/application.md)
- [Plugins](./docs/plugins.md)
- [Testing](./docs/testing.md)
- [Config and logger](./docs/config-and-logger.md)
- [Writing an adapter](./docs/writing-an-adapter.md)
- [Legacy decorators](./docs/legacy-decorators.md)
- [Migrating from 1.x](./docs/migration.md)
- [Changelog](./CHANGELOG.md)

## Entry points

| Import                       | Contents                                          |
| ---------------------------- | ------------------------------------------------- |
| `@navios/core`               | The framework, plus everything from `@navios/di`. |
| `@navios/core/testing`       | `defineInMemoryEnvironment`, `createTestClient`.  |
| `@navios/core/conformance`   | `runAdapterConformance`, for adapter authors.     |
| `@navios/core/legacy-compat` | Decorators for `experimentalDecorators` projects. |

## License

MIT
