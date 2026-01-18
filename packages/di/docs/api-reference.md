# API Reference

Complete API reference for Navios DI library.

## Core Classes

### Container

The main entry point for dependency injection.

```typescript
class Container implements IContainer {
  constructor(registry?: Registry, logger?: Console | null, injectors?: Injectors)

  // Service resolution
  get<T>(token: T): Promise<InstanceType<T>>
  get<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: z.input<S>,
  ): Promise<T>
  get<T>(token: InjectionToken<T, undefined>): Promise<T>
  get<T>(token: BoundInjectionToken<T, any>): Promise<T>
  get<T>(token: FactoryInjectionToken<T, any>): Promise<T>

  // Lifecycle
  invalidate(service: unknown): Promise<void>
  ready(): Promise<void>
  dispose(): Promise<void>
  clear(): Promise<void>

  // Introspection
  isRegistered(token: any): boolean
  getServiceLocator(): ServiceLocator
  getRegistry(): Registry
  tryGetSync<T>(token: any, args?: any): T | null

  // Request Context Management
  beginRequest(
    requestId: string,
    metadata?: Record<string, any>,
    priority?: number,
  ): ScopedContainer
  getActiveRequestIds(): ReadonlySet<string>
  hasActiveRequest(requestId: string): boolean
}
```

**Constructor Parameters:**

- `registry?: Registry` - Optional registry instance (defaults to global registry)
- `logger?: Console | null` - Optional logger for debugging
- `injectors?: Injectors` - Optional custom injectors

**Methods:**

- `get<T>(token: T)` - Get a service instance (throws error for request-scoped services)
- `invalidate(service: unknown)` - Invalidate a service and its dependencies
- `ready()` - Wait for all pending operations to complete
- `dispose()` - Clean up all resources
- `clear()` - Clear all instances and bindings
- `isRegistered(token: any)` - Check if a service is registered
- `getServiceLocator()` - Get the underlying ServiceLocator instance
- `getRegistry()` - Get the registry
- `tryGetSync<T>(token, args?)` - Get instance synchronously if it exists

**Request Context Management:**

- `beginRequest(requestId, metadata?, priority?)` - Begin a new request context, returns `ScopedContainer`
- `getActiveRequestIds()` - Get set of active request IDs
- `hasActiveRequest(requestId)` - Check if a request is active

### ScopedContainer

Request-scoped container for isolated request-scoped service resolution.

```typescript
class ScopedContainer implements IContainer {
  readonly requestId: string

  // Service resolution
  get<T>(token: T): Promise<InstanceType<T>>
  get<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: z.input<S>,
  ): Promise<T>

  // Lifecycle
  invalidate(service: unknown): Promise<void>
  endRequest(): Promise<void>
  dispose(): Promise<void> // Alias for endRequest()
  ready(): Promise<void>

  // Introspection
  isRegistered(token: any): boolean
  getParent(): Container
  getRequestId(): string
  getRequestContextHolder(): RequestContext
  getHolderStorage(): IHolderStorage
  tryGetSync<T>(token: any, args?: any): T | null

  // Metadata
  getMetadata(key: string): any | undefined
  setMetadata(key: string, value: any): void
  addInstance(token: InjectionToken<any, undefined>, instance: any): void
}
```

**Methods:**

- `get<T>(token: T)` - Get a service instance (request-scoped or delegated to parent)
- `invalidate(service: unknown)` - Invalidate a service
- `endRequest()` - End request and cleanup all request-scoped instances
- `dispose()` - Alias for `endRequest()`
- `ready()` - Wait for pending operations
- `getMetadata(key)` - Get request metadata
- `setMetadata(key, value)` - Set request metadata
- `addInstance(token, instance)` - Add pre-prepared instance to request context

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

  static create<T extends ClassType>(name: T): InjectionToken<InstanceType<T>, undefined>
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
  static refineType<T>(token: BoundInjectionToken<any, any>): BoundInjectionToken<T, any>

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
function Injectable(): <T extends ClassType>(target: T, context?: ClassDecoratorContext) => T
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
      : <T extends ClassTypeWithInstanceAndOptionalArgument<Type, z.output<Schema>>>(
          target: T,
          context?: ClassDecoratorContext,
        ) => T
    : Schema extends undefined
      ? <R extends ClassTypeWithInstance<Type>>(target: R, context?: ClassDecoratorContext) => R
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

### RequestContext

Interface for managing request-scoped instances.

```typescript
interface RequestContext {
  readonly requestId: string
  readonly holders: Map<string, InstanceHolder>
  readonly priority: number
  readonly metadata: Map<string, any>
  readonly createdAt: number

  addInstance(token: InjectionToken<any, undefined>, instance: any): void
  addInstance(instanceName: string, instance: any, holder: InstanceHolder): void
  get(instanceName: string): InstanceHolder | undefined
  set(instanceName: string, holder: InstanceHolder): void
  has(instanceName: string): boolean
  clear(): void
  getMetadata(key: string): any | undefined
  setMetadata(key: string, value: any): void
  filter(
    predicate: (value: InstanceHolder<any>, key: string) => boolean,
  ): Map<string, InstanceHolder>
  delete(name: string): boolean
  size(): number
  isEmpty(): boolean
}
```

**Deprecated alias:** `RequestContextHolder`

### FactoryContext

Context provided to factory methods.

```typescript
interface FactoryContext {
  inject: typeof asyncInject
  locator: ServiceLocator
  addDestroyListener: (listener: () => void | Promise<void>) => void
}
```

### IContainer

Common interface for Container and ScopedContainer.

```typescript
interface IContainer {
  get<T>(token: T, args?: any): Promise<T>
  invalidate(service: unknown): Promise<void>
  isRegistered(token: any): boolean
  dispose(): Promise<void>
  ready(): Promise<void>
  tryGetSync<T>(token: any, args?: any): T | null
}
```

### InstanceHolder

Represents a managed service instance with its lifecycle state.

```typescript
interface InstanceHolder<T = unknown> {
  name: string
  instance: T | null
  status: InstanceStatus
  type: InjectableType
  scope: InjectableScope
  deps: Set<string> // Services this holder depends on
  waitingFor: Set<string> // Services this holder is waiting for (cycle detection)
  destroyListeners: InstanceDestroyListener[]
  createdAt: number
  creationPromise: Promise<[undefined, T]> | null
  destroyPromise: Promise<void> | null
}
```

**Deprecated alias:** `ServiceLocatorInstanceHolder`

### InstanceStatus

```typescript
enum InstanceStatus {
  Creating = 'creating',
  Created = 'created',
  Destroying = 'destroying',
  Error = 'error',
}
```

**Deprecated alias:** `ServiceLocatorInstanceHolderStatus`

## Functions

### asyncInject

Asynchronous dependency injection.

```typescript
function asyncInject<T extends ClassType>(
  token: T,
): InstanceType<T> extends Factorable<infer R> ? Promise<R> : Promise<InstanceType<T>>
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

### optional

Optional dependency injection (returns null if not registered).

```typescript
function optional<T extends ClassType>(token: T): InstanceType<T> | null
function optional<T>(token: InjectionToken<T, any>): T | null
```

### wrapSyncInit

Wraps a synchronous initialization function.

```typescript
function wrapSyncInit<T>(fn: () => T): T
```

### provideFactoryContext

Provides a factory context for the duration of a function execution.

```typescript
function provideFactoryContext<T>(ctx: FactoryContext, fn: () => T): T
```

### withResolutionContext

Runs a function within a resolution context for cycle detection.

```typescript
function withResolutionContext<T>(
  waiterHolder: InstanceHolder,
  getHolder: (name: string) => InstanceHolder | undefined,
  fn: () => T,
): T
```

### getCurrentResolutionContext

Gets the current resolution context if any.

```typescript
function getCurrentResolutionContext(): ResolutionContextData | undefined

interface ResolutionContextData {
  waiterHolder: InstanceHolder
  getHolder: (name: string) => InstanceHolder | undefined
}
```

### withoutResolutionContext

Runs a function outside of any resolution context (used by asyncInject).

```typescript
function withoutResolutionContext<T>(fn: () => T): T
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
type InjectionTokenSchemaType = BaseInjectionTokenSchemaType | OptionalInjectionTokenSchemaType
```

### BaseInjectionTokenSchemaType

Base schema type.

```typescript
type BaseInjectionTokenSchemaType = ZodObject | ZodRecord
```

### OptionalInjectionTokenSchemaType

Optional schema type.

```typescript
type OptionalInjectionTokenSchemaType = ZodOptional<ZodObject> | ZodOptional<ZodRecord>
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

| Scope     | inject       | asyncInject  | optional     |
| --------- | ------------ | ------------ | ------------ |
| Singleton | ✅ Supported | ✅ Supported | ✅ Supported |
| Transient | ✅ Supported | ✅ Supported | ✅ Supported |
| Request   | ✅ Supported | ✅ Supported | ✅ Supported |

**Notes:**

- `inject()` works with all scopes but returns a proxy for dependencies not yet initialized
- `asyncInject()` is recommended for circular dependencies as it runs outside the resolution context
- `optional()` returns `null` if the service is not registered

## Error Handling

### DIError

Base error class for all DI-related errors.

```typescript
class DIError extends Error {
  readonly code: DIErrorCode

  constructor(code: DIErrorCode, message: string)

  // Static factory methods
  static factoryNotFound(message: string): DIError
  static factoryTokenNotResolved(message: string): DIError
  static instanceNotFound(message: string): DIError
  static instanceDestroying(message: string): DIError
  static circularDependency(message: string): DIError
  static unknown(message: string): DIError
}
```

### DIErrorCode

```typescript
enum DIErrorCode {
  FactoryNotFound = 'FACTORY_NOT_FOUND',
  FactoryTokenNotResolved = 'FACTORY_TOKEN_NOT_RESOLVED',
  InstanceNotFound = 'INSTANCE_NOT_FOUND',
  InstanceDestroying = 'INSTANCE_DESTROYING',
  CircularDependency = 'CIRCULAR_DEPENDENCY',
  UnknownError = 'UNKNOWN_ERROR',
}
```

### Error Handling Example

```typescript
import { DIError, DIErrorCode } from '@navios/di'

try {
  const service = await container.get(UnregisteredService)
} catch (error) {
  if (error instanceof DIError) {
    switch (error.code) {
      case DIErrorCode.FactoryNotFound:
        console.error('Service not registered')
        break
      case DIErrorCode.InstanceDestroying:
        console.error('Service is being destroyed')
        break
      case DIErrorCode.CircularDependency:
        console.error('Circular dependency detected:', error.message)
        break
    }
  }
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

const CONFIG_TOKEN = InjectionToken.create<Config, typeof configSchema>('APP_CONFIG', configSchema)

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
  userId?: string

  getRequestInfo() {
    return {
      userId: this.userId,
      requestId: this.context.getRequestId(),
      duration: this.context.getDuration(),
    }
  }
}

// Usage
const container = new Container()

// Begin request context - returns a ScopedContainer
const scoped = container.beginRequest('req-123', { userId: 'user123' })

// Get request-scoped instances from the ScopedContainer
const session1 = await scoped.get(UserSession)
const session2 = await scoped.get(UserSession)

console.log(session1 === session2) // true - same instance within request

// End request context and cleanup
await scoped.endRequest()
```

### Circular Dependency Handling

```typescript
import { asyncInject, inject, Injectable } from '@navios/di'

// Use asyncInject to break circular dependencies
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB) // Break cycle here

  async doSomething() {
    const b = await this.serviceB
    return b.process()
  }
}

@Injectable()
class ServiceB {
  private serviceA = inject(ServiceA) // This side can use inject

  process() {
    return 'processed'
  }
}

const container = new Container()
const serviceA = await container.get(ServiceA)
await serviceA.doSomething() // Works!
```
