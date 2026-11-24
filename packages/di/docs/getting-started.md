# Getting Started

This guide covers installation, basic setup and a first dependency injection example.

## Installation

```bash
# npm
npm install @navios/di

# yarn
yarn add @navios/di

# pnpm
pnpm add @navios/di
```

`@navios/di` has no runtime dependencies. Install a schema library only if you want tokens with args; any library that implements [Standard Schema](https://standardschema.dev) works (zod, valibot, arktype and others).

## Prerequisites

- TypeScript 5 or newer, for Stage 3 decorators. `await using` needs TypeScript 5.2 or newer.
- A project that targets ES2022 or newer.

## Basic Setup

### 1. Make sure legacy decorators are disabled

`@Injectable` and `@Factory` are Stage 3 decorators. Your `tsconfig.json` must not enable `experimentalDecorators`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node16"
  }
}
```

If the project has to keep `experimentalDecorators`, import the decorators from `@navios/di/legacy-compat` instead. Everything else is imported from `@navios/di`.

### 2. Import the library

```ts
import { Container, inject, Injectable } from '@navios/di'
```

## Your First Example

A user service that depends on an email service:

```ts
import { Container, inject, Injectable } from '@navios/di'

// 1. Create an email service
@Injectable()
class EmailService {
  async sendEmail(to: string, subject: string, body: string) {
    console.log(`Sending email to ${to}: ${subject}`)
    return { success: true }
  }
}

// 2. Create a user service that depends on the email service
@Injectable()
class UserService {
  private readonly emailService = inject(EmailService)

  async createUser(name: string, email: string) {
    await this.emailService.sendEmail(email, 'Welcome!', `Hello ${name}!`)
    return { id: crypto.randomUUID(), name, email }
  }
}

// 3. Use the services
async function main() {
  const container = new Container()

  // EmailService is built while UserService is constructed
  const userService = await container.get(UserService)

  const user = await userService.createUser('Alice', 'alice@example.com')
  console.log('Created user:', user)

  await container.dispose()
}

main().catch(console.error)
```

## Understanding the Example

### Service Registration

The `@Injectable()` decorator registers the class so that a container can build it:

```ts
@Injectable()
class EmailService {
  // Service implementation
}
```

### Dependency Injection

`inject()` returns the instance of a dependency. Call it in a field initialiser or in the constructor:

```ts
@Injectable()
class UserService {
  private readonly emailService = inject(EmailService)
}
```

If `EmailService` does not exist yet, it is constructed at that point, inside the constructor of `UserService`.

### Container Usage

The `Container` builds and stores instances:

```ts
const container = new Container()
const userService = await container.get(UserService)
```

`get()` returns a promise because a service may have an asynchronous `onServiceInit()`. When nothing in the dependency tree is asynchronous, `getSync()` returns the instance directly:

```ts
const userService = container.getSync(UserService)
```

## Other Injection Functions

### Optional Injection

`optional()` returns `null` when nothing provides the token:

```ts
@Injectable()
class UserService {
  private readonly metrics = optional(MetricsToken)

  createUser(name: string) {
    this.metrics?.increment('users.created')
  }
}
```

### Asynchronous Injection

`asyncInject()` returns a promise of the dependency. It exists to break a circular dependency; see [Troubleshooting](#troubleshooting).

## Service Scopes

### Singleton (Default)

One instance per container:

```ts
@Injectable() // same as @Injectable({ scope: InjectableScope.Singleton })
class SingletonService {}

const service1 = await container.get(SingletonService)
const service2 = await container.get(SingletonService)
console.log(service1 === service2) // true
```

### Transient

A new instance for each injection and each `get()`:

```ts
import { InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Transient })
class TransientService {}

const service1 = await container.get(TransientService)
const service2 = await container.get(TransientService)
console.log(service1 === service2) // false
```

### Request

One instance per scope created with `container.createScope()`:

```ts
@Injectable({ scope: InjectableScope.Request })
class RequestState {}

await using scope = container.createScope()
const state = await scope.get(RequestState)
```

See [Scopes](./scopes.md) and [Scoped Containers](./request-contexts.md).

## Next Steps

- **[Container](./container.md)** - The Container API and providers
- **[Injectable Decorator](./injectable.md)** - Service registration in detail
- **[Factory Decorator](./factory.md)** - Factory classes
- **[Injection Tokens](./injection-tokens.md)** - Tokens and args
- **[Service Lifecycle](./lifecycle.md)** - Initialization and cleanup hooks

## Common Patterns

### Configuration Service

```ts
import { Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const CONFIG_TOKEN = InjectionToken.create<ConfigService, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private readonly config: z.output<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }

  getTimeout() {
    return this.config.timeout
  }
}

const config = await container.get(CONFIG_TOKEN, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})
```

### Service with Lifecycle

```ts
import { Injectable } from '@navios/di'

import type { OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: { close(): Promise<void> } | null = null

  async onServiceInit() {
    this.connection = await this.connect()
  }

  async onServiceDestroy() {
    await this.connection?.close()
  }

  private async connect() {
    return { close: async () => {} }
  }
}
```

### Replacing a Service in a Test

```ts
import { Container, provide } from '@navios/di'

const container = new Container({
  providers: [provide(EmailService, FakeEmailService)],
})
```

## Troubleshooting

**Decorators do not work.**

- Make sure `experimentalDecorators` is not enabled, or import the decorators from `@navios/di/legacy-compat`.
- Use TypeScript 5 or newer.

**`Circular dependency detected: ServiceA -> ServiceB -> ServiceA`.**

Two services inject each other with `inject()`:

```ts
@Injectable()
class ServiceA {
  private readonly serviceB = inject(ServiceB)
}

@Injectable()
class ServiceB {
  private readonly serviceA = inject(ServiceA)
}
```

Use `asyncInject()` on one side:

```ts
@Injectable()
class ServiceA {
  private readonly serviceB = asyncInject(ServiceB)

  async doSomething() {
    const b = await this.serviceB
    return b.process()
  }
}
```

**`Factory X not found`.**

Nothing provides the token. Decorate the class with `@Injectable()`, give the token a default implementation with `@Injectable({ token })`, or bind one with `provide()`. A class is registered when its module is evaluated, so the module must be imported.

**`Class X is not decorated with @Injectable.`**

The class passed to `get()` or `inject()` was never registered. An undecorated subclass of an injectable class is not injectable.

**`Scope mismatch: X is request-scoped and cannot be resolved from the root container`.**

A request-scoped service was requested from the root container or injected into a singleton. Resolve it from a scope, and make the consumer request-scoped. See [Scopes](./scopes.md#scope-rules).

**`X or one of its dependencies has an asynchronous initializer and cannot be resolved synchronously`.**

`getSync()` was used while an asynchronous `onServiceInit()` was still pending. Use `await container.get()` instead, or call `await container.ready()` first.

**`Trying to access X before it's initialized`.**

A constructor read a property of an injected service that has an unfinished asynchronous `onServiceInit()`. Move that code to `onServiceInit()`.
