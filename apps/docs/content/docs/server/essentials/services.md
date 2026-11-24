---
title: Services and injection
---

# Services and injection

A service is a class that holds logic controllers should not: data access, calls to other systems, business rules. Navios wires services with [`@navios/di`](/docs/di/), and `@navios/core` re-exports all of it, so server code imports `Injectable`, `inject` and `provide` from `@navios/core`.

This page covers what a server developer uses every day. The DI section covers the rest: [tokens](/docs/di/essentials/tokens), [providers](/docs/di/essentials/providers), [scopes](/docs/di/essentials/scopes), [lifecycle](/docs/di/essentials/lifecycle) and [factories](/docs/di/essentials/factories).

## Declaring and injecting

`@Injectable()` makes a class resolvable. `inject(Class)` in a field initialiser asks for an instance.

```ts title="signup.service.mts"
import { inject, Injectable } from '@navios/core'

// UsersService comes from the Quick start
@Injectable()
export class Mailer {
  async sendWelcome(email: string) {
    console.log(`Welcome mail to ${email}`)
  }
}

@Injectable()
export class SignupService {
  private readonly users = inject(UsersService)
  private readonly mailer = inject(Mailer)

  async signUp(input: { name: string; email: string }) {
    const user = this.users.create(input)
    await this.mailer.sendWelcome(user.email)
    return user
  }
}
```

A controller injects a service the same way:

```ts
@Controller()
export class UsersController {
  private readonly signup = inject(SignupService)

  @Endpoint(createUser)
  async createUser({ data }: HandlerParams<typeof createUser>) {
    return reply(201, await this.signup.signUp(data))
  }
}
```

Three things to know:

- **There is no registration step.** A service is not listed in a module. Importing the class is enough, and the container creates it the first time something injects it.
- **`inject()` works in field initialisers and constructors**, while the container is building the instance. It cannot be called later from a method.
- **Guards, interceptors and modules are services too.** They are `@Injectable()` classes (a module through `@Module`) and use `inject()` exactly like this.

Outside a class, resolve a service from the application with `await app.get(UsersService)`.

## Scopes in a server

A scope says how long an instance lives. `@Injectable()` without options is a singleton.

| Scope                       | One instance per           | Use in a server                                                                   |
| --------------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| `InjectableScope.Singleton` | application                | The default. Controllers, guards, interceptors and nearly every service           |
| `InjectableScope.Transient` | `inject()` call            | A small stateful helper that each owner wants its own copy of                     |
| `InjectableScope.Request`   | request                    | A class that must be constructed per request. Reached through `ctx.use()`         |

```ts
import { Injectable, InjectableScope } from '@navios/core'

@Injectable({ scope: InjectableScope.Transient })
export class Stopwatch {
  private readonly started = performance.now()

  elapsed() {
    return performance.now() - this.started
  }
}
```

Because controllers, guards and interceptors are singletons, the same instance serves every request, including concurrent ones. Do not keep per-request data in a field of a singleton.

A singleton cannot inject a request-scoped service: the application fails at `init()` with a scope mismatch error that names the path, for example `UsersController -> UnitOfWork`. Most per-request data (the current user, a tenant, a transaction) does not need a request-scoped class at all. [Per-request state](/docs/server/guides/request-state) describes the cheaper tools and when a request-scoped service is the right one.

## Providers at a glance

A provider says what a token or a class resolves to. Use one to swap an implementation or to supply a value that is not a class. `provide(target, implementation)` creates it, and the `providers` option of a module or of the application registers it.

```ts
import { InjectionToken, Module, provide } from '@navios/core'

export const MailFrom = InjectionToken.create<string>('MailFrom')

@Module({
  controllers: [UsersController],
  providers: [
    provide(Mailer, SesMailer), // a class in place of another
    provide(MailFrom, { value: 'hello@example.com' }), // a value
  ],
})
export class AppModule {}
```

Anything can then `inject(Mailer)` and receive a `SesMailer`, or `inject(MailFrom)` and receive the string.

Providers are application-wide wherever they are listed; a module does not keep them private. Providers passed to `NaviosFactory.create` win over those of every module, which is how [tests replace dependencies](/docs/server/essentials/testing#replacing-dependencies):

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  providers: [provide(Mailer, FakeMailer)],
})
```

The other provider forms (factories, explicit scopes) and the lookup order are in [Providers](/docs/di/essentials/providers).

## Start-up and shutdown work

A service that needs to open a connection or flush a buffer implements `onServiceInit()` and `onServiceDestroy()`; see [Lifecycle](/docs/di/essentials/lifecycle). Hooks tied to the application rather than to one service are on [Application setup](/docs/server/essentials/application#bootstrap-and-shutdown-hooks).
