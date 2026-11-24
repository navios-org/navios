---
title: Services and injection
---

# Services and injection

A service is a class marked `@Injectable()`. This page covers the decorator's options and the three functions a service uses to reach its dependencies.

## @Injectable

```ts
import { Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Transient })
class RequestTimer {
  readonly startedAt = Date.now()
}
```

| Option   | Default     | Purpose                                                                                                                              |
| -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `scope`  | `Singleton` | How long an instance lives. See [Scopes](/docs/di/essentials/scopes)                                                                 |
| `token`  | —           | Register the class as the default provider of an existing [token](/docs/di/essentials/tokens) instead of creating one for the class  |
| `schema` | —           | A schema for a constructor argument. Cannot be combined with `token`; a token brings its own schema                                  |

The decorator attaches a token to the class and records the class as that token's default provider. It does not create anything. Instances are built by a container, on first use.

### Implementing a token

With `token`, the class becomes the default implementation of something declared elsewhere, usually an interface:

```ts
import { Injectable, InjectionToken } from '@navios/di'

interface Mailer {
  send(to: string, subject: string): Promise<void>
}

export const MAILER = InjectionToken.create<Mailer>('Mailer')

@Injectable({ token: MAILER })
class SmtpMailer implements Mailer {
  async send(to: string, subject: string) {
    // talk to the SMTP server
  }
}
```

`inject(MAILER)` now returns an `SmtpMailer`, typed as `Mailer`. The decorator checks that the class matches the token's type.

A token has one default. A second class declaring `token: MAILER` throws a `DIError` with code `ProviderConflict` when it is decorated. Register alternatives with plain `@Injectable()` and select one per container with [`provide()`](/docs/di/essentials/providers#provide).

### Constructor arguments

A service can take one constructor argument, described by a schema. The caller passes the argument when resolving, and the container validates it before constructing:

```ts
import { Injectable } from '@navios/di'
import { z } from 'zod/v4'

const clientOptions = z.object({
  baseUrl: z.url(),
  timeout: z.number().positive(),
})

@Injectable({ schema: clientOptions })
class ApiClient {
  constructor(private readonly options: z.output<typeof clientOptions>) {}
}

const client = await container.get(ApiClient, {
  baseUrl: 'https://api.example.com',
  timeout: 5_000,
})
```

The container keeps one instance per distinct argument value. [Tokens with a schema](/docs/di/essentials/tokens#tokens-with-a-schema) explains validation and instance identity; the rules are the same for a class and for a token.

When a class is resolved directly, the argument is typed as the constructor parameter, which is the schema's output. A schema with defaults or transforms is better served by a token: callers of a token pass the schema's input type.

## inject

`inject()` returns the instance of a dependency. If it does not exist yet, it is built right there.

```ts
// DatabaseService comes from the quick start
@Injectable()
class AuditLog {
  private readonly db = inject(DatabaseService)
  private readonly mailer = inject(MAILER)
  private readonly client = inject(ApiClient, { baseUrl: 'https://audit.example.com', timeout: 1_000 })
}
```

It accepts a class, a token, and a second argument for anything that takes one. The return type is inferred from the first argument.

`inject()`, `optional()` and `asyncInject()` only work while the container is constructing a class: in a field initialiser or in the constructor body. Called anywhere else, such as in a method or at module level, they throw. To resolve something later, inject the container itself and call `get()` on it:

```ts
import { Container, inject, Injectable } from '@navios/di'

@Injectable()
class JobRunner {
  private readonly container = inject(Container)

  async run(job: new () => { execute(): Promise<void> }) {
    const instance = await this.container.get(job)
    await instance.execute()
  }
}
```

Calls can be conditional, because dependencies are found by running the constructor:

```ts
@Injectable()
class Storage {
  private readonly backend = process.env.S3_BUCKET ? inject(S3Backend) : inject(DiskBackend)
}
```

Injecting a [transient](/docs/di/essentials/scopes#transient) gives each call its own instance.

:::warning
Store what `inject()` returns, but do not call methods on it inside the constructor. [Constructor replay](/docs/di/how-it-works#constructor-replay) explains why, and `onServiceInit` is the place for that code.
:::

## optional

`optional()` returns the instance, or `null` when nothing provides the token: no default provider, no provider on the container and no instance added to it.

```ts
import { Injectable, InjectionToken, optional } from '@navios/di'

interface Tracer {
  record(event: string): void
}

export const TRACER = InjectionToken.create<Tracer>('Tracer')

@Injectable()
class OrderService {
  private readonly tracer = optional(TRACER)

  placeOrder() {
    this.tracer?.record('order.placed')
  }
}
```

It does not catch errors. If a provider exists and fails, the failure propagates exactly as it would through `inject()`.

## asyncInject

`asyncInject()` returns a promise of the instance. The dependency starts resolving only after the current constructor has returned.

```ts
import { asyncInject, Injectable } from '@navios/di'

@Injectable()
class ReportService {
  private readonly users = asyncInject(UserService)

  async build(userId: string) {
    const users = await this.users
    return users.getUser(userId)
  }
}
```

Its one purpose is to break a cycle between two services on purpose. [Circular dependencies](/docs/di/guides/circular-dependencies) shows when that is the right call. Everywhere else, `inject()` is simpler and gives you the instance directly.

## Registering without decorators

`registerInjectable()` does what the decorator does, as a function call. Use it for classes you do not own or in code that avoids decorator syntax.

```ts
import { InjectableScope, registerInjectable } from '@navios/di'

class ThirdPartyClock {
  now() {
    return Date.now()
  }
}

registerInjectable(ThirdPartyClock, { scope: InjectableScope.Singleton })

const clock = await container.get(ThirdPartyClock)
```

It takes the same options as `@Injectable` and returns the token.
