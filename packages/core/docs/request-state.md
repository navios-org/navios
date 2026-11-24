# Per-request state

Most per-request data is a value derived from the request and computed at most once: the session, the current user, the tenant, a locale, a transaction. Navios has three tools for it. Use the first that fits.

1. A **context key**: a typed slot that something sets and something else reads.
2. A **request value**: a singleton that computes a slot on first read.
3. A **request-scoped service**, reached with `ctx.use()`: a class constructed per request by the DI container. This is the last resort.

## Context keys

```ts
import { createContextKey } from '@navios/core'

export interface User {
  id: string
  roles: string[]
}

export const CurrentUser = createContextKey<User>('CurrentUser')
```

A guard sets the key and a handler reads it:

```ts
@Injectable()
export class AuthGuard implements Guard {
  private readonly auth = inject(AuthService)

  async canActivate(ctx: RequestContext) {
    const user = await this.auth.verify(ctx.headers.get('authorization'))
    if (!user) {
      throw new UnauthorizedException('Missing or invalid token')
    }
    ctx.set(CurrentUser, user)
    return true
  }
}

me = handler(me, (_params, ctx) => ({ id: ctx.get(CurrentUser).id }))
```

| Call                  | Result                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `ctx.set(key, value)` | Fills the slot.                                                                          |
| `ctx.get(key)`        | The value. Throws when the key was not set, with a message naming the key and the route. |
| `ctx.find(key)`       | The value, or `undefined` when the key was not set.                                      |
| `ctx.has(key)`        | Whether the slot holds a value.                                                          |

`ctx.get(CurrentUser)` is typed `User`, not `User | undefined`. That is correct behind a guard that always sets it. On a route where the guard may not have run, use `ctx.find`.

The name passed to `createContextKey` is used in error messages only. Two keys with the same name are different keys.

## Request values

A request value is a class with a `resolve(ctx)` method. It is a singleton, so it can `inject()` other singletons. `ctx.get(TheClass)` calls `resolve` the first time and remembers the result for the rest of the request.

```ts
import { inject, RequestValue } from '@navios/core'

import type { RequestContext } from '@navios/core'

@RequestValue()
export class CurrentSession {
  private readonly auth = inject(AuthService)

  resolve(ctx: RequestContext) {
    return this.auth.getSession(ctx.headers.toWebHeaders()) // Promise<Session | null>
  }
}
```

```ts
// A guard that needs the session
const session = await ctx.get(CurrentSession)

// A public handler that uses the session when there is one
const session = await ctx.get(CurrentSession)
```

A request that never asks for the session never loads it. This is the difference from a context key: a key is filled eagerly by whoever sets it, a request value is computed on demand.

Rules:

- The type of `ctx.get(X)` is the return type of `resolve`. When `resolve` returns a promise, the promise is what is stored and returned, so concurrent readers share one computation, and a synchronous `resolve` stays synchronous.
- `ctx.set(X, value)` fills the slot directly, and `resolve` is then not called for that request. After `ctx.set`, `ctx.get(X)` returns the plain value even when `resolve` is asynchronous, so always `await` the result of an asynchronous request value.
- `ctx.find(X)` computes a request value exactly as `ctx.get(X)` does. `ctx.has(X)` does not compute it.
- A request value may read other slots with `ctx.get(...)`.
- When `resolve` throws synchronously nothing is stored, and the next read calls it again. When it returns a promise that rejects, the rejected promise is stored and every reader in that request gets the same rejection.
- The class needs a constructor without parameters. Its instance is fetched synchronously on first read, so neither it nor its dependencies may have an asynchronous `onServiceInit` that is still pending at that point.

### Releasing a value

A request value may implement `dispose(value, ctx)`. Core calls it after the response has been sent, or after the connection has gone away, for every value that was computed in that request, in reverse order of computation.

```ts
@RequestValue()
export class Transaction {
  private readonly db = inject(Database)

  resolve() {
    return this.db.begin() // Promise<Tx>
  }

  async dispose(tx: Tx) {
    await tx.release()
  }
}
```

`dispose` receives the awaited value. It is not called for a value placed with `ctx.set`. An error thrown by `dispose` is swallowed so that the other hooks still run; log inside the hook if you need to know about it.

### Limitations

- A cycle between request values is detected, and reported with its path (`Circular request values: A -> B -> A`), only when the values read each other synchronously inside `resolve`. Two asynchronous values that each `await` the other before returning are not detected; the request waits forever.
- `@RequestValue` classes are found by being used. There is no list of them to validate at `init()`.

Without decorator syntax, register a class with `registerRequestValue(TheClass)`.

## Request-scoped services

A request-scoped service is a class the container constructs once per request:

```ts
import { inject, Injectable, InjectableScope, RequestContextToken } from '@navios/core'

@Injectable({ scope: InjectableScope.Request })
export class UnitOfWork {
  private readonly ctx = inject(RequestContextToken)
  private readonly changes: Change[] = []

  track(change: Change) {
    this.changes.push(change)
  }

  onServiceDestroy() {
    // runs after the response has been sent
  }
}
```

It is reached from a handler, guard or interceptor through the context:

```ts
save = handler(saveOrder, async ({ data }, ctx) => {
  const uow = ctx.use(UnitOfWork)
  uow.track({ kind: 'order', data })
  return { ok: true }
})
```

- `ctx.use(Token)` resolves synchronously. It throws when the service or one of its dependencies has an asynchronous `onServiceInit`; use `await ctx.resolve(Token)` for those.
- The first `ctx.use()` or `ctx.resolve()` of a request creates the DI scope. A request that never calls them has no scope. The scope is disposed after the response, which runs `onServiceDestroy`.
- Inside a request-scoped service, `inject(RequestContextToken)` gives the `RequestContext`.

### Why this is the last resort

- **It cannot be injected into a singleton.** Controllers, guards, interceptors and request values are singletons, and a singleton that injects a request-scoped service fails at `init()`. In 1.x the container silently turned such a singleton into a request-scoped one; that made every request rebuild the controller and its dependency chain.
- **It costs more.** A handler that reads one request value adds about 0.6 µs to a request in the Fastify benchmark; a handler that uses one request-scoped service with two dependencies adds about 1.3 µs, because a scope has to be created and disposed.
- **A request value usually says the same thing in less code,** and is typed by its `resolve` return type.

Use a request-scoped service when you have a third-party class that must be constructed per request, or a group of per-request classes that need `inject()` between themselves and the `onServiceInit` / `onServiceDestroy` lifecycle.

### The `requestScopedServices` option

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  requestScopedServices: 'allow', // 'allow' | 'warn' | 'forbid'
})
```

- `'warn'` logs one warning per token, pointing to request values. This is the default when `NODE_ENV` is not `production`.
- `'allow'` does nothing. This is the default in production.
- `'forbid'` makes `ctx.use()` and `ctx.resolve()` throw, which the client sees as a 500.

Limitation: the option is checked the first time a token is requested through `ctx.use()` or `ctx.resolve()`, not at `init()`. With `'forbid'`, an application starts normally and the offending route fails when it is first called. Cover such routes with a test.
