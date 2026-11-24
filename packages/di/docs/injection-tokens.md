# Injection Tokens

An injection token names a dependency that is not a class: an interface, a configuration value, or one of several implementations.

## Overview

- A token is identified by the token object itself. The name is used only in error messages, so two tokens with the same name are two different tokens.
- A token may carry a schema. Such a token takes args, the args are validated on every resolution, and each distinct args value has its own instance.
- A token may have one default provider, set with `@Injectable({ token })` or `@Factory({ token })`. A container can replace it with `provide()`.

Every class registered with `@Injectable()` has a token of its own, which is why a class can be used wherever a token is accepted.

## Basic Usage

### Creating Injection Tokens

```ts
import { InjectionToken } from '@navios/di'

interface Logger {
  log(message: string): void
}

// A name can be a string or a symbol
const LOGGER = InjectionToken.create<Logger>('Logger')
const AUDIT_LOGGER = InjectionToken.create<Logger>(Symbol('AuditLogger'))
```

Create a token once, at module level, and export it. Calling `InjectionToken.create()` twice gives two unrelated tokens.

### Using Injection Tokens

```ts
import { Container, inject, Injectable } from '@navios/di'

@Injectable({ token: LOGGER })
class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(message)
  }
}

@Injectable()
class UserService {
  private readonly logger = inject(LOGGER)

  createUser(name: string) {
    this.logger.log(`Creating ${name}`)
  }
}

const container = new Container()
const logger = await container.get(LOGGER)
```

## Token Types

### Basic Injection Token

A token without a schema takes no args and resolves to one value per scope of its provider.

```ts
const API_URL = InjectionToken.create<string>('ApiUrl')

const container = new Container({
  providers: [provide(API_URL, { value: 'https://api.example.com' })],
})

const url = await container.get(API_URL)
```

### Token with Schema

```ts
import { Container, Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const CONFIG = InjectionToken.create<ConfigService, typeof configSchema>('Config', configSchema)

@Injectable({ token: CONFIG })
class ConfigService {
  constructor(private readonly config: z.output<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }
}

const container = new Container()
const config = await container.get(CONFIG, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})
```

The args type accepted by `get()` and `inject()` is the input type of the schema. The constructor receives the output type, after defaults and transforms.

Invalid args fail with a `DIError` with code `TokenValidationError`. The issues reported by the schema are in `error.context.issues`.

#### Standard Schema

The schema can come from any library that implements [Standard Schema](https://standardschema.dev). `@navios/di` does not depend on a schema library.

```ts
// zod
import { z } from 'zod'
const zodSchema = z.object({ url: z.string() })

// valibot
import * as v from 'valibot'
const valibotSchema = v.object({ url: v.string() })

// arktype
import { type } from 'arktype'
const arktypeSchema = type({ url: 'string' })

const A = InjectionToken.create<Client, typeof zodSchema>('A', zodSchema)
const B = InjectionToken.create<Client, typeof valibotSchema>('B', valibotSchema)
const C = InjectionToken.create<Client, typeof arktypeSchema>('C', arktypeSchema)
```

Args must validate synchronously, because resolution is synchronous. A schema whose validation returns a promise, for example one with an async refinement, is rejected with `TokenValidationError`.

#### Instance identity

Instances are stored by the validated args. The args are compared by value: key order does not matter, and nested values are compared in full.

```ts
const a = await container.get(CONFIG, { apiUrl: '/a', timeout: 1 })
const b = await container.get(CONFIG, { timeout: 1, apiUrl: '/a' })
const c = await container.get(CONFIG, { apiUrl: '/c', timeout: 1 })

console.log(a === b) // true
console.log(a === c) // false
```

Values inside the args that are not plain objects or arrays, such as class instances and functions, are compared by identity.

### Bound Injection Token

A bound token carries its args, so it is resolved without any:

```ts
const PRODUCTION_CONFIG = InjectionToken.bound(CONFIG, {
  apiUrl: 'https://api.prod.com',
  timeout: 10000,
})

const config = await container.get(PRODUCTION_CONFIG)

@Injectable()
class ApiClient {
  private readonly config = inject(PRODUCTION_CONFIG)
}
```

A bound token resolves to the same instance as the base token with the same args.

### Factory Injection Token

A factory token computes its args:

```ts
const DYNAMIC_CONFIG = InjectionToken.factory(CONFIG, async (ctx) => {
  const env = await ctx.inject(EnvironmentService)
  return {
    apiUrl: env.getApiUrl(),
    timeout: env.getTimeout(),
  }
})

const config = await container.get(DYNAMIC_CONFIG)
```

The factory runs at most once per root container. The value is stored on the container, not on the token, so two containers compute it separately and a disposed container computes it again on next use. The factory always runs against the root container, even when the token is first resolved through a scope.

### Scope-only Token

A token can declare a scope without having a provider. Such a token is supplied per scope with `addInstance()`:

```ts
import { InjectableScope, InjectionToken } from '@navios/di'

interface RequestInfo {
  url: string
}

const REQUEST_INFO = InjectionToken.create<RequestInfo>('RequestInfo', {
  scope: InjectableScope.Request,
})

await using scope = container.createScope()
scope.addInstance(REQUEST_INFO, { url: '/users' })
```

Resolving it from the root container, or injecting it into a singleton, is a `ScopeMismatchError` instead of "not found". The options object also accepts `schema`.

## Advanced Patterns

### Multiple Implementations

A token has one default implementation. Other implementations are plain injectable classes, bound per container:

```ts
import { Container, Injectable, InjectionToken, provide } from '@navios/di'

interface PaymentProcessor {
  processPayment(amount: number): Promise<string>
}

const PAYMENT_PROCESSOR = InjectionToken.create<PaymentProcessor>('PaymentProcessor')

// The default
@Injectable({ token: PAYMENT_PROCESSOR })
class StripePaymentProcessor implements PaymentProcessor {
  async processPayment(amount: number) {
    return `Processed $${amount} via Stripe`
  }
}

// An alternative: no token here
@Injectable()
class PayPalPaymentProcessor implements PaymentProcessor {
  async processPayment(amount: number) {
    return `Processed $${amount} via PayPal`
  }
}

const container = new Container({
  providers: [provide(PAYMENT_PROCESSOR, PayPalPaymentProcessor)],
})

const processor = await container.get(PAYMENT_PROCESSOR) // PayPalPaymentProcessor
```

Decorating the second class with `@Injectable({ token: PAYMENT_PROCESSOR })` as well throws a `DIError` with code `ProviderConflict`.

When both implementations are needed in the same container, give each its own token.

### Token with Optional Schema

When the schema accepts `undefined`, the args are optional:

```ts
const optionsSchema = z
  .object({
    retries: z.number(),
  })
  .optional()

const CLIENT = InjectionToken.create<Client, typeof optionsSchema>('Client', optionsSchema)

@Injectable({ token: CLIENT })
class Client {
  constructor(private readonly options?: z.output<typeof optionsSchema>) {}
}

const withDefaults = await container.get(CLIENT)
const withRetries = await container.get(CLIENT, { retries: 3 })
```

### Optional Tokens

`optional()` returns `null` for a token that nothing provides:

```ts
const TRACER = InjectionToken.create<Tracer>('Tracer')

@Injectable()
class OrderService {
  private readonly tracer = optional(TRACER)
}
```

## Best Practices

### 1. Use descriptive token names

The name appears in error messages and dependency paths.

### 2. Define schemas for configuration tokens

A schema gives the args a type and validates them at the point of resolution.

### 3. Use bound tokens for fixed configuration

```ts
const DEV_CONFIG = InjectionToken.bound(CONFIG, { apiUrl: 'http://localhost:3000', timeout: 1000 })
const PROD_CONFIG = InjectionToken.bound(CONFIG, { apiUrl: 'https://api.prod.com', timeout: 10000 })
```

### 4. Use factory tokens for computed configuration

```ts
const ENV_CONFIG = InjectionToken.factory(CONFIG, () => ({
  apiUrl: process.env.API_URL ?? 'http://localhost:3000',
  timeout: Number(process.env.TIMEOUT ?? 5000),
}))
```

### 5. Export tokens from one module

A token must be the same object everywhere it is used. Keep related tokens in one file and import them from there.

## API Reference

### InjectionToken.create

```ts
static create<T>(name: string | symbol): InjectionToken<T, undefined>
static create<T, Schema>(name: string | symbol, schema: Schema): InjectionToken<T, Schema>
static create<T>(name: string | symbol, options: { scope?: InjectableScope }): InjectionToken<T, undefined>
static create<T, Schema>(
  name: string | symbol,
  options: { scope?: InjectableScope; schema: Schema },
): InjectionToken<T, Schema>
```

### InjectionToken.bound

```ts
static bound<T, S>(token: InjectionToken<T, S>, value: InferInput<S>): BoundInjectionToken<T, S>
```

### InjectionToken.factory

```ts
static factory<T, S>(
  token: InjectionToken<T, S>,
  factory: (ctx: FactoryContext) => Promise<InferInput<S>> | InferInput<S>,
): FactoryInjectionToken<T, S>
```

### InjectionToken.refineType

```ts
static refineType<T>(token: BoundInjectionToken<any, any>): BoundInjectionToken<T, any>
```

Changes the resolved type of a bound token without changing the token.

### Token Types

- `InjectionToken<T, S>` - a token for type `T` with an optional schema `S`. Properties: `name`, `schema`, `scope`. `toString()` returns the name.
- `BoundInjectionToken<T, S>` - a token with fixed args. Properties: `token`, `value`.
- `FactoryInjectionToken<T, S>` - a token whose args are computed. Properties: `token`, `factory`.
- `InjectionTokenSchemaType` - an alias of `StandardSchemaV1`.
- `InferInput<S>`, `InferOutput<S>` - the input and output types of a schema.
