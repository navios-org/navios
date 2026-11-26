---
title: Providers
---

# Providers

A provider tells a container how to produce the value for a token. `@Injectable()` and `@Factory()` attach a default provider to their token. This page covers the other half: what a container can be told on top of the defaults.

## provide

`provide(target, implementation)` creates a binding. Hand a list of them to the container:

```ts
import { Container, InjectableScope, provide } from '@navios/di'

// DatabaseService comes from the quick start; the names in capitals are tokens
const container = new Container({
  providers: [
    provide(DatabaseService, InMemoryDatabase),
    provide(MAILER, { class: SesMailer, scope: InjectableScope.Transient }),
    provide(CLOCK, { value: { now: () => 0 } }),
    provide(USER_STORE, { existing: DatabaseService }),
    provide(FEATURE_FLAGS, {
      factory: async (ctx) => {
        const db = await ctx.inject(DatabaseService)
        return loadFlags(db)
      },
    }),
  ],
})
```

The target is a token or a decorated class. A class that is not registered throws `ClassNotInjectable`. The implementation takes one of five forms:

| Form                           | Produces                                                      | Scope                                                                    |
| ------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `SomeClass`                    | `new SomeClass()`, with `inject()` available inside           | The scope of the token's default provider, else the [token's scope](/docs/di/essentials/tokens#tokens-that-declare-a-scope), else the scope `SomeClass` was registered with, else singleton |
| `{ class: SomeClass, scope? }` | The same, with an explicit scope                              | `scope`, else as above                                                   |
| `{ value }`                    | The value as it is, including `null`, `0` and `''`            | The scope of the token's default provider, else the token's scope, else singleton |
| `{ factory, scope? }`          | The return value of `factory(ctx, args)`; it may be a promise | `scope`, else as for `{ value }`                                         |
| `{ existing }`                 | What another class or token resolves to                       | That of the other one                                                    |

The implementation has to fit the target: what it produces must have the public members of the target's type. Private members do not count, so a mock is a plain class or object.

The implementation class does not need a decorator of its own. If it is a [`@Factory`](/docs/di/essentials/factories) class, its `create()` result is used. The function form is described under [function providers](/docs/di/essentials/factories#function-providers).

A provider only affects the container it was given to. The token's default is untouched, so two containers in one process can wire the same class differently.

### Aliases

`{ existing }` gives an instance a second name. Both names resolve to the same object with one lifecycle: it is built once, destroyed once, listed once in `instances()`, and invalidating it reaches everything that injected it under either name. Arguments are passed on. An alias has no instances of its own, so it cannot be decorated; decorate what it points to. It counts as resolved once something was asked for by its name.

## container.provide

`container.provide(target, implementation)` adds a binding to an existing container. It takes the same arguments as `provide()`.

```ts
const container = new Container()

container.provide(DatabaseService, InMemoryDatabase)

const db = await container.get(DatabaseService) // InMemoryDatabase
```

It must be called before the token is first resolved in that container. Afterwards it throws, because an instance built from the old provider may already be held by other services.

## registerProvider

`registerProvider(token, implementation)` sets the default provider of a token from the same forms. Use it where a decorator does not fit: a token whose default is a value or a function.

```ts
import { InjectionToken, registerProvider } from '@navios/di'

export const CLOCK = InjectionToken.create<{ now(): number }>('Clock')

registerProvider(CLOCK, { value: { now: () => Date.now() } })
```

A token has one default. A second, different one throws `ProviderConflict`, whichever way it is registered. A class or a factory takes a scope of its own as `{ class, scope }` or `{ factory, scope }`.

Outside production (`NODE_ENV`) a second provider of the same form replaces the first instead: hot reload evaluates a module again, and each time with new functions and values. A warning names the token when the two do not look alike.

## Lookup order

For a token, a container uses the first of:

1. An instance it already holds, including one stored with `addInstance()`.
2. A provider given to this container, through `providers` or `container.provide()`.
3. The default provider on the token.

When none exists, resolution fails with a `DIError` with code `ProviderNotFound` and the path that led to the token. [`optional()`](/docs/di/essentials/services#optional) returns `null` in that case instead.

A [scope](/docs/di/essentials/scopes) looks in its own instances first and then continues with its root container. Providers always belong to the root.

## addInstance

`addInstance(target, value)` stores a ready value. Nothing is constructed and no provider is involved.

```ts
import { Container, InjectionToken } from '@navios/di'

const STARTED_AT = InjectionToken.create<Date>('StartedAt')

const container = new Container()
container.addInstance(STARTED_AT, new Date())
```

How it differs from `provide(token, { value })`:

|                         | `provide(token, { value })`          | `addInstance(token, value)`                              |
| ----------------------- | ------------------------------------ | -------------------------------------------------------- |
| When it can be called   | Before the token is first resolved   | Any time the token has no instance                       |
| Works on a scope        | No                                   | Yes: the value belongs to that scope                     |
| After `invalidate()`    | The value is produced again          | The value is gone                                        |
| `onServiceDestroy` on the value | Not called                   | Called when the container or scope is disposed           |

Rules for the target:

- A token whose arguments are required cannot be used directly; that throws `TokenSchemaRequiredError`. Pass a [bound token](/docs/di/essentials/tokens#bound-tokens) so the value has an address.
- A class must be registered with `@Injectable()`.
- A request-scoped token or class takes its value in a scope. `addInstance()` on the root throws `ScopeMismatchError` for it.
- Adding a second instance for the same token and arguments throws. Invalidate the first one before replacing it.

## Decorating instances

`container.decorate(target, fn)` wraps every instance the container builds for a token. The function receives the finished instance and returns what the container should store. It is not applied to a `{ value }` provider or to a value stored with `addInstance()`.

```ts
// UserService comes from the quick start
container.decorate(UserService, (users, info) => {
  const wrapped = Object.create(users) as UserService
  wrapped.getUser = (id) => {
    console.log('getUser', id)
    return users.getUser(id)
  }
  return wrapped
})
```

It runs after construction and `onServiceInit`, and before the instance is stored, so no other service ever sees the undecorated one. `info` holds the `token` and the validated `args`.

Several decorators for one token run in the order they were added. Like `provide()`, `decorate()` throws once the token is resolved. Unlike a provider, a decorator keeps the original implementation and adds to it, which suits logging, tracing and metrics.

## Strict containers

`new Container({ strict: true })` ignores step 3 of the lookup order. Only instances and providers given to that container resolve; every other token fails with `ProviderNotFound`, however deep in the graph it is requested.

```ts
const container = new Container({
  strict: true,
  providers: [provide(UserService, UserService), provide(DatabaseService, InMemoryDatabase)],
})
```

`provide(UserService, UserService)` lists a class as itself. Strict mode is meant for unit tests that must not reach real services by accident; [`UnitTestContainer`](/docs/di/guides/testing#unittestcontainer) is built on it.

## Inspecting a provider

`container.getProvider(target)` returns the provider the container would use, or `undefined`. `container.isRegistered(target)` answers whether the token has an instance or a provider at all.

```ts
const info = container.getProvider(DatabaseService)

info?.kind // 'class' | 'factory' | 'function' | 'value' | 'existing'
info?.scope // InjectableScope
info?.target // the class, for 'class' and 'factory'
```

Neither call builds anything.
