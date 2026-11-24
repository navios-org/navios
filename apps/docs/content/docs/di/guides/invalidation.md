---
title: Invalidation
---

# Invalidation

Invalidating an instance destroys it, and everything built on top of it, while the container keeps running. The next resolution builds a fresh one. Use it when something a long-lived service captured at creation is no longer valid: rotated credentials, reloaded configuration, a logged-out user.

## invalidate

`invalidate()` takes the instance, not the token.

```ts
import { Container, inject, Injectable } from '@navios/di'

@Injectable()
class Credentials {
  readonly token = readTokenFromDisk()
}

@Injectable()
class GatewayClient {
  private readonly credentials = inject(Credentials)
}

const container = new Container()
const before = await container.get(GatewayClient)

await container.invalidate(await container.get(Credentials))

const after = await container.get(GatewayClient)
before === after // false: a new GatewayClient with new Credentials
```

The returned promise resolves when every `onServiceDestroy` hook involved has finished. A `get()` for the same token, or for a service that depends on it, that arrives in the meantime waits for the teardown and then builds the new instance; it never receives the one being destroyed.

Passing something the container does not hold does nothing. That includes transients resolved directly from the root container and primitive values, which have no identity to look up.

## What is destroyed

For the instance passed in, in this order:

1. Every stored instance that depends on it, recursively. Each goes through these same steps.
2. The instance itself: `onServiceDestroy`, then destroy listeners registered by a factory.
3. The transients it injected.

Its own dependencies are untouched. Invalidating `GatewayClient` leaves `Credentials` alone; invalidating `Credentials` takes `GatewayClient` with it.

The container knows the dependents from what happened during construction:

| How the dependency was obtained                              | Tracked |
| ------------------------------------------------------------ | ------- |
| `inject()` or `optional()` in a class or factory             | Yes     |
| `asyncInject()`                                              | Yes     |
| `ctx.inject()` in a factory or function provider             | Yes     |
| `container.get()` called from a method at some later time    | No      |
| A value copied out of the dependency and stored in a field   | No      |

Tracking crosses scopes. If a request-scoped service in an open scope injected a singleton, invalidating the singleton also destroys that request-scoped instance.

## What is rebuilt

Nothing, until it is asked for. Invalidation only destroys. A new instance is built by the next `get()` or `inject()` that needs one, with the usual [resolution](/docs/di/how-it-works).

Code that holds a reference outside the container keeps the old object. In the example above, `before` still points at a destroyed `GatewayClient`. Long-running code should either resolve per unit of work or listen for the invalidation.

## onInvalidate

`onInvalidate(token, args, listener)` calls `listener` whenever the instance stored for that token and arguments is destroyed, for any reason: `invalidate()`, the invalidation of something it depends on, or `dispose()`.

```ts
let client = await container.get(GatewayClient)

const stop = container.onInvalidate(GatewayClient, undefined, async () => {
  client = await container.get(GatewayClient)
})

// later
stop()
```

| Parameter  | Meaning                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `token`    | A class or any kind of token                                                                                                     |
| `args`     | The arguments of the instance to watch, for a [token with a schema](/docs/di/essentials/tokens#tokens-with-a-schema). `undefined` otherwise. Ignored for bound and factory tokens, which carry their own |
| `listener` | Called with no arguments, after the whole cascade is over                                                                           |

Listeners run once everything the call destroys is gone and every `onServiceDestroy()` has settled, just before the promise returned by `invalidate()` or `dispose()` resolves. They run in the order the instances were destroyed, dependents first. A listener can therefore resolve the service again, as above, and gets a fully rebuilt instance. Every listener runs even if one throws; the first error rejects that promise.

The listener is attached to the address, not to one object. It stays registered across rebuilds and fires each time, until the returned function is called. It can be registered before the instance exists.

This is how UI bindings stay current: `@navios/di-react` subscribes for every service a component uses and re-resolves when one is invalidated. See [Scopes and invalidation](/docs/di/react/scopes-and-invalidation).

## In a scope

`scope.invalidate(instance)` works on whatever owns the instance. A request-scoped instance is destroyed in the scope; anything else is forwarded to the root container, so a handler can invalidate a singleton without holding a reference to the root.

`scope.onInvalidate()` likewise attaches the listener where the instance lives: the scope for a request-scoped service, the root for a singleton.

## Invalidation or a shorter scope

Invalidation suits rare, external events. If a value changes with every request or job, do not invalidate per request; make the service [request-scoped](/docs/di/essentials/scopes#request) so each unit of work gets its own instance and disposal is automatic.
