---
title: Lifecycle
---

# Lifecycle

An instance is constructed, initialised, used and eventually destroyed. Two optional methods let a service take part in the second and last step.

| Hook                 | Called                                                             | May return a promise |
| -------------------- | ------------------------------------------------------------------ | -------------------- |
| `onServiceInit()`    | Once, right after construction, before anyone receives the instance | Yes                  |
| `onServiceDestroy()` | Once, when the instance is destroyed                               | Yes                  |

```ts
import { Injectable } from '@navios/di'

import type { OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class ConnectionPool implements OnServiceInit, OnServiceDestroy {
  private connections: Connection[] = []

  async onServiceInit() {
    this.connections = await openConnections(4)
  }

  async onServiceDestroy() {
    await Promise.all(this.connections.map((connection) => connection.close()))
  }
}
```

The `OnServiceInit` and `OnServiceDestroy` interfaces are optional type checks. The container looks for the methods, not the interfaces.

## onServiceInit

Initialisation belongs here rather than in the constructor, for two reasons: the constructor cannot await, and it [may run twice](/docs/di/how-it-works#constructor-replay). `onServiceInit` runs once per instance, and inside it every injected dependency is fully initialised.

```ts
// DatabaseService comes from the quick start
@Injectable()
class UserCache implements OnServiceInit {
  private readonly db = inject(DatabaseService)
  private readonly pool = inject(ConnectionPool)
  private admin: ReturnType<DatabaseService['findUser']>

  onServiceInit() {
    this.admin = this.db.findUser('1') // safe: db and pool are ready
  }
}
```

Dependencies initialise before the service that injects them: `ConnectionPool.onServiceInit` has resolved before `UserCache.onServiceInit` starts.

Return a promise only when the work is asynchronous. A hook that returns nothing keeps the service resolvable with `getSync()`; an `async` hook makes it, and everything that depends on it, [asynchronous on first resolution](/docs/di/how-it-works#when-resolution-becomes-asynchronous).

If the constructor or the hook throws, resolution fails with a `DIError` with code `InitializationError` and the original error in `cause`. Nothing is stored, `onServiceDestroy` is not called, and the next `get()` tries again from scratch. A hook that acquires several resources should release the ones it already holds before rethrowing.

## onServiceDestroy

`onServiceDestroy` runs when the instance is destroyed: by `dispose()` on its container or scope, or by [invalidation](/docs/di/guides/invalidation). Release what `onServiceInit` acquired.

An error thrown or rejected by the hook is swallowed so that the rest of the teardown still runs. Log inside the hook if you need to know about it.

The hook is found on:

| Instance                                         | `onServiceInit` | `onServiceDestroy` |
| ------------------------------------------------ | --------------- | ------------------ |
| Built from a class (`@Injectable`, `provide(…, Class)`) | Yes      | Yes                |
| Stored with `addInstance()`                      | No              | Yes                |
| Returned by a factory or given as `{ value }`    | No              | No                 |

A factory registers cleanup for its result with [`ctx.addDestroyListener()`](/docs/di/essentials/factories#factorycontext) instead.

## Destruction order

A service is always destroyed before the things it injected, so `onServiceDestroy` can still use its dependencies.

```ts
import { Container, inject, Injectable } from '@navios/di'

@Injectable()
class Database {
  onServiceDestroy() {
    console.log('database closed')
  }
}

@Injectable()
class Repository {
  private readonly db = inject(Database)

  onServiceDestroy() {
    console.log('repository flushed')
  }
}

const container = new Container()
await container.get(Repository)
await container.dispose()
// repository flushed
// database closed
```

Services that do not depend on each other are destroyed in reverse order of creation, one after another. Each hook is awaited before the next instance is touched.

For one instance, the steps are:

1. Everything that depends on it is destroyed.
2. Its own `onServiceDestroy` and destroy listeners run.
3. The [transients](/docs/di/essentials/scopes#transient) it injected are destroyed.

## dispose

`dispose()` first waits for instances that are still being created, then destroys everything the container holds.

```ts
process.on('SIGTERM', async () => {
  await container.dispose()
  process.exit(0)
})
```

|                         | `container.dispose()`                              | `scope.dispose()`                                      |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| Destroys                | Singletons                                         | Request-scoped instances and the scope's transients    |
| Leaves alone            | Open scopes. Dispose those first                   | Singletons                                             |
| Afterwards              | The container is empty and can be used again       | The scope is closed for good                           |

Both implement `Symbol.asyncDispose`, so `await using container = new Container()` disposes at the end of the block.

## ready

`ready()` resolves when no instance of the container is still being created. It does not start anything; it waits for what other code started.

```ts
void container.get(ConnectionPool) // starts an async init, nobody awaits it
await container.ready() // resolves once the pool is initialised

container.getSync(ConnectionPool) // safe now
```

A failed creation does not make `ready()` reject. The failure is reported to whoever asked for the service.
