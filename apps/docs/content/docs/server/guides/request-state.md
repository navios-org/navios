---
title: Per-request state
---

# Per-request state

Controllers, guards, interceptors and services are singletons, so nothing that belongs to one request may live in their fields. Per-request data lives on the [request context](/docs/server/essentials/request-context) instead. There are three tools for it:

| Tool                   | What it is                                                | Use it for                                                    |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| Context key            | A typed slot that one piece of code sets and another reads | A value a guard or interceptor already has: the user, a start time |
| Request value          | A singleton that computes a slot the first time it is read | A value derived from the request that not every route needs: tenant, session, locale |
| Request-scoped service | A class the DI container builds once per request          | Per-request objects that need `inject()` and lifecycle hooks  |

Use the first that fits.

## Context keys

`createContextKey<T>(name)` creates a slot of type `T`.

```ts
import { createContextKey } from '@navios/core'

export interface AuthUser {
  id: string
  roles: string[]
}

export const CurrentUser = createContextKey<AuthUser>('CurrentUser')
```

A guard or an interceptor fills it, and anything later in the request reads it:

```ts
// in a guard
ctx.set(CurrentUser, { id: payload.sub, roles: payload.roles })

// in a handler
const user = ctx.get(CurrentUser) // AuthUser
```

| Call                  | Result                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------- |
| `ctx.set(key, value)` | Fills the slot                                                                          |
| `ctx.get(key)`        | The value. Throws when the key was not set, with a message naming the key and the route |
| `ctx.find(key)`       | The value, or `undefined` when the key was not set                                      |
| `ctx.has(key)`        | Whether the slot holds a value                                                          |

`ctx.get(CurrentUser)` is typed `AuthUser`, not `AuthUser | undefined`. That is right behind a guard that always sets it; on a route where the guard may not have run, use `ctx.find`.

The name is used in error messages only. Two keys created with the same name are different keys.

The guard that sets this key is built in [Authentication with JWT](/docs/server/guides/authentication#verify-in-a-guard).

## Request values

A request value is a class with a `resolve(ctx)` method, decorated with `@RequestValue()`. The class is a singleton and can `inject()` other singletons. `ctx.get(TheClass)` calls `resolve` on the first read and returns the stored result for the rest of the request.

```ts
import { BadRequestException, inject, RequestValue } from '@navios/core'

import type { RequestContext } from '@navios/core'

import { TenantsService } from './tenants.service.mjs'

@RequestValue()
export class CurrentTenant {
  private readonly tenants = inject(TenantsService)

  async resolve(ctx: RequestContext) {
    const slug = ctx.headers.get('x-tenant')
    const tenant = slug ? await this.tenants.findBySlug(slug) : null
    if (!tenant) {
      throw new BadRequestException('Unknown tenant')
    }
    return tenant
  }
}
```

A guard and a handler of the same request both ask for it, and the tenant is loaded once:

```ts
@Injectable()
export class ProGuard implements Guard {
  async canActivate(ctx: RequestContext) {
    const tenant = await ctx.get(CurrentTenant)
    return tenant.plan === 'pro'
  }
}

// in a controller
@Endpoint(getPlan)
async getPlan(_params: HandlerParams<typeof getPlan>, ctx: RequestContext) {
  const tenant = await ctx.get(CurrentTenant)
  return { plan: tenant.plan, tenantId: tenant.id }
}
```

A request that never asks for the tenant never loads it. That is the difference from a context key: a key is filled by whoever sets it, a request value is computed on demand.

- The type of `ctx.get(X)` is the return type of `resolve`. When `resolve` returns a promise, the promise itself is stored, so concurrent readers share one computation. A synchronous `resolve` stays synchronous.
- `ctx.find(X)` computes the value just as `ctx.get(X)` does. `ctx.has(X)` does not.
- `ctx.set(X, value)` fills the slot directly and `resolve` is not called for that request. `ctx.get(X)` then returns the plain value, so always `await` the result of an asynchronous request value.
- `resolve` may read other slots with `ctx.get(...)`.
- When `resolve` throws synchronously nothing is stored, and the next read calls it again. A returned promise that rejects is stored, and every reader in that request gets the same rejection.
- The class needs a constructor without parameters.

Two request values that `await` each other are not detected as a cycle; the request waits forever. A cycle between synchronous values is reported with its path.

### Listing values in a module

```ts
@Module({
  controllers: [PlanController],
  guards: [ProGuard],
  requestValues: [CurrentTenant],
})
export class PlanModule {}
```

A listed value is built while the application initialises. That makes a mistake in it, such as an injected request-scoped service, an error of `init()` instead of an error of the first request. It is required when the class, or a service behind it, has an asynchronous `onServiceInit` and `resolve` is not declared `async`.

An unlisted value still works in the common cases: when everything it injects is ready by the first read, or when `resolve` is `async`.

### Releasing a value

A request value may implement `dispose(value, ctx)`. It is called after the response has been sent, or after the client has gone away, for every value computed in that request, in reverse order of computation.

```ts
@RequestValue()
export class ReportCursor {
  private readonly reports = inject(ReportsService)

  resolve() {
    return this.reports.openCursor() // Promise<Cursor>
  }

  async dispose(cursor: Cursor) {
    await cursor.close()
  }
}
```

`dispose` receives the awaited value. It is not called for a value placed with `ctx.set`. An error it throws is swallowed so that the other hooks still run; log inside the hook if you need to know.

Without decorator syntax, register the class with `registerRequestValue(TheClass)`.

## Request-scoped services

A service with `scope: InjectableScope.Request` is constructed once per request by the DI container. It can inject other request-scoped services, and `inject(RequestContextToken)` gives it the `RequestContext`.

```ts
import { inject, Injectable, InjectableScope, RequestContextToken } from '@navios/core'

import { AuditStore } from './audit-store.service.mjs'

@Injectable({ scope: InjectableScope.Request })
export class AuditTrail {
  private readonly ctx = inject(RequestContextToken)
  private readonly store = inject(AuditStore)
  private readonly entries: { action: string; at: number }[] = []

  record(action: string) {
    this.entries.push({ action, at: Date.now() })
  }

  async onServiceDestroy() {
    if (this.entries.length > 0) {
      await this.store.save({ requestId: this.ctx.id, entries: this.entries })
    }
  }
}
```

A handler, guard or interceptor reaches it through the context:

```ts
@Endpoint(getPlan)
async getPlan(_params: HandlerParams<typeof getPlan>, ctx: RequestContext) {
  ctx.use(AuditTrail).record('plan.read')
  // ...
}
```

- `ctx.use(Token)` resolves synchronously. It throws when the service or one of its dependencies has an asynchronous `onServiceInit`; use `await ctx.resolve(Token)` for those.
- The first `ctx.use()` or `ctx.resolve()` of a request creates its DI scope. A request that calls neither has no scope and pays nothing for one.
- The scope is disposed after the response has been sent, which runs `onServiceDestroy`. After that point `ctx.use()` and `ctx.resolve()` throw.

:::warning
A request-scoped service cannot be injected into a singleton. Controllers, guards, interceptors and request values are singletons, so `inject(AuditTrail)` in any of them fails at `init()` with a scope mismatch error that names the path. Reach the service with `ctx.use()` instead.
:::

Scopes themselves are explained in [Scopes](/docs/di/essentials/scopes).

### The `requestScopedServices` option

Because a request value usually does the same job with less machinery, the application can report or refuse request-scoped services:

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  requestScopedServices: 'allow',
})
```

| Value      | Effect                                                                                  |
| ---------- | --------------------------------------------------------------------------------------- |
| `'warn'`   | Logs one warning per token. The default when `NODE_ENV` is not `production`             |
| `'allow'`  | Nothing. The default in production                                                      |
| `'forbid'` | `ctx.use()` and `ctx.resolve()` throw, which the client sees as a 500                   |

The option is checked when a token is first requested, not at `init()`.

## Choosing

- Something already computed by a guard or interceptor: a **context key**.
- Something derived from the request, possibly asynchronous, wanted by some routes only: a **request value**. Add `dispose` when it holds a resource.
- A third-party class that must be constructed per request, or several per-request classes that inject each other and need `onServiceInit` and `onServiceDestroy`: a **request-scoped service**.

Code that cannot be handed the context at all, such as a logger several calls deep, can read it with [`currentContext()`](/docs/server/essentials/request-context).
