---
title: Factories
---

# Factories

A factory produces a value that is not an instance of your own injectable class: a client from a third-party library, a plain object, a function. The container treats the result like any other instance: it is stored by scope, injected, and destroyed.

## @Factory

A factory is a class with a `create()` method. Resolving the class returns what `create()` returned.

```ts
import { Factory } from '@navios/di'

import type { FactoryContext } from '@navios/di'

@Factory()
class RedisFactory {
  async create(ctx: FactoryContext) {
    const client = new RedisClient(process.env.REDIS_URL)
    await client.connect()

    ctx.addDestroyListener(() => client.quit())

    return client
  }
}

const redis = await container.get(RedisFactory)
//    ^? RedisClient
```

`create()` runs once per stored instance: once per container for a singleton, once per scope for a request-scoped factory, on every resolution for a transient one. It may be synchronous; then the value can be resolved with `getSync()`.

| Option  | Default     | Purpose                                                                             |
| ------- | ----------- | ----------------------------------------------------------------------------------- |
| `scope` | `Singleton` | How long the produced value lives. See [Scopes](/docs/di/essentials/scopes)         |
| `token` | —           | Register the factory as the default provider of a [token](/docs/di/essentials/tokens) |

A produced value has no [lifecycle hooks](/docs/di/essentials/lifecycle#onservicedestroy). Initialise it inside `create()` and register cleanup with `ctx.addDestroyListener()`.

An error thrown by `create()` reaches the caller as a `DIError` with code `InitializationError` and the original in `cause`. The destroy listeners registered so far run, so what was opened before the error is closed. Nothing is stored, and the next resolution calls `create()` again.

## Providing a token

Most consumers should not know that a factory exists. Give the value a token and let them inject that:

```ts
import { Factory, inject, Injectable, InjectionToken } from '@navios/di'

export const REDIS = InjectionToken.create<RedisClient>('Redis')

@Factory({ token: REDIS })
class RedisFactory {
  create() {
    return new RedisClient(process.env.REDIS_URL)
  }
}

@Injectable()
class SessionStore {
  private readonly redis = inject(REDIS)
}
```

The decorator checks that `create()` returns the token's type.

When the token has a [schema](/docs/di/essentials/tokens#tokens-with-a-schema), the validated arguments arrive as the second parameter of `create()`, and one value is produced per distinct argument value:

```ts
import { z } from 'zod/v4'

const queueOptions = z.object({ name: z.string(), concurrency: z.number().default(1) })

export const QUEUE = InjectionToken.create<Queue, typeof queueOptions>('Queue', queueOptions)

@Factory({ token: QUEUE })
class QueueFactory {
  create(ctx: FactoryContext, options: z.output<typeof queueOptions>) {
    return new Queue(options.name, options.concurrency)
  }
}

const emails = await container.get(QUEUE, { name: 'emails' })
```

## FactoryContext

The first parameter of `create()` describes the resolution in progress.

| Member                         | Purpose                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `inject(token, args?)`         | Resolves a dependency and returns a promise of it. Can be called at any point, also after an `await`       |
| `container`                    | The container or scope the value is being built in                                                         |
| `addDestroyListener(listener)` | Registers cleanup that runs when the produced value is destroyed, or when the factory fails. The listener may return a promise. If the value is already gone, the listener runs at once |

Listeners run in reverse order of registration. A listener may still use `ctx.inject()` for what the value depends on, and for singletons from a request-scoped factory. The same context is passed to [function providers](#function-providers) and to [factory tokens](/docs/di/essentials/tokens#factory-tokens).

## Injecting dependencies

A factory has two ways to reach other services.

```ts
// DatabaseService comes from the quick start
@Factory()
class ReportQueueFactory {
  private readonly db = inject(DatabaseService)

  async create(ctx: FactoryContext) {
    const redis = await ctx.inject(REDIS)
    return new ReportQueue(this.db, redis)
  }
}
```

- **`inject()` in a field initialiser**, as in a service. The factory object is created just before `create()` is called, so the fields are set.
- **`ctx.inject()` inside `create()`.** It returns a promise, which makes it the one to use for dependencies that initialise asynchronously and for anything requested after an `await`.

Both record the dependency, so [invalidating](/docs/di/guides/invalidation) `REDIS` or `DatabaseService` also destroys the queue built from them.

`inject()` can also be called directly inside `create()`, before its first `await`. If the dependency is still initialising, the container stops `create()` at that call and runs it again from the top once the dependency is ready. Code before the call therefore runs twice. `ctx.inject()` has no such effect, which is why it is the better default inside `create()`.

## Function providers

When a value is only wired in one place, a function avoids the class. Pass it to [`provide()`](/docs/di/essentials/providers#provide) with a token:

```ts
import { Container, InjectionToken, provide } from '@navios/di'

export const CLOCK = InjectionToken.create<{ now(): number }>('Clock')

const container = new Container({
  providers: [
    provide(CLOCK, { factory: () => ({ now: () => Date.now() }) }),
    provide(QUEUE, {
      factory: async (ctx, options: { name: string; concurrency: number }) => {
        const redis = await ctx.inject(REDIS)
        return new Queue(options.name, options.concurrency, redis)
      },
    }),
  ],
})
```

The function receives the same context and validated arguments as `create()` and follows the same rules. The difference is reach: `@Factory({ token })` sets the token's default for every container, a function provider applies to the one container it is given to. [`registerProvider()`](/docs/di/essentials/providers#registerprovider) makes a function the default.

:::info
A class counts as a factory for types when `create` takes no parameters, or a `FactoryContext` first. A service with a `create()` method that takes its own data is unaffected. A `create()` without parameters on an ordinary `@Injectable()` service is taken for a factory: `inject()` is then typed as its result, although it returns the service. Give such a method another name.
:::

## Registering without decorators

`registerFactory()` is the function form of `@Factory`, with the same options.

```ts
import { registerFactory } from '@navios/di'

class ClockFactory {
  create() {
    return { now: () => Date.now() }
  }
}

registerFactory(ClockFactory, { token: CLOCK })
```
