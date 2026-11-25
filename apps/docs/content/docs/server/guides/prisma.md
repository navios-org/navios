---
title: Prisma
---

# Prisma

Navios has no Prisma package and needs none. A `PrismaClient` is one long-lived object with a connect step and a disconnect step, which is exactly what a singleton service with lifecycle hooks is. This page assumes a working Prisma setup with a `User` model that has `id`, `name` and a unique `email`.

## The client as a service

Extend the generated client and connect it to the service lifecycle:

```ts title="prisma.service.mts"
import { Injectable } from '@navios/server'

import type { OnServiceDestroy, OnServiceInit } from '@navios/server'

// The path your Prisma generator writes to
import { PrismaClient } from './generated/prisma/client.mjs'

@Injectable()
export class PrismaService extends PrismaClient implements OnServiceInit, OnServiceDestroy {
  async onServiceInit() {
    await this.$connect()
  }

  async onServiceDestroy() {
    await this.$disconnect()
  }
}
```

- `onServiceInit` runs once, when the service is first resolved. Everything that injects `PrismaService` is built during `app.init()`, so a database that cannot be reached fails start-up instead of the first request.
- `onServiceDestroy` runs during `app.close()`, after in-flight requests have finished.
- When your Prisma version needs constructor options, such as a driver adapter, add a constructor that calls `super({ ... })`. It must take no parameters of its own; read configuration with `inject()` or from the environment.

The hooks are described in [Lifecycle](/docs/di/essentials/lifecycle).

## Using it in a service

`PrismaService` is injected like any other service. This is the Quick start's `UsersService` backed by the database:

```ts title="users.service.mts"
import { ConflictException, inject, Injectable } from '@navios/server'

import type { Prisma } from './generated/prisma/client.mjs'

import { PrismaService } from './prisma.service.mjs'

@Injectable()
export class UsersService {
  private readonly prisma = inject(PrismaService)

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } })
  }

  async create(input: { name: string; email: string }, db: Prisma.TransactionClient = this.prisma) {
    if (await db.user.findUnique({ where: { email: input.email } })) {
      throw new ConflictException('Email is already registered')
    }
    return db.user.create({ data: input })
  }
}
```

The methods are now asynchronous, so the controller awaits them: `(await this.users.findById(urlParams.userId)) ?? reply(404, ...)`. The optional `db` parameter is used by the transaction section below.

Response validation strips fields the declaration's schema does not list, so a column added to the model later, such as a password hash, does not leak through `getUser`.

## Replacing it in tests

Give the application another provider for `PrismaService`. It wins over the class itself, and the real client is never constructed or connected.

```ts
import { NaviosFactory, provide } from '@navios/server'
import { createTestClient, defineInMemoryEnvironment } from '@navios/server/testing'

class FakePrisma {
  user = {
    findUnique: async () => ({ id: '1', name: 'Ada', email: 'ada@example.com' }),
  }
}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineInMemoryEnvironment(),
  logger: false,
  providers: [provide(PrismaService, { value: new FakePrisma() as unknown as PrismaService })],
})

const response = await createTestClient(app)(getUser, { urlParams: { userId: '1' } })
expect(response.body).toEqual({ id: '1', name: 'Ada', email: 'ada@example.com' })
```

A fake only needs the model methods the code under test calls. `provide()` wants every public member of what it replaces, hence the cast.

For tests that should run real queries, keep `PrismaService` and point it at a test database through its usual configuration. See [Testing](/docs/server/essentials/testing) for the rest of the setup.

## A transaction per request

Prisma's interactive transaction is a callback: `$transaction(fn)` commits when `fn` resolves and rolls back when it rejects. An [interceptor](/docs/server/essentials/guards-and-interceptors) has the same shape around a request, so one can wrap the other. The transaction client goes into a [context key](/docs/server/guides/request-state#context-keys) for the handler to pick up.

```ts title="transaction.interceptor.mts"
import { createContextKey, inject, Injectable } from '@navios/server'

import type { Interceptor, RequestContext, RouteResult } from '@navios/server'

import type { Prisma } from './generated/prisma/client.mjs'

import { PrismaService } from './prisma.service.mjs'

export const Tx = createContextKey<Prisma.TransactionClient>('Tx')

@Injectable()
export class TransactionInterceptor implements Interceptor {
  private readonly prisma = inject(PrismaService)

  intercept(ctx: RequestContext, next: () => Promise<RouteResult>) {
    return this.prisma.$transaction((tx) => {
      ctx.set(Tx, tx)
      return next()
    })
  }
}
```

Attach it to the handlers that write, and pass the client on:

```ts
@UseInterceptors(TransactionInterceptor)
@Endpoint(createUser)
async createUser({ data }: HandlerParams<typeof createUser>, ctx: RequestContext) {
  return reply(201, await this.users.create(data, ctx.get(Tx)))
}
```

What decides the outcome:

| The request ends with                                            | Transaction  |
| ---------------------------------------------------------------- | ------------ |
| A value or `reply()` returned by the handler, whatever its status | Committed    |
| Anything thrown by a guard, validation or the handler            | Rolled back  |
| A response body that fails its schema                            | Rolled back  |

An error rolls back because `next()` rejects with it, and it is turned into a response only after the interceptor has exited. A handler that returns `reply(404, ...)` or `reply(409, ...)` commits; throw an `HttpException` when an error status must also undo the work.

The transaction is committed before the response is written, so a client that receives a success can rely on it.

:::warning
A transaction holds a database connection for as long as it is open, and Prisma closes one that stays open past its `timeout`. Keep the interceptor off routes that only read, and off routes that stream their response or wait on slow external services.
:::

Services are singletons, so they cannot inject the transaction; it has to reach them as an argument, as `create(input, db)` does. Code several calls deep that cannot take the argument can read `Tx` from [`currentContext()`](/docs/server/essentials/request-context), at the cost of enabling `asyncContext` for the application.
