---
title: Circular dependencies
---

# Circular dependencies

Two services that inject each other cannot both be constructed first. The container detects this and fails with a clear error instead of hanging or handing out a half-built object. This page shows the error and the ways to resolve it.

## The error

```ts
import { Container, inject, Injectable } from '@navios/di'

@Injectable()
class OrderService {
  private readonly billing = inject(BillingService)
}

@Injectable()
class BillingService {
  private readonly orders = inject(OrderService)
}

await new Container().get(OrderService)
// DIError: Circular dependency detected: OrderService -> BillingService -> OrderService
```

The error is a `DIError` with code `CircularDependency`. `error.context.cycle` holds the path as an array of names, starting and ending with the same service.

## How detection works

While a service is being constructed it is marked as in progress. An `inject()` call that reaches a service already in progress on the current construction stack has found a cycle, and throws on the spot. This costs nothing when there is no cycle, so it is always on, in production too.

Cycles can also form across asynchronous work: one service waits for another's `onServiceInit`, which in turn waits for the first through a factory's `ctx.inject()`, a [factory token](/docs/di/essentials/tokens#factory-tokens) or an awaited `asyncInject()` promise. The container tracks who is waiting for whom and fails the resolution that would close the loop, with the same error code and the path of services that wait on each other.

A cycle of any length is detected, not just two services.

The container cannot see who awaits a promise that its own `get()` returned. These cycles are not detected and hang:

- `await container.get(B)` in the `onServiceInit` of `A`, when `B` needs `A`. Inject `B` instead.
- `await ctx.container.get(B)` in a factory. Use `ctx.inject(B)`, which is tracked.
- A promise chained in the constructor (`this.ready = asyncInject(B).then(...)`) and awaited later in `onServiceInit`.

## Fix the design first

A cycle usually means two classes share a responsibility that belongs in a third. These fixes remove the cycle instead of working around it:

| Situation                                                    | Fix                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Both services need the same data or helper                   | Move it into a third service that both inject                                                           |
| One service only needs to notify the other                   | Have the caller pass a callback, or publish an event that the other subscribes to in `onServiceInit`     |
| One side needs the other for a single method                 | Pass the dependency as a method argument instead of injecting it                                        |

```ts
@Injectable()
class PricingRules {
  totalFor(orderId: string) {
    return 0
  }
}

@Injectable()
class OrderService {
  private readonly pricing = inject(PricingRules)
}

@Injectable()
class BillingService {
  private readonly pricing = inject(PricingRules)
}
```

## Breaking a cycle with asyncInject

When the cycle is real, as with two services that call each other at runtime but not during construction, [`asyncInject()`](/docs/di/essentials/services#asyncinject) breaks it on one side.

```ts
import { asyncInject, inject, Injectable } from '@navios/di'

@Injectable()
class OrderService {
  private readonly billing = asyncInject(BillingService)

  async checkout(orderId: string) {
    const billing = await this.billing
    return billing.charge(orderId)
  }

  find(orderId: string) {
    return { id: orderId, total: 100 }
  }
}

@Injectable()
class BillingService {
  private readonly orders = inject(OrderService)

  charge(orderId: string) {
    return this.orders.find(orderId).total
  }
}
```

`asyncInject()` returns a promise and does not start resolving until the current constructor has returned. By then `OrderService` exists, so `BillingService` can inject it normally. Both end up holding the same two singletons.

Rules for using it:

- **One side is enough.** Keep `inject()` on the other side so only one service pays for the `await`.
- **Await the promise in methods, never in `onServiceInit`.** If `OrderService.onServiceInit` awaits `this.billing`, `OrderService` is not ready until `BillingService` is, and `BillingService` is waiting for `OrderService`. The cycle is back, and both resolutions fail with `CircularDependency`.
- **It needs a stored service on the way.** A cycle made only of [transients](/docs/di/essentials/scopes#transient) has no end, since each of them is a new instance: awaiting the promise fails with `CircularDependency`.
- **Do not use it for anything else.** `inject()` already handles transients and services with asynchronous initialisers.
