---
sidebar_position: 4
---

# API Reference

Complete API reference for Navios DI library.

## Core Classes

### Container

The main entry point for dependency injection.

```typescript
class Container implements IContainer {
  constructor(
    registry?: Registry,
    logger?: Console | null,
    injectors?: Injectors
  )

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
  getRegistry(): Registry
  tryGetSync<T>(token: any, args?: any): T | null

  // Request Context Management
  beginRequest(
    requestId: string,
    metadata?: Record<string, any>,
  ): ScopedContainer
  getActiveRequestIds(): ReadonlySet<string>
  hasActiveRequest(requestId: string): boolean
  removeRequestId(requestId: string): void

  // Component Access (for advanced usage)
  getStorage(): UnifiedStorage
  getServiceInitializer(): ServiceInitializer
  getServiceInvalidator(): ServiceInvalidator
  getTokenResolver(): TokenResolver
  getNameResolver(): NameResolver
  getScopeTracker(): ScopeTracker
  getEventBus(): LifecycleEventBus
  getInstanceResolver(): InstanceResolver
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
- `getRegistry()` - Get the registry
- `tryGetSync<T>(token, args?)` - Get instance synchronously if it exists

**Request Context Management:**

- `beginRequest(requestId, metadata?)` - Begin a new request context, returns `ScopedContainer`
- `getActiveRequestIds()` - Get set of active request IDs
- `hasActiveRequest(requestId)` - Check if a request is active
- `removeRequestId(requestId)` - Remove a request ID from tracking

**Component Access Methods (Advanced):**

- `getStorage()` - Get the UnifiedStorage instance
- `getServiceInitializer()` - Get the ServiceInitializer instance
- `getServiceInvalidator()` - Get the ServiceInvalidator instance
- `getTokenResolver()` - Get the TokenResolver instance
- `getNameResolver()` - Get the NameResolver instance
- `getScopeTracker()` - Get the ScopeTracker instance
- `getEventBus()` - Get the LifecycleEventBus instance
- `getInstanceResolver()` - Get the InstanceResolver instance

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
  dispose(): Promise<void>  // Alias for endRequest()
  ready(): Promise<void>

  // Introspection
  isRegistered(token: any): boolean
  getParent(): Container
  getRequestId(): string
  getStorage(): UnifiedStorage
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
- `getStorage()` - Get the underlying UnifiedStorage instance

## Registry

The `Registry` stores service metadata and factory information.

```typescript
class Registry {
  constructor(parent?: Registry)
  
  // Registration
  set<Instance, Schema>(
    token: InjectionToken<Instance, Schema>,
    scope: InjectableScope,
    target: ClassType,
    type: InjectableType,
    priority?: number
  ): void
  
  // Lookup
  get<Instance, Schema>(
    token: InjectionToken<Instance, Schema>
  ): FactoryRecord<Instance, Schema>
  
  getAll<Instance, Schema>(
    token: InjectionToken<Instance, Schema>
  ): FactoryRecord<Instance, Schema>[]  // Returns all registrations sorted by priority
  
  has(token: InjectionToken<any, any>): boolean
  
  // Management
  delete(token: InjectionToken<any, any>): void
  updateScope(token: InjectionToken<any, any>, scope: InjectableScope): boolean
}
```

**Methods:**

- `set(token, scope, target, type, priority?)` - Register a service factory
- `get(token)` - Get the highest priority factory record for a token
- `getAll(token)` - Get all factory records for a token (sorted by priority, highest first)
- `has(token)` - Check if a token is registered
- `delete(token)` - Remove all registrations for a token
- `updateScope(token, scope)` - Update the scope of an already registered factory

## Injection Tokens

### InjectionToken

Token-based dependency resolution.

```typescript
class InjectionToken<T, S extends InjectionTokenSchemaType | unknown = unknown> {
  public id: string
  public readonly name: string | symbol | ClassType
  public readonly schema: ZodObject | undefined

  static create<T>(name: string | symbol): InjectionToken<T, undefined>
  static create<T, S extends InjectionTokenSchemaType>(
    name: string | symbol,
    schema: S
  ): InjectionToken<T, S>

  static bound<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    value: z.input<S>
  ): BoundInjectionToken<T, S>

  static factory<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    factory: (ctx: FactoryContext) => Promise<z.input<S>>
  ): FactoryInjectionToken<T, S>
}
```

**Static Methods:**

- `create<T>(name: string | symbol)` - Create a simple injection token
- `create<T, S>(name: string | symbol, schema: S)` - Create a token with schema
- `bound<T, S>(token: InjectionToken<T, S>, value: z.input<S>)` - Create a bound token
- `factory<T, S>(token: InjectionToken<T, S>, factory: (ctx: FactoryContext) => Promise<z.input<S>>)` - Create a factory token

## Decorators

### Injectable

Mark a class as injectable service.

```typescript
function Injectable(options?: {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
  schema?: ZodSchema
  registry?: Registry
  priority?: number
}): ClassDecorator
```

**Options:**

- `scope?: InjectableScope` - Service scope (default: Singleton)
- `token?: InjectionToken<any, any>` - Custom injection token
- `schema?: ZodSchema` - Zod schema for constructor arguments
- `registry?: Registry` - Custom registry
- `priority?: number` - Priority level (higher wins when multiple registrations exist, default: 0)

### Factory

Mark a class as factory service.

```typescript
function Factory(options?: {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
  registry?: Registry
}): ClassDecorator
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
  create(ctx: FactoryContext, args: z.input<S>): T
}
```

### FactoryContext

Context provided to factory methods.

```typescript
interface FactoryContext {
  inject: typeof asyncInject
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

## Functions

### inject

Synchronous dependency injection.

```typescript
function inject<T extends ClassType>(token: T): InstanceType<T>
function inject<T, S extends InjectionTokenSchemaType>(
  token: InjectionToken<T, S>,
  args: z.input<S>
): T
function inject<T>(token: InjectionToken<T, undefined>): T
function inject<T>(token: BoundInjectionToken<T, any>): T
function inject<T>(token: FactoryInjectionToken<T, any>): T
```

### asyncInject

Asynchronous dependency injection.

```typescript
function asyncInject<T extends ClassType>(token: T): Promise<InstanceType<T>>
function asyncInject<T, S extends InjectionTokenSchemaType>(
  token: InjectionToken<T, S>,
  args: z.input<S>
): Promise<T>
function asyncInject<T>(token: InjectionToken<T, undefined>): Promise<T>
function asyncInject<T>(token: BoundInjectionToken<T, any>): Promise<T>
function asyncInject<T>(token: FactoryInjectionToken<T, any>): Promise<T>
```

### optional

Optional dependency injection (returns null if not registered).

```typescript
function optional<T extends ClassType>(token: T): InstanceType<T> | null
function optional<T>(token: InjectionToken<T, any>): T | null
```

## Error Handling

### DIError

Base error class for all DI-related errors.

```typescript
class DIError extends Error {
  readonly code: DIErrorCode

  constructor(code: DIErrorCode, message: string)

  // Static factory methods
  static factoryNotFound(message: string): DIError
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
  // New error codes
  TokenValidationError = 'TOKEN_VALIDATION_ERROR',
  TokenSchemaRequiredError = 'TOKEN_SCHEMA_REQUIRED_ERROR',
  ClassNotInjectable = 'CLASS_NOT_INJECTABLE',
  ScopeMismatchError = 'SCOPE_MISMATCH_ERROR',
  PriorityConflictError = 'PRIORITY_CONFLICT_ERROR',
  StorageError = 'STORAGE_ERROR',
  InitializationError = 'INITIALIZATION_ERROR',
  DependencyResolutionError = 'DEPENDENCY_RESOLUTION_ERROR',
}
```

## Testing

### TestContainer

Specialized container for testing with enhanced utilities.

```typescript
class TestContainer extends Container {
  // Binding API
  bind<T>(token: InjectionToken<T, any> | ClassType): BindingBuilder<T>
  
  // Assertion helpers
  expectResolved(token: AnyToken): void
  expectNotResolved(token: AnyToken): void
  expectSingleton(token: AnyToken): void
  expectTransient(token: AnyToken): void
  expectRequestScoped(token: AnyToken): void
  expectInitialized(token: AnyToken): void
  expectDestroyed(token: AnyToken): void
  expectNotDestroyed(token: AnyToken): void
  
  // Method call tracking
  recordMethodCall(token: AnyToken, method: string, args: any[], result?: any): void
  expectCalled(token: AnyToken, method: string): void
  expectCalledWith(token: AnyToken, method: string, args: any[]): void
  expectCallCount(token: AnyToken, method: string, count: number): void
  getMethodCalls(token: AnyToken): MethodCallRecord[]
  getServiceStats(token: AnyToken): MockServiceStats
  clearMethodCalls(): void
  
  // Dependency graph
  getDependencyGraph(): DependencyGraph
  getSimplifiedDependencyGraph(): DependencyGraph
  
  // Lifecycle
  clear(): Promise<void>
}

interface BindingBuilder<T> {
  toValue(value: T): void
  toClass<C extends new (...args: any[]) => T>(cls: C): void
  toFactory(factory: () => T | Promise<T>): void
}
```

### UnitTestContainer

Strict isolated unit testing container with automatic method call tracking.

```typescript
class UnitTestContainer extends Container {
  constructor(options?: {
    providers?: ProviderConfig[]
    allowUnregistered?: boolean
    logger?: Console | null
  })
  
  // Auto-tracking assertions (no manual recording needed)
  expectCalled(token: AnyToken, method: string): void
  expectCalledWith(token: AnyToken, method: string, args: any[]): void
  expectNotCalled(token: AnyToken, method: string): void
  expectAutoMocked(token: AnyToken): void
  
  // Auto-mocking
  enableAutoMocking(): void
  disableAutoMocking(): void
}
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

## Next Steps

- Explore the [guides](/docs/di/di/guides/services) for detailed usage examples
- Check out [recipes](/docs/di/di/recipes/configuration-services) for common patterns
- Review [best practices](/docs/di/di/best-practices) for service design

