# Service Lifecycle

Navios DI has two lifecycle hooks: `onServiceInit()` runs after a service is constructed, and `onServiceDestroy()` runs when it is destroyed.

## Overview

1. **Construction** - the constructor runs and dependencies are injected.
2. **Initialization** - `onServiceInit()` is called, if the class has one.
3. **Use** - the instance is stored and handed out.
4. **Destruction** - `onServiceDestroy()` is called when the instance is invalidated or its container or scope is disposed.

## Basic Usage

### Service with Lifecycle Hooks

```ts
import { Injectable } from '@navios/di'

import type { OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: Connection | null = null

  async onServiceInit() {
    this.connection = await connect('postgres://localhost:5432/app')
  }

  async onServiceDestroy() {
    await this.connection?.close()
    this.connection = null
  }

  async query(sql: string) {
    if (!this.connection) {
      throw new Error('Database not connected')
    }
    return this.connection.query(sql)
  }
}
```

### Using the Service

```ts
import { Container } from '@navios/di'

const container = new Container()

// Constructed and initialised before get() resolves
const db = await container.get(DatabaseService)
await db.query('SELECT 1')

// Calls onServiceDestroy()
await container.dispose()
```

## Lifecycle Hook Details

### OnServiceInit

```ts
interface OnServiceInit {
  onServiceInit(): Promise<void> | void
}
```

`onServiceInit()` is called once per instance, after the constructor has returned. At that point every dependency obtained with `inject()` is constructed and initialised.

The return value decides whether the service is ready at once:

- If it returns anything that is not a promise, the instance is ready immediately. The service can be resolved with `getSync()` and injected without any waiting.
- If it returns a promise, the instance is pending until the promise settles. `get()` waits for it, and so does every service that injects it. `getSync()` throws `AsyncInitRequired` while it is pending.

An instance is never visible to other services before its `onServiceInit()` has finished:

```ts
@Injectable()
class Slow implements OnServiceInit {
  ready = false

  async onServiceInit() {
    await loadSomething()
    this.ready = true
  }
}

@Injectable()
class Consumer implements OnServiceInit {
  private readonly slow = inject(Slow)

  onServiceInit() {
    console.log(this.slow.ready) // always true
  }
}
```

If `onServiceInit()` throws or rejects, resolution fails with a `DIError` with code `InitializationError` whose `cause` is the original error. The instance is not stored, so the next resolution constructs and initialises a new one.

### OnServiceDestroy

```ts
interface OnServiceDestroy {
  onServiceDestroy(): Promise<void> | void
}
```

`onServiceDestroy()` is called when:

- the instance is passed to `container.invalidate()`
- a service it depends on is invalidated
- the container that holds it is disposed (singletons), or its scope is disposed (request-scoped services)

An error thrown by a destroy hook does not prevent other instances from being destroyed.

Values produced by a `@Factory` class or a function provider have no `onServiceDestroy()` hook. Register their cleanup with `ctx.addDestroyListener()`; see [Factory Decorator](./factory.md#factory-context). A value stored with `addInstance()` that has an `onServiceDestroy()` method gets it called on destruction.

## Destruction Order

### On dispose

`dispose()` destroys instances in reverse creation order. A service is always created after the dependencies it injects, so it is destroyed before them:

```ts
@Injectable()
class First implements OnServiceDestroy {
  onServiceDestroy() {
    console.log('first')
  }
}

@Injectable()
class Second implements OnServiceDestroy {
  private readonly first = inject(First)

  onServiceDestroy() {
    console.log('second')
  }
}

await container.get(Second)
await container.dispose()
// second
// first
```

### On invalidate

`invalidate(instance)` destroys the services that depend on the instance first, then the instance, then the transients the instance injected:

```ts
await container.get(Second)

await container.invalidate(await container.get(First))
// second
// first

const again = await container.get(Second) // a new Second with a new First
```

### Listening for destruction

`onInvalidate()` calls a listener when a particular instance is destroyed:

```ts
const stop = container.onInvalidate(Second, undefined, () => {
  console.log('Second was destroyed')
})

stop() // remove the listener
```

Listeners are called after the whole `invalidate()` or `dispose()` call has finished its work: every instance involved is destroyed and every `onServiceDestroy()` hook, asynchronous ones included, has settled. They run in the order the instances were destroyed, before the promise returned by `invalidate()` or `dispose()` resolves. A listener can therefore resolve the service again right away, with `get()` or `getSync()`, and the new instance is constructed once, against new dependencies:

```ts
container.onInvalidate(Second, undefined, () => {
  current = container.getSync(Second) // a new Second with a new First
})

await container.invalidate(await container.get(First))
```

A listener that throws does not stop the others; the first error rejects the promise returned by `invalidate()` or `dispose()`, after the teardown is complete.

A `get()` that arrives while an invalidation is still running waits for it: a service is not constructed while a dependency it is known to inject, directly or through other services, is being destroyed.

On a scope, the listener is attached to whichever container owns the instance: the scope for a request-scoped service, the root container for a singleton.

## Transients

A transient is owned by whatever created it:

- A transient injected into a service is destroyed together with that service.
- A transient resolved directly from a scope (`scope.get()` or `scope.getSync()`) is destroyed when the scope is disposed.
- A transient resolved directly from the root container is not tracked. Its `onServiceDestroy()` is not called by `dispose()`; the caller is responsible for it.

```ts
@Injectable({ scope: InjectableScope.Transient })
class TempFile implements OnServiceDestroy {
  onServiceDestroy() {
    // remove the file
  }
}

@Injectable()
class Exporter {
  private readonly input = inject(TempFile)
  private readonly output = inject(TempFile)
}

const exporter = await container.get(Exporter)
await container.invalidate(exporter) // both TempFile instances are destroyed
```

## Advanced Patterns

### Service with Multiple Resources

```ts
@Injectable()
class MessagingService implements OnServiceInit, OnServiceDestroy {
  private publisher: Publisher | null = null
  private subscriber: Subscriber | null = null

  async onServiceInit() {
    this.publisher = await createPublisher()
    try {
      this.subscriber = await createSubscriber()
    } catch (error) {
      // onServiceDestroy is not called for an instance that failed to initialise
      await this.publisher.close()
      throw error
    }
  }

  async onServiceDestroy() {
    // Close in reverse order of creation
    await this.subscriber?.close()
    await this.publisher?.close()
  }
}
```

### Service with Synchronous Initialization

When the work is synchronous, do not mark `onServiceInit()` as `async`. A synchronous hook keeps the whole resolution synchronous:

```ts
@Injectable()
class RouteTable implements OnServiceInit {
  private readonly routes = new Map<string, Handler>()
  private readonly registry = inject(HandlerRegistry)

  onServiceInit() {
    for (const handler of this.registry.all()) {
      this.routes.set(handler.path, handler)
    }
  }
}

const table = container.getSync(RouteTable)
```

## Lifecycle with Dependencies

```ts
@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  async onServiceInit() {
    console.log('database: init')
  }

  async onServiceDestroy() {
    console.log('database: destroy')
  }
}

@Injectable()
class UserService implements OnServiceInit, OnServiceDestroy {
  private readonly db = inject(DatabaseService)

  async onServiceInit() {
    console.log('users: init')
  }

  async onServiceDestroy() {
    console.log('users: destroy')
  }
}

const container = new Container()
await container.get(UserService)
await container.dispose()
// database: init
// users: init
// users: destroy
// database: destroy
```

`DatabaseService` has an asynchronous `onServiceInit()`. On the first build of `UserService` the container therefore discards the first construction pass, waits for the database and constructs `UserService` again. This is why constructors should have no side effects; see [How a Class is Constructed](./injectable.md#how-a-class-is-constructed).

## Best Practices

### 1. Put setup in `onServiceInit`, not in the constructor

The constructor may run twice on the first build, and dependencies with asynchronous initialisers are not usable inside it.

### 2. Keep `onServiceInit` synchronous when the work is synchronous

An `async` hook makes every dependent service wait and rules out `getSync()` until it settles.

### 3. Release what you acquire

Everything opened in `onServiceInit()` should be closed in `onServiceDestroy()`, in reverse order.

### 4. Clean up after a partial initialisation

If `onServiceInit()` fails halfway, release what was already acquired before rethrowing. `onServiceDestroy()` is not called for an instance that never became ready.

### 5. Wait for pending work before reading state

`await container.ready()` resolves when no service is still initialising.

## API Reference

### OnServiceInit Interface

```ts
interface OnServiceInit {
  onServiceInit(): Promise<void> | void
}
```

### OnServiceDestroy Interface

```ts
interface OnServiceDestroy {
  onServiceDestroy(): Promise<void> | void
}
```

### Lifecycle Order

1. Constructor and field initialisers
2. `onServiceInit()`
3. Container decorators (`container.decorate()`)
4. The instance is stored and returned
5. `onServiceDestroy()` on invalidation or disposal, dependents first
