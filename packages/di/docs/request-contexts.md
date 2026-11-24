# Scoped Containers

A scope is a child of a container that holds request-scoped instances. It is created with `container.createScope()` and usually lives for one HTTP request, job or message.

## Overview

A `ScopedContainer`:

- stores one instance of each request-scoped service resolved through it
- resolves singletons from its parent container, where they are stored and shared
- can hold values of its own, added with `addInstance()`
- carries optional metadata
- destroys its instances when it is disposed

A scope has no id and is not registered anywhere. The container does not keep a list of its scopes; a scope lives as long as you hold a reference to it and should be disposed when the work is done.

## Basic Usage

### Creating and Disposing a Scope

```ts
import { Container } from '@navios/di'

const container = new Container()

const scope = container.createScope()
try {
  // resolve services from the scope
} finally {
  await scope.dispose()
}
```

`ScopedContainer` implements `Symbol.asyncDispose`, so `await using` disposes the scope when the block ends, also when it ends with an error:

```ts
async function handle(container: Container) {
  await using scope = container.createScope()
  const handler = await scope.get(RequestHandler)
  return handler.run()
} // scope.dispose() runs here
```

### Using Request-Scoped Services

```ts
import { Container, inject, Injectable, InjectableScope } from '@navios/di'

@Injectable()
class Logger {
  log(message: string) {
    console.log(message)
  }
}

@Injectable({ scope: InjectableScope.Request })
class RequestState {
  readonly startedAt = Date.now()
  userId: string | null = null
}

@Injectable({ scope: InjectableScope.Request })
class RequestHandler {
  private readonly logger = inject(Logger)
  private readonly state = inject(RequestState)

  run() {
    this.logger.log(`request started at ${this.state.startedAt}`)
  }
}

const container = new Container()

await using scope = container.createScope()
const state = await scope.get(RequestState)
state.userId = 'user-1'

const handler = await scope.get(RequestHandler) // sees the same RequestState
handler.run()
```

When nothing in the dependency tree initialises asynchronously, `scope.getSync()` avoids the promise:

```ts
const handler = scope.getSync(RequestHandler)
```

## Advanced Features

### Values Supplied per Scope

`scope.addInstance()` stores a ready value in the scope. This is how per-request data enters the dependency graph.

A token that is only ever supplied this way declares the request scope and needs no provider:

```ts
import { InjectableScope, InjectionToken } from '@navios/di'

interface RequestInfo {
  url: string
  method: string
}

const REQUEST_INFO = InjectionToken.create<RequestInfo>('RequestInfo', {
  scope: InjectableScope.Request,
})

@Injectable({ scope: InjectableScope.Request })
class Router {
  private readonly info = inject(REQUEST_INFO)
}

await using scope = container.createScope()
scope.addInstance(REQUEST_INFO, { url: '/users', method: 'GET' })

const router = await scope.get(Router)
```

Because the token declares its scope, reaching it from the root container or from a singleton is a `ScopeMismatchError`. In a scope where no value was added, resolving it fails with `FactoryNotFound`.

`addInstance()` also accepts a class registered with `@Injectable()` and a bound token.

A value added to a scope is visible to request-scoped services and transients built in that scope. It is not visible to singletons, which are always built against the root container.

### Scope Metadata

```ts
const scope = container.createScope({ userId: 'user-1', traceId: 'abc' })

scope.getMetadata('userId') // 'user-1'
scope.setMetadata('tenant', 'acme')
scope.getMetadata('tenant') // 'acme'
```

Metadata is a plain key-value bag on the scope object. It is not injectable. To make a value injectable, add it with `addInstance()`.

### Parallel Scopes

Scopes do not affect each other and can run concurrently:

```ts
async function handleOne(userId: string) {
  await using scope = container.createScope()
  const state = await scope.get(RequestState)
  state.userId = userId
  return scope.get(RequestHandler)
}

await Promise.all([handleOne('a'), handleOne('b'), handleOne('c')])
```

Resolution does not use `AsyncLocalStorage`. A request-scoped service is found through the scope it is resolved from, not through the current async context.

### Invalidation inside a Scope

`scope.invalidate(instance)` destroys a request-scoped instance and its dependents within the scope. If the instance belongs to the parent container, the call is forwarded to it.

`scope.onInvalidate(token, args, listener)` listens on whichever container owns the instance: the scope for a request-scoped service, the parent for a singleton.

## Web Framework Integration

### Express Example

```ts
import { Container } from '@navios/di'
import express from 'express'

import type { ScopedContainer } from '@navios/di'

const container = new Container()
const app = express()

declare global {
  namespace Express {
    interface Request {
      scope: ScopedContainer
    }
  }
}

app.use((req, res, next) => {
  const scope = container.createScope()
  scope.addInstance(REQUEST_INFO, { url: req.url, method: req.method })
  req.scope = scope

  res.on('close', () => {
    void scope.dispose()
  })
  next()
})

app.get('/users', async (req, res) => {
  const handler = await req.scope.get(UsersHandler)
  res.json(await handler.list())
})
```

### Fastify Example

```ts
import { Container } from '@navios/di'
import Fastify from 'fastify'

import type { ScopedContainer } from '@navios/di'

declare module 'fastify' {
  interface FastifyRequest {
    scope: ScopedContainer
  }
}

const container = new Container()
const fastify = Fastify()

fastify.addHook('onRequest', async (request) => {
  request.scope = container.createScope()
  request.scope.addInstance(REQUEST_INFO, { url: request.url, method: request.method })
})

fastify.addHook('onResponse', async (request) => {
  await request.scope.dispose()
})

fastify.get('/users', async (request) => {
  const handler = await request.scope.get(UsersHandler)
  return handler.list()
})
```

## Best Practices

### 1. Always dispose

Use `await using` where the scope's lifetime is one block, and a `finally` block or a framework hook otherwise. A scope that is not disposed never runs the `onServiceDestroy()` hooks of its instances.

### 2. Supply request data with `addInstance()`

Add the request object, the authenticated user or the trace context to the scope right after creating it. Services then inject it like any other dependency.

### 3. Keep singletons free of request data

A singleton cannot inject a request-scoped service. Pass request data to its methods as arguments, or make the consumer request-scoped. See [Scope Rules](./scopes.md#scope-rules).

### 4. Combine with lifecycle hooks

```ts
@Injectable({ scope: InjectableScope.Request })
class Transaction implements OnServiceInit, OnServiceDestroy {
  private readonly pool = inject(DatabasePool)
  private client: PoolClient | null = null

  async onServiceInit() {
    this.client = await this.pool.connect()
    await this.client.query('BEGIN')
  }

  async onServiceDestroy() {
    await this.client?.query('ROLLBACK')
    this.client?.release()
  }
}
```

## Error Handling

### Request-scoped service from the root container

```ts
await container.get(RequestState)
// DIError (ScopeMismatchError): Scope mismatch: RequestState is request-scoped and cannot be
// resolved from the root container. Resolve it from a scope created with
// container.createScope(), and do not inject it into a singleton.
```

### Using a disposed scope

```ts
const scope = container.createScope()
await scope.dispose()

await scope.get(RequestState)
// DIError (ContainerDisposed): ScopedContainer has been disposed
```

`getSync()` and `addInstance()` throw the same error. Calling `dispose()` a second time does nothing.

## API Reference

### Container Methods

- `createScope(metadata?: Record<string, any>): ScopedContainer` - creates a scope

### ScopedContainer Methods

- `get(token, args?): Promise<T>` - resolves an instance; request-scoped instances are stored in the scope, singletons in the parent
- `getSync(token, args?): T` - resolves synchronously; throws `AsyncInitRequired` when an asynchronous initialiser is pending
- `tryGetSync<T>(token, args?): T | null` - returns an instance that is already built, or `null`
- `addInstance(token, instance): void` - stores a ready value in the scope
- `isRegistered(token): boolean` - whether the token can be resolved from the scope
- `invalidate(service): Promise<void>` - destroys an instance and its dependents
- `onInvalidate(token, args, listener): () => void` - listens for the destruction of an instance
- `ready(): Promise<void>` - waits until no instance of the scope is still being created
- `dispose(): Promise<void>` - destroys the scope's instances in reverse creation order
- `[Symbol.asyncDispose](): Promise<void>` - calls `dispose()`
- `getParent(): Container` - the container that created the scope
- `getMetadata(key: string): any | undefined`
- `setMetadata(key: string, value: any): void`
- `endRequest(): Promise<void>` - deprecated alias of `dispose()`

## Performance Considerations

- Creating a scope allocates one object and an empty store. Nothing is registered on the parent.
- After the first build of a class, the container knows which dependencies it asks for. Later request-scoped builds of that class resolve them and run the constructor once.
- Disposing a scope whose instances have no destroy hooks does no asynchronous work.
- A scope does not add itself as a dependent of the singletons it uses, so singletons do not accumulate references to past scopes.

## Troubleshooting

**`Scope mismatch: X is request-scoped and cannot be resolved from the root container (A -> X)`.** The singleton `A` injects the request-scoped `X`. Make `A` request-scoped or pass `X` to its methods.

**`Factory RequestInfo not found` inside a scope.** The scope-only token was not supplied. Call `scope.addInstance()` before resolving services that inject it.

**A singleton sees the root value instead of the scope value.** Singletons are built against the root container. Values added to a scope are visible only to request-scoped services and transients built in that scope.

**`ScopedContainer has been disposed`.** Something kept the scope after the request ended. Do not store a scope or its instances in a singleton.
