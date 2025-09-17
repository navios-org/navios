# API Reference

Complete API reference for Navios DI library.

## Core Classes

### Container

The main entry point for dependency injection.

```typescript
class Container {
  constructor(registry?: Registry, logger?: Console | null)

  get<T>(token: T): Promise<InstanceType<T>>
  get<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: z.input<S>,
  ): Promise<T>
  get<T>(token: InjectionToken<T, undefined>): Promise<T>
  get<T>(token: BoundInjectionToken<T, any>): Promise<T>
  get<T>(token: FactoryInjectionToken<T, any>): Promise<T>

  invalidate(service: unknown): Promise<void>
  ready(): Promise<void>
  getServiceLocator(): ServiceLocator

  // Request Context Management
  beginRequest(
    requestId: string,
    metadata?: Record<string, any>,
    priority?: number,
  ): RequestContextHolder
  endRequest(requestId: string): Promise<void>
  setCurrentRequestContext(requestId: string): void
}
```

**Constructor Parameters:**

- `registry?: Registry` - Optional registry instance (defaults to global registry)
- `logger?: Console | null` - Optional logger for debugging

**Methods:**

- `get<T>(token: T)` - Get a service instance
- `invalidate(service: unknown)` - Invalidate a service and its dependencies
- `ready()` - Wait for all pending operations to complete
- `getServiceLocator()` - Get the underlying ServiceLocator instance

**Request Context Management:**

- `beginRequest(requestId: string, metadata?: Record<string, any>, priority?: number)` - Begin a new request context
- `endRequest(requestId: string)` - End a request context and clean up instances
- `setCurrentRequestContext(requestId: string)` - Switch to a different request context

### InjectionToken

Token-based dependency resolution.

```typescript
class InjectionToken<
  T,
  S extends InjectionTokenSchemaType | unknown = unknown,
  Required extends boolean = S extends ZodOptional<ZodObject>
    ? false
    : S extends ZodOptional<ZodRecord>
      ? false
      : S extends ZodObject
        ? true
        : S extends ZodRecord
          ? true
          : false,
> {
  public id: string
  public readonly name: string | symbol | ClassType
  public readonly schema: ZodObject | undefined

  constructor(name: string | symbol | ClassType, schema: ZodObject | undefined)

  static create<T extends ClassType>(
    name: T,
  ): InjectionToken<InstanceType<T>, undefined>
  static create<T extends ClassType, Schema extends InjectionTokenSchemaType>(
    name: T,
    schema: Schema,
  ): Schema['_def']['type'] extends 'ZodOptional'
    ? InjectionToken<InstanceType<T>, Schema, false>
    : InjectionToken<InstanceType<T>, Schema, true>
  static create<T>(name: string | symbol): InjectionToken<T, undefined>
  static create<T, Schema extends InjectionTokenSchemaType>(
    name: string | any,
    schema: Schema,
  ): InjectionToken<T, Schema>

  static bound<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    value: z.input<S>,
  ): BoundInjectionToken<T, S>
  static factory<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    factory: () => Promise<z.input<S>>,
  ): FactoryInjectionToken<T, S>
  static refineType<T>(
    token: BoundInjectionToken<any, any>,
  ): BoundInjectionToken<T, any>

  toString(): string
}
```

**Static Methods:**

- `create<T>(name: string | symbol)` - Create a simple injection token
- `create<T, S>(name: string | symbol, schema: S)` - Create a token with schema
- `bound<T, S>(token: InjectionToken<T, S>, value: z.input<S>)` - Create a bound token
- `factory<T, S>(token: InjectionToken<T, S>, factory: (ctx: FactoryContext) => Promise<z.input<S>>)` - Create a factory token

### BoundInjectionToken

Pre-configured injection token.

```typescript
class BoundInjectionToken<T, S extends InjectionTokenSchemaType> {
  public id: string
  public name: string | symbol | ClassType
  public schema: InjectionTokenSchemaType

  constructor(token: InjectionToken<T, S>, value: z.input<S>)

  toString(): string
}
```

### FactoryInjectionToken

Dynamically resolved injection token.

```typescript
class FactoryInjectionToken<T, S extends InjectionTokenSchemaType> {
  public value?: z.input<S>
  public resolved: boolean
  public id: string
  public name: string | symbol | ClassType
  public schema: InjectionTokenSchemaType

  constructor(token: InjectionToken<T, S>, factory: () => Promise<z.input<S>>)

  resolve(): Promise<z.input<S>>
  toString(): string
}
```

## Decorators

### Injectable

Mark a class as injectable service.

```typescript
function Injectable(): <T extends ClassType>(
  target: T,
  context?: ClassDecoratorContext,
) => T
function Injectable(options: {
  scope?: InjectableScope
  registry: Registry
}): <T extends ClassType>(target: T, context?: ClassDecoratorContext) => T
function Injectable(options: {
  scope: InjectableScope
}): <T extends ClassType>(target: T, context?: ClassDecoratorContext) => T
function Injectable<Type, Schema>(options: {
  scope?: InjectableScope
  token: InjectionToken<Type, Schema>
  registry?: Registry
}): Schema extends BaseInjectionTokenSchemaType
  ? Type extends undefined
    ? <T extends ClassTypeWithArgument<z.output<Schema>>>(
        target: T,
        context?: ClassDecoratorContext,
      ) => T
    : <T extends ClassTypeWithInstanceAndArgument<Type, z.output<Schema>>>(
        target: T,
        context?: ClassDecoratorContext,
      ) => T
  : Schema extends OptionalInjectionTokenSchemaType
    ? Type extends undefined
      ? <T extends ClassTypeWithOptionalArgument<z.output<Schema>>>(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
      : <
          T extends ClassTypeWithInstanceAndOptionalArgument<
            Type,
            z.output<Schema>
          >,
        >(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
    : Schema extends undefined
      ? <R extends ClassTypeWithInstance<Type>>(
          target: R,
          context?: ClassDecoratorContext,
        ) => R
      : never
```

**Options:**

- `scope?: InjectableScope` - Service scope (default: Singleton)
- `token?: InjectionToken<any, any>` - Custom injection token
- `registry?: Registry` - Custom registry

### Factory

Mark a class as factory service.

```typescript
function Factory<R>(options?: {
  scope?: InjectableScope
  registry?: Registry
}): <T extends ClassTypeWithInstance<Factorable<R>>>(
  target: T,
  context?: ClassDecoratorContext,
) => T
function Factory<R, S>(options: {
  scope?: InjectableScope
  token: InjectionToken<R, S>
  registry?: Registry
}): R extends undefined
  ? never
  : S extends InjectionTokenSchemaType
    ? <T extends ClassTypeWithInstance<FactorableWithArgs<R, S>>>(
        target: T,
        context?: ClassDecoratorContext,
      ) => T
    : S extends undefined
      ? <T extends ClassTypeWithInstance<Factorable<R>>>(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
      : never
```

**Options:**

- `scope?: InjectableScope` - Factory scope (default: Singleton)
- `token?: InjectionToken<any, any>` - Custom injection token
- `registry?: Registry` - Custom registry

## Enums

### InjectableScope

Service lifetime scope.

```typescript
enum InjectableScope {
  Singleton = 'Singleton', // One instance shared across the application
  Transient = 'Transient', // New instance created for each injection
  Request = 'Request', // One instance per request context
}
```

### InjectableType

Service type.

```typescript
enum InjectableType {
  Class = 'Class', // Regular service class
  Factory = 'Factory', // Factory service class
}
```

## Interfaces

### OnServiceInit

Service initialization hook.

```typescript
interface OnServiceInit {
  onServiceInit(): Promise<void> | void
}
```

### OnServiceDestroy

Service cleanup hook.

```typescript
interface OnServiceDestroy {
  onServiceDestroy(): Promise<void> | void
}
```

### Factorable

Factory interface for simple factories.

```typescript
interface Factorable<T> {
  create(): T
}
```

### FactorableWithArgs

Factory interface for factories with arguments.

```typescript
interface FactorableWithArgs<T, S> {
  create(args: z.input<S>): T
}
```

### FactoryContext

Context provided to factory methods.

```typescript
interface FactoryContext {
  inject<T>(token: T): Promise<T>
  locator: ServiceLocator
  on(event: string, listener: Function): void
  getDependencies(): any[]
  invalidate(): Promise<void>
  addEffect(effect: Function): void
  setTtl(ttl: number): void
  getTtl(): number | null
}
```

### RequestContextHolder

Request context holder for managing request-scoped instances.

```typescript
interface RequestContextHolder {
  readonly requestId: string
  readonly priority: number
  readonly createdAt: number
  readonly instances: Map<string, any>
  readonly metadata: Map<string, any>

  addInstance(
    instanceName: string,
    instance: any,
    holder: ServiceLocatorInstanceHolder,
  ): void
  getInstance(instanceName: string): any | undefined
  hasInstance(instanceName: string): boolean
  clear(): void
  getMetadata(key: string): any | undefined
  setMetadata(key: string, value: any): void
}
```

## Functions

### asyncInject

Asynchronous dependency injection.

```typescript
function asyncInject<T extends ClassType>(
  token: T,
): InstanceType<T> extends Factorable<infer R>
  ? Promise<R>
  : Promise<InstanceType<T>>
function asyncInject<T, S extends InjectionTokenSchemaType>(
  token: InjectionToken<T, S>,
  args: z.input<S>,
): Promise<T>
function asyncInject<T, S extends InjectionTokenSchemaType, R extends boolean>(
  token: InjectionToken<T, S, R>,
): R extends false
  ? Promise<T>
  : S extends ZodType<infer Type>
    ? `Error: Your token requires args: ${Join<UnionToArray<keyof Type>, ', '>}`
    : 'Error: Your token requires args'
function asyncInject<T>(token: InjectionToken<T, undefined>): Promise<T>
function asyncInject<T>(token: BoundInjectionToken<T, any>): Promise<T>
function asyncInject<T>(token: FactoryInjectionToken<T, any>): Promise<T>
```

### inject

Synchronous dependency injection (singleton only).

```typescript
function inject<T extends ClassType>(
  token: T,
): InstanceType<T> extends Factorable<infer R> ? R : InstanceType<T>
function inject<T, S extends InjectionTokenSchemaType>(
  token: InjectionToken<T, S>,
  args: z.input<S>,
): T
function inject<T, S extends InjectionTokenSchemaType, R extends boolean>(
  token: InjectionToken<T, S, R>,
): R extends false
  ? T
  : S extends ZodType<infer Type>
    ? `Error: Your token requires args: ${Join<UnionToArray<keyof Type>, ', '>}`
    : 'Error: Your token requires args'
function inject<T>(token: InjectionToken<T, undefined>): T
function inject<T>(token: BoundInjectionToken<T, any>): T
function inject<T>(token: FactoryInjectionToken<T, any>): T
```

## Types

### ClassType

Base class type.

```typescript
type ClassType = new (...args: any[]) => any
```

### ClassTypeWithArgument

Class type with required argument.

```typescript
type ClassTypeWithArgument<Arg> = new (arg: Arg) => any
```

### ClassTypeWithOptionalArgument

Class type with optional argument.

```typescript
type ClassTypeWithOptionalArgument<Arg> = new (arg?: Arg) => any
```

### ClassTypeWithInstance

Class type with specific instance type.

```typescript
type ClassTypeWithInstance<T> = new (...args: any[]) => T
```

### ClassTypeWithInstanceAndArgument

Class type with instance and required argument.

```typescript
type ClassTypeWithInstanceAndArgument<T, Arg> = new (arg: Arg) => T
```

### ClassTypeWithInstanceAndOptionalArgument

Class type with instance and optional argument.

```typescript
type ClassTypeWithInstanceAndOptionalArgument<T, Arg> = new (arg?: Arg) => T
```

### InjectionTokenSchemaType

Schema type for injection tokens.

```typescript
type InjectionTokenSchemaType =
  | BaseInjectionTokenSchemaType
  | OptionalInjectionTokenSchemaType
```

### BaseInjectionTokenSchemaType

Base schema type.

```typescript
type BaseInjectionTokenSchemaType = ZodObject | ZodRecord
```

### OptionalInjectionTokenSchemaType

Optional schema type.

```typescript
type OptionalInjectionTokenSchemaType =
  | ZodOptional<ZodObject>
  | ZodOptional<ZodRecord>
```

### AnyInjectableType

Union of all injectable types.

```typescript
type AnyInjectableType =
  | ClassType
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | FactoryInjectionToken<any, any>
```

### InjectionTokenType

Union of injection token types.

```typescript
type InjectionTokenType =
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | FactoryInjectionToken<any, any>
```

## Scope Compatibility

### Injection Method Compatibility

| Scope     | inject           | asyncInject  |
| --------- | ---------------- | ------------ |
| Singleton | ✅ Supported     | ✅ Supported |
| Transient | ❌ Not Supported | ✅ Supported |
| Request   | ✅ Supported     | ✅ Supported |

**Note:** The `inject` function only works with Singleton and Request scopes because it requires synchronous resolution. Transient services must use `asyncInject` since they create new instances on each injection.

## Error Classes

### InstanceNotFoundError

Thrown when a service instance is not found.

```typescript
class InstanceNotFoundError extends Error {
  constructor(message: string)
}
```

### InstanceExpiredError

Thrown when a service instance has expired.

```typescript
class InstanceExpiredError extends Error {
  constructor(message: string)
}
```

### InstanceDestroyingError

Thrown when trying to access a service being destroyed.

```typescript
class InstanceDestroyingError extends Error {
  constructor(message: string)
}
```

### FactoryNotFoundError

Thrown when a factory is not found.

```typescript
class FactoryNotFoundError extends Error {
  constructor(message: string)
}
```

### FactoryTokenNotResolvedError

Thrown when a factory token cannot be resolved.

```typescript
class FactoryTokenNotResolvedError extends Error {
  constructor(message: string)
}
```

### UnknownError

Thrown for unexpected errors.

```typescript
class UnknownError extends Error {
  constructor(message: string)
}
```

## Usage Examples

### Basic Service Registration

```typescript
import { Container, inject, Injectable } from '@navios/di'

@Injectable()
class UserService {
  getUsers() {
    return ['Alice', 'Bob', 'Charlie']
  }
}

const container = new Container()
const userService = await container.get(UserService)
```

### Service with Dependencies

```typescript
import { inject, Injectable } from '@navios/di'

@Injectable()
class EmailService {
  sendEmail(to: string, subject: string) {
    return `Email sent to ${to}: ${subject}`
  }
}

@Injectable()
class UserService {
  private readonly emailService = inject(EmailService)

  async createUser(name: string, email: string) {
    await this.emailService.sendEmail(email, 'Welcome!', `Hello ${name}!`)
    return { id: Math.random().toString(36), name, email }
  }
}
```

### Injection Token Usage

```typescript
import { inject, Injectable, InjectionToken } from '@navios/di'

import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const CONFIG_TOKEN = InjectionToken.create<Config, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private config: z.infer<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }
}

const config = await container.get(CONFIG_TOKEN, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})
```

### Factory Usage

```typescript
import { Factory, Injectable } from '@navios/di'

@Factory()
class DatabaseConnectionFactory {
  create() {
    return {
      host: 'localhost',
      port: 5432,
      connected: true,
    }
  }
}

const connection = await container.get(DatabaseConnectionFactory)
```

### Service Lifecycle

```typescript
import { Injectable, OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: any = null

  async onServiceInit() {
    console.log('Connecting to database...')
    this.connection = await this.connect()
  }

  async onServiceDestroy() {
    console.log('Disconnecting from database...')
    if (this.connection) {
      await this.connection.close()
    }
  }

  private async connect() {
    return { connected: true }
  }
}
```

### Request Scope Usage

```typescript
import { Container, inject, Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class RequestContext {
  private readonly requestId = Math.random().toString(36)
  private readonly startTime = Date.now()

  getRequestId() {
    return this.requestId
  }

  getDuration() {
    return Date.now() - this.startTime
  }
}

@Injectable({ scope: InjectableScope.Request })
class UserSession {
  private readonly context = inject(RequestContext)
  private readonly userId: string

  constructor(userId: string) {
    this.userId = userId
  }

  getUserId() {
    return this.userId
  }

  async getRequestInfo() {
    const ctx = await this.context
    return {
      userId: this.userId,
      requestId: ctx.getRequestId(),
      duration: ctx.getDuration(),
    }
  }
}

// Usage
const container = new Container()

// Begin request context
container.beginRequest('req-123', { userId: 'user123' })

// Get request-scoped instances
const session1 = await container.get(UserSession)
const session2 = await container.get(UserSession)

console.log(session1 === session2) // true - same instance within request

// End request context
await container.endRequest('req-123')
```
