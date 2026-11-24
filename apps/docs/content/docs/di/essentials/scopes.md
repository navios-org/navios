---
title: Scopes
---

# Scopes

A scope says how long an instance lives and who shares it. Every provider has one; the default is singleton.

| Scope                        | Instances                            | Stored in                 | Destroyed when                                  |
| ---------------------------- | ------------------------------------ | ------------------------- | ----------------------------------------------- |
| `InjectableScope.Singleton`  | One per root container               | The root container        | The container is disposed, or it is invalidated |
| `InjectableScope.Transient`  | A new one for every `inject` or `get` | Nowhere                  | Its owner is destroyed                          |
| `InjectableScope.Request`    | One per `ScopedContainer`            | The scope that created it | The scope is disposed                           |

```ts
import { Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class RequestState {
  readonly values = new Map<string, unknown>()
}
```

## Singleton

One instance serves the whole container. `DatabaseService` and `UserService` from the quick start are singletons, which fits anything stateless or deliberately shared: clients, pools, repositories, configuration.

A singleton is always built against the root container, even when it is first requested through a scope. It can therefore never see a value that belongs to one scope.

Concurrent `get()` calls for a singleton that is still initialising all receive the same instance; it is built once.

## Transient

Each resolution builds a new instance. Two `inject()` calls in one class give two instances:

```ts
import { inject, Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Transient })
class Counter {
  value = 0
}

@Injectable()
class Stats {
  readonly hits = inject(Counter)
  readonly misses = inject(Counter) // a different Counter
}
```

A transient injected into a singleton is built once, together with the singleton, and lives as long as it does. A method that needs a new one on every call [injects the `Container`](/docs/di/essentials/services#inject) and resolves the transient there.

A transient is not stored, so it is owned by whatever created it:

| Created by                          | Destroyed                                                    |
| ----------------------------------- | ------------------------------------------------------------ |
| `inject()` inside a service         | Together with that service                                   |
| `get()` or `getSync()` on a scope   | When the scope is disposed                                   |
| `get()` or `getSync()` on the root  | Never by the container. Its `onServiceDestroy` is not called |

## Request

A request-scoped service exists once per `ScopedContainer`. The name comes from servers, where a scope lasts for one HTTP request, but a scope can wrap any unit of work: a job, a message, a CLI command.

### Creating a scope

`container.createScope()` returns a `ScopedContainer`. It resolves like a container and must be disposed when the work is done.

```ts
import { Container } from '@navios/di'

const container = new Container()

const scope = container.createScope()
try {
  const state = await scope.get(RequestState)
  const same = await scope.get(RequestState) // the same instance
  const users = await scope.get(UserService) // the container's singleton
} finally {
  await scope.dispose()
}
```

With TypeScript 5.2 or newer, `await using` disposes the scope at the end of the block:

```ts
{
  await using scope = container.createScope()
  const state = await scope.get(RequestState)
}
```

Scopes are independent of each other. Any number can be open at once, each with its own `RequestState`, all sharing the root's singletons. Creating one is cheap; request-scoped services are built only when something asks for them.

A request-scoped service is found through the scope object it is resolved from. There is no ambient context and no `AsyncLocalStorage`, so pass the scope to the code that resolves from it.

After `dispose()`, `get()` rejects and `getSync()` and `addInstance()` throw a `DIError` with code `ContainerDisposed`. Disposing twice does nothing.

### Values supplied per scope

Data that exists only for one unit of work enters the scope through `addInstance()`. Declare a [token with a scope](/docs/di/essentials/tokens#tokens-that-declare-a-scope) for it:

```ts
import { inject, Injectable, InjectableScope, InjectionToken } from '@navios/di'

export const REQUEST_ID = InjectionToken.create<string>('RequestId', {
  scope: InjectableScope.Request,
})

@Injectable({ scope: InjectableScope.Request })
class RequestLogger {
  private readonly requestId = inject(REQUEST_ID)

  log(message: string) {
    console.log(`[${this.requestId}] ${message}`)
  }
}

await using scope = container.createScope()
scope.addInstance(REQUEST_ID, crypto.randomUUID())

const logger = await scope.get(RequestLogger)
```

`createScope()` also accepts a plain metadata object, read back with `scope.getMetadata(key)` and changed with `scope.setMetadata(key, value)`. Metadata is not injectable; it is for the code that owns the scope.

## Scope rules

A service may only depend on things that live at least as long as it does.

| Consumer  | Injects a singleton | Injects a request-scoped service     | Injects a transient                         |
| --------- | ------------------- | ------------------------------------ | ------------------------------------------- |
| Singleton | Yes                 | **No**                               | Yes, if the transient needs nothing scoped  |
| Request   | Yes                 | Yes                                  | Yes                                         |
| Transient | Yes                 | Only when its own consumer is allowed to | Yes                                     |

The container enforces the table. It never changes a service's scope to make a graph work.

## ScopeMismatchError

Breaking the rule fails with a `DIError` with code `ScopeMismatchError`. The message names the path that led there:

```ts
@Injectable()
class AuditService {
  private readonly state = inject(RequestState)
}

await scope.get(AuditService)
// Scope mismatch: RequestState is request-scoped and cannot be resolved from the root
// container (AuditService -> RequestState). Resolve it from a scope created with
// container.createScope(), and do not inject it into a singleton.
```

The error is the same whether `AuditService` is requested from the root or from a scope, and whether it uses `inject()` or `optional()`. A transient in between does not hide it. Resolving a request-scoped service directly from the root container is the same error without a path.

There are three ways out:

| Fix                              | When                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Make the consumer request-scoped | The service needs per-request state to do its work, so it is per-request itself                         |
| Pass the value as an argument    | The service should stay a singleton. Hand the request-scoped object to the method that needs it         |
| Split the service                | Only part of it needs request state. Move that part into a request-scoped service that injects the rest |
