---
title: Testing
---

# Testing

Nothing in a service refers to a container, so a test decides what the service is wired to. This page goes from the plain approach, which covers most tests, to the two helper containers in `@navios/di/testing`.

The examples use Vitest, which does not compile standard decorators by itself. [Testing](/docs/server/essentials/testing) in the Server docs has the configuration; `bun test` needs none.

## A fresh container per test

Instances live in a container, not in the classes. A new `Container` starts with none, so tests cannot leak state into each other.

```ts
import { Container } from '@navios/di'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { UserService } from './services.mjs'

describe('UserService', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('returns a user by id', async () => {
    const users = await container.get(UserService)

    expect(users.getUser('1')).toEqual({ id: '1', name: 'Ada' })
  })
})
```

`dispose()` in `afterEach` runs `onServiceDestroy` hooks, so connections and timers opened by one test are closed before the next.

## Replacing a dependency

Give the container a [provider](/docs/di/essentials/providers#provide) for the thing to replace. Everything else resolves as in production.

```ts
import { Container, provide } from '@navios/di'
import { expect, it, vi } from 'vitest'

import { DatabaseService, UserService } from './services.mjs'

it('throws for an unknown user', async () => {
  const findUser = vi.fn().mockReturnValue(undefined)
  const container = new Container({
    providers: [provide(DatabaseService, { value: { findUser } })],
  })

  const users = await container.get(UserService)

  expect(() => users.getUser('42')).toThrow('User 42 not found')
  expect(findUser).toHaveBeenCalledWith('42')
})
```

The replacement can be a value, a class or a function, and has to have the public members of what it replaces. A class is useful when the fake needs dependencies or lifecycle hooks of its own:

```ts
class InMemoryDatabase {
  private readonly users = new Map([['7', { id: '7', name: 'Grace' }]])

  findUser(id: string) {
    return this.users.get(id)
  }
}

const container = new Container({
  providers: [provide(DatabaseService, InMemoryDatabase)],
})
```

To add behaviour to the real implementation instead of replacing it, for example to count calls, use [`container.decorate()`](/docs/di/essentials/providers#decorating-instances).

## Scopes and lifecycle

Request-scoped services are tested through a scope, exactly as they are used:

```ts
it('gives each scope its own state', async () => {
  const first = container.createScope()
  const second = container.createScope()

  expect(await first.get(RequestState)).not.toBe(await second.get(RequestState))

  await first.dispose()
  await second.dispose()
})
```

Lifecycle hooks are ordinary methods, so a spy on the instance is enough:

```ts
it('closes the pool on dispose', async () => {
  const pool = await container.get(ConnectionPool)
  const destroy = vi.spyOn(pool, 'onServiceDestroy')

  await container.dispose()

  expect(destroy).toHaveBeenCalledOnce()
})
```

Failures are `DIError`s. Assert on `code` rather than on the message:

```ts
import { DIErrorCode } from '@navios/di'

await expect(container.get(RequestState)).rejects.toMatchObject({
  code: DIErrorCode.ScopeMismatchError,
})
```

## TestContainer

`TestContainer` is a `Container` with a fluent way to bind replacements and a few assertions about the container itself.

```ts
import { TestContainer } from '@navios/di/testing'

const container = new TestContainer()

container.bind(DatabaseService).toValue({ findUser: () => ({ id: '1', name: 'Stub' }) })
container.bind(MAILER).toClass(FakeMailer)
container.bind(CLOCK).toFactory((ctx) => ({ now: () => 0 }))

const users = await container.get(UserService)

container.expectResolved(UserService)
container.expectNotResolved(MAILER)
```

How `bind()` differs from `container.provide()`:

- It may be called after the token was resolved. The existing instance and everything that depends on it are destroyed, and the next resolution uses the new binding. For an [alias](/docs/di/essentials/providers#aliases) that is everything that depends on what it pointed to, which stays itself.
- `toValue()` of a singleton stores the value at once, so the token counts as resolved. A value for a request-scoped token is served in scopes only, as in production.
- Instances that an open scope already holds stay as they are.
- A binding on a [bound token](/docs/di/essentials/tokens#bound-tokens) is for the arguments of that token alone. The other arguments of the underlying token keep their provider, and binding it again destroys only the instance for those arguments. It also applies to `get(token, args)` with the same arguments, which is the same instance.
- `clear()` destroys all instances and keeps the bindings and the container. Call it in `afterEach` when one container is shared by a whole `describe` block. A container that was disposed with `dispose()` is closed for good.

The dependency graph of what has been resolved can be snapshotted, which catches accidental new dependencies:

```ts
expect(container.getSimplifiedDependencyGraph()).toEqual({
  DatabaseService: [],
  UserService: ['DatabaseService'],
})
```

The [API reference](/docs/di/reference/api#testcontainer) lists every assertion. The scope assertions (`expectSingleton` and friends) check the scope of the provider in use. The call assertions (`expectCalled` and friends) only see what a test or a fake reported through `recordMethodCall()`; the container does not observe real instances. To check that `onServiceInit()` or `onServiceDestroy()` ran, let the fake record it, or spy on the hook.

## UnitTestContainer

`UnitTestContainer` is for testing one class in isolation. It is a [strict container](/docs/di/essentials/providers#strict-containers): only what is listed in `providers` can be resolved, so a test cannot reach a real database because someone added an `inject()`.

```ts
import { UnitTestContainer } from '@navios/di/testing'

const container = new UnitTestContainer({
  providers: [
    { token: UserService }, // the class under test, as itself
    { token: DatabaseService, useValue: { findUser: () => ({ id: '1', name: 'Stub' }) } },
  ],
})

const users = await container.get(UserService)
users.getUser('1')

container.expectCalled(UserService, 'getUser')
container.expectCalledWith(UserService, 'getUser', ['1'])
container.expectCallCount(UserService, 'getUser', 1)
```

A provider entry has a `token` and at most one of `useValue`, `useClass` and `useFactory`, which is called with the factory context and the arguments. With none of them, a class is registered as itself. A [bound token](/docs/di/essentials/tokens#bound-tokens) needs one of the three, which then applies to its arguments alone; without one the container throws when it is created, since a bound token names arguments and not what to build for them. What is given is checked against the public members of the token's type, except that any string, number or boolean passes for a literal type: TypeScript infers the list before it looks at the tokens.

Instances returned by `get()` and `getSync()`, of the container and of its scopes, are wrapped in a proxy that records every method call, which is what the `expect…` methods read. Only calls made through that returned object are recorded. Calls one service makes on another go to the real injected instance, and calls a service makes to its own methods stay inside it, so assert on those with a spy inside the `useValue` fake. Spies keep working through the proxy.

A dependency that is not listed fails with `ProviderNotFound` when the class under test is built. With `allowUnregistered: true` an unlisted token resolves to a placeholder instead, whether it is requested from the container or injected into the class under test. The placeholder throws when any property is used, so a test fails only if the code actually touches a dependency it did not list.
