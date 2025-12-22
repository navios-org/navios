# Migration Guide: @navios/di → @navios/di-experimental

This document describes the differences between `@navios/di` and `@navios/di-experimental`, and serves as a migration guide and changelog.

## Overview

`@navios/di-experimental` is an alpha rewrite of the DI system with improved architecture, better performance characteristics, and enhanced developer experience. While the public API remains largely compatible, the internal implementation has been significantly refactored.

## Breaking Changes

### 1. Priority System for Multiple Registrations

**New feature:** Services can be registered with priority levels. Higher priority wins.

**Before (@navios/di):**
```typescript
// Registry stores single FactoryRecord per token
// Only one registration per token - second overwrites first
@Injectable({ registry })
class MyService {}

@Injectable({ registry })
class MyServiceOverride {} // ❌ Silently replaces MyService
```

**After (@navios/di-experimental):**
```typescript
// Registry stores FactoryRecord[] per token
@Injectable({ priority: 100, registry })
class DefaultService {}

@Injectable({ priority: 200, registry }) // This wins, but both are kept
class OverrideService {}

// Can retrieve all registrations
registry.getAll(token) // Returns both, sorted by priority (highest first)
```

### 2. ServiceLocator Removed

**Before (@navios/di):**
```typescript
// Container wraps ServiceLocator
class Container {
  private readonly serviceLocator: ServiceLocator

  getServiceLocator(): ServiceLocator {
    return this.serviceLocator
  }
}

// Access internals via ServiceLocator
container.getServiceLocator().getManager()
container.getServiceLocator().getTokenProcessor()
container.getServiceLocator().getInvalidator()
```

**After (@navios/di-experimental):**
```typescript
// Container uses components directly (no ServiceLocator wrapper)
class Container {
  private readonly storage: UnifiedStorage
  private readonly serviceInitializer: ServiceInitializer
  private readonly tokenResolver: TokenResolver
  // ... other components

  // Direct access methods
  getStorage(): UnifiedStorage
  getServiceInitializer(): ServiceInitializer
  getTokenResolver(): TokenResolver
  getNameResolver(): NameResolver
  getScopeTracker(): ScopeTracker
  getEventBus(): LifecycleEventBus
  getInstanceResolver(): InstanceResolver
}
```

### 3. Internal Component Renames

| @navios/di | @navios/di-experimental |
|------------|------------------------|
| `Instantiator` | `ServiceInitializer` |
| `Invalidator` | `ServiceInvalidator` |
| `TokenProcessor` | `TokenResolver` |
| `HolderManager` | `UnifiedStorage` |
| `SingletonStorage` | `UnifiedStorage` |
| `RequestStorage` | `UnifiedStorage` |
| `RequestContext` | (merged into `UnifiedStorage`) |

### 4. Container Method Rename

```typescript
// Before (@navios/di)
container.removeActiveRequest(requestId)

// After (@navios/di-experimental)
container.removeRequestId(requestId)
```

## New Features

### 1. Unified Storage Architecture

**Before (@navios/di):**
```
internal/holder/
├── holder-manager.mts       # Base holder management
├── base-holder-manager.mts  # Abstract base
├── singleton-storage.mts    # Wraps HolderManager for singletons
└── request-storage.mts      # Wraps RequestContext for request scope

internal/context/
└── request-context.mts      # Holds request-scoped instances
```

**After (@navios/di-experimental):**
```
internal/holder/
└── unified-storage.mts      # Single class for all scopes
```

```typescript
// UnifiedStorage replaces 4 classes with 1
export class UnifiedStorage implements IHolderStorage {
  readonly scope: InjectableScope
  private readonly holders = new Map<string, InstanceHolder>()
  // NEW: Reverse dependency index for O(1) lookups
  private readonly dependents = new Map<string, Set<string>>()
}
```

Benefits:
- **Simpler mental model**: One storage class regardless of scope
- **Reverse dependency index**: O(1) lookup of dependents vs O(n) iteration
- **Consistent API**: Same operations for all scopes

### 2. Enhanced Testing Utilities

**Before (@navios/di):**
```typescript
import { TestContainer, TestBindingBuilder } from '@navios/di/testing'

const container = new TestContainer()
container.bind(Token).toValue(value)
container.bind(Token).toClass(MockClass)
container.bindValue(Token, value)
container.bindClass(Token, MockClass)
container.createChild()
```

**After (@navios/di-experimental):**
```typescript
import { TestContainer, UnitTestContainer } from '@navios/di-experimental/testing'

// TestContainer - significantly extended
const container = new TestContainer()

// Fluent binding API (extended with factory)
container.bind(DatabaseToken).toValue(mockDatabase)
container.bind(UserService).toClass(MockUserService)
container.bind(ConfigToken).toFactory(() => ({ apiKey: 'test' })) // NEW

// NEW: Assertion helpers
container.expectResolved(MyService)
container.expectNotResolved(MyService)
container.expectSingleton(MyService)
container.expectTransient(TransientService)
container.expectRequestScoped(RequestService)
await container.expectSameInstance(MyService)
await container.expectDifferentInstances(TransientService)

// NEW: Lifecycle assertions
container.expectInitialized(MyService)
container.expectDestroyed(MyService)
container.expectNotDestroyed(MyService)

// NEW: Method call tracking
container.recordMethodCall(MyService, 'doSomething', ['arg1'], result)
container.expectCalled(MyService, 'doSomething')
container.expectCalledWith(MyService, 'doSomething', ['arg1'])
container.expectCallCount(MyService, 'doSomething', 2)
container.getMethodCalls(MyService)
container.getServiceStats(MyService)
container.clearMethodCalls()

// NEW: Dependency graph for snapshot testing
const graph = container.getDependencyGraph()
const simplified = container.getSimplifiedDependencyGraph()

await container.clear()
```

**NEW: UnitTestContainer** (does not exist in @navios/di):
```typescript
import { UnitTestContainer } from '@navios/di-experimental/testing'

// Strict isolated unit testing with auto-tracking
const container = new UnitTestContainer({
  providers: [
    { token: UserService, useClass: MockUserService },
    { token: ConfigToken, useValue: { apiUrl: 'test' } },
    { token: ApiClient, useFactory: () => new MockApiClient() },
  ],
})

// All method calls automatically tracked via Proxy
const service = await container.get(UserService)
await service.findUser('123')

// Auto-tracked assertions (no manual recording needed)
container.expectCalled(UserService, 'findUser')
container.expectCalledWith(UserService, 'findUser', ['123'])
container.expectNotCalled(UserService, 'deleteUser')

// Strict mode (default): unregistered dependencies throw
await container.get(UnregisteredService) // ❌ Throws DIError

// Auto-mocking mode: unregistered dependencies return mock proxies
container.enableAutoMocking()
const mock = await container.get(UnregisteredService)
container.expectAutoMocked(UnregisteredService)
container.disableAutoMocking()
```

### 3. Enhanced Error Messages

**Before (@navios/di):**
```typescript
enum DIErrorCode {
  FactoryNotFound,
  FactoryTokenNotResolved,
  InstanceNotFound,
  InstanceDestroying,
  CircularDependency,
  UnknownError,
}

// Static factory methods
DIError.factoryNotFound(name)
DIError.factoryTokenNotResolved(token)
DIError.instanceNotFound(name)
DIError.instanceDestroying(name)
DIError.unknown(message, context)
DIError.circularDependency(cycle)
```

**After (@navios/di-experimental):**
```typescript
enum DIErrorCode {
  // Existing (same as @navios/di)
  FactoryNotFound,
  FactoryTokenNotResolved,
  InstanceNotFound,
  InstanceDestroying,
  CircularDependency,
  UnknownError,
  // NEW error codes
  TokenValidationError,       // Zod schema validation failed
  TokenSchemaRequiredError,   // Schema args required but not provided
  ClassNotInjectable,         // Missing @Injectable decorator
  ScopeMismatchError,         // Wrong container for scope
  PriorityConflictError,      // Multiple same-priority registrations
  StorageError,               // Storage operation failed
  InitializationError,        // Service init failed
  DependencyResolutionError,  // Dependency chain error
}

// NEW static factory methods
DIError.tokenValidationError(message, schema, value)
DIError.tokenSchemaRequiredError(token)
DIError.classNotInjectable(className)
DIError.scopeMismatchError(token, expectedScope, actualScope)
DIError.priorityConflictError(token, records)
DIError.storageError(message, operation, instanceName)
DIError.initializationError(serviceName, error)
DIError.dependencyResolutionError(serviceName, dependencyName, error)
```

### 4. Scope Error Handling

**Before (@navios/di):**
```typescript
// Request scope violation throws generic error
throw DIError.unknown(
  `Cannot resolve request-scoped service "${name}" from Container. ` +
  `Use beginRequest() to create a ScopedContainer for request-scoped services.`
)
```

**After (@navios/di-experimental):**
```typescript
// Dedicated error type with structured context
throw DIError.scopeMismatchError(
  realToken.name,
  'ScopedContainer',
  'Container',
)
// Error includes context: { token, expectedScope, actualScope }
```

### 5. New Internal Components

**NameResolver** (NEW):
```typescript
// Generates deterministic instance names
class NameResolver {
  generateInstanceName(
    token: InjectionToken,
    args: unknown,
    requestId: string | undefined,
    scope: InjectableScope,
  ): string
}
```

**ScopeTracker** (NEW):
```typescript
// Tracks and validates scope relationships
class ScopeTracker {
  checkAndUpgradeScope(
    token: InjectionToken,
    dependencyScope: InjectableScope,
  ): void
}
```

### 6. Registry Changes

**Before (@navios/di):**
```typescript
class Registry {
  private readonly factories = new Map<string, FactoryRecord>()

  set(token, scope, target, type) // 4 params
  get(token): FactoryRecord
  // No getAll() method
}

interface FactoryRecord {
  scope: InjectableScope
  originalToken: InjectionToken
  target: ClassType
  type: InjectableType
  // No priority field
}
```

**After (@navios/di-experimental):**
```typescript
class Registry {
  private readonly factories = new Map<string, FactoryRecord[]>() // Array!
  private readonly highestPriority = new Map<string, FactoryRecord>() // Cache

  set(token, scope, target, type, priority = 0) // 5 params
  get(token): FactoryRecord  // Returns highest priority
  getAll(token): FactoryRecord[] // NEW: Returns all, sorted by priority
}

interface FactoryRecord {
  scope: InjectableScope
  originalToken: InjectionToken
  target: ClassType
  type: InjectableType
  priority: number // NEW
}
```

## Architecture Changes

### Component Mapping

| @navios/di | @navios/di-experimental | Notes |
|------------|------------------------|-------|
| `ServiceLocator` | (removed) | Container uses components directly |
| `HolderManager` | `UnifiedStorage` | Unified for all scopes |
| `BaseHolderManager` | (removed) | Merged into UnifiedStorage |
| `SingletonStorage` | `UnifiedStorage` | Same class, different instance |
| `RequestStorage` | `UnifiedStorage` | Same class, different instance |
| `RequestContext` | `UnifiedStorage` | Merged into UnifiedStorage |
| `Instantiator` | `ServiceInitializer` | Renamed |
| `Invalidator` | `ServiceInvalidator` | Renamed |
| `TokenProcessor` | `TokenResolver` | Renamed |
| (none) | `NameResolver` | NEW: Instance name generation |
| (none) | `ScopeTracker` | NEW: Scope tracking |
| (none) | `AbstractContainer` | NEW: Base class for containers |
| `TestBindingBuilder` | (inline) | Simplified into TestContainer |

### File Structure Comparison

**@navios/di:**
```
internal/
├── core/
│   ├── service-locator.mts    # Central orchestrator
│   ├── instance-resolver.mts
│   ├── instantiator.mts
│   ├── invalidator.mts
│   └── token-processor.mts
├── holder/
│   ├── holder-manager.mts
│   ├── base-holder-manager.mts
│   ├── singleton-storage.mts
│   ├── request-storage.mts
│   └── instance-holder.mts
├── lifecycle/
│   ├── lifecycle-event-bus.mts
│   └── circular-detector.mts
└── context/
    ├── request-context.mts
    ├── resolution-context.mts
    └── factory-context.mts
```

**@navios/di-experimental:**
```
internal/
├── core/
│   ├── instance-resolver.mts
│   ├── service-initializer.mts   # Renamed from instantiator
│   ├── service-invalidator.mts   # Renamed from invalidator
│   ├── token-resolver.mts        # Renamed from token-processor
│   ├── name-resolver.mts         # NEW
│   └── scope-tracker.mts         # NEW
├── holder/
│   ├── unified-storage.mts       # Replaces 4 storage classes
│   ├── instance-holder.mts
│   └── holder-storage.interface.mts
├── lifecycle/
│   ├── lifecycle-event-bus.mts
│   └── circular-detector.mts
├── context/
│   ├── async-local-storage.mts
│   ├── factory-context.mts
│   ├── resolution-context.mts
│   └── service-initialization-context.mts  # NEW
└── stub-factory-class.mts
```

## API Compatibility

### Fully Compatible (No Changes)

- `Container.get(token)` - Same signature and behavior
- `Container.dispose()` - Same signature and behavior
- `Container.beginRequest(requestId, metadata)` - Same signature
- `Container.isRegistered(token)` - Same signature
- `Container.ready()` - Same signature
- `Container.tryGetSync(token, args)` - Same signature
- `Container.invalidate(service)` - Same signature
- `Container.getActiveRequestIds()` - Same signature
- `Container.hasActiveRequest(requestId)` - Same signature
- `Container.getRegistry()` - Same signature
- `ScopedContainer.get(token)` - Same signature and behavior
- `ScopedContainer.endRequest()` - Same signature
- `@Injectable()` decorator - Same base signatures
- `@Factory()` decorator - Same signatures
- `inject()` function - Same signature
- `asyncInject()` function - Same signature
- `optional()` function - Same signature
- `InjectionToken.create()` - Same signatures
- `InjectionToken.bound()` - Same signatures
- `InjectionToken.factory()` - Same signatures
- `OnServiceInit` interface - Same signature
- `OnServiceDestroy` interface - Same signature
- `InjectableScope` enum - Same values
- `InjectableType` enum - Same values
- `DIError` class - Extended (backwards compatible)

### Extended (New Options)

```typescript
// @Injectable now supports priority
@Injectable({ priority: number })

// InjectableOptions interface extended
interface InjectableOptions {
  scope?: InjectableScope
  token?: InjectionToken<any, any>
  schema?: InjectionTokenSchemaType
  registry?: Registry
  priority?: number // NEW
}

// Registry method signatures extended
registry.set(token, scope, target, type, priority?) // priority param added
registry.getAll(token) // NEW method

// FactoryRecord interface extended
interface FactoryRecord {
  // ... existing fields
  priority: number // NEW
}

// Container new methods
container.getStorage(): UnifiedStorage
container.getServiceInitializer(): ServiceInitializer
container.getServiceInvalidator(): ServiceInvalidator
container.getTokenResolver(): TokenResolver
container.getNameResolver(): NameResolver
container.getScopeTracker(): ScopeTracker
container.getEventBus(): LifecycleEventBus
container.getInstanceResolver(): InstanceResolver
```

### Removed APIs

```typescript
// REMOVED: ServiceLocator access
container.getServiceLocator() // ❌ No longer exists

// REPLACED with direct component access
container.getStorage()
container.getInstanceResolver()
// etc.
```

### New Exports

```typescript
// Testing utilities (extended)
import { TestContainer, UnitTestContainer } from '@navios/di-experimental/testing'

// Internal components (for advanced use)
import {
  UnifiedStorage,
  InstanceResolver,
  TokenResolver,
  NameResolver,
  ScopeTracker,
  ServiceInitializer,
  ServiceInvalidator,
  LifecycleEventBus,
  CircularDetector,
} from '@navios/di-experimental'
```

## Performance Improvements

1. **Reverse Dependency Index**: `UnifiedStorage.dependents` Map provides O(1) dependent lookup during invalidation, vs O(n) iteration in `@navios/di` (via `getDependents()` method)
2. **Priority Cache**: Registry maintains `highestPriority` Map for fast access to winning registration
3. **Unified Storage**: Single storage class eliminates wrapper overhead from `SingletonStorage`/`RequestStorage`
4. **No ServiceLocator Wrapper**: Container directly uses components, reducing indirection

## Migration Checklist

- [ ] Update imports from `@navios/di` to `@navios/di-experimental`
- [ ] Replace `container.getServiceLocator()` with direct component access:
  - `.getServiceLocator().getManager()` → `.getStorage()`
  - `.getServiceLocator().getTokenProcessor()` → `.getTokenResolver()`
  - `.getServiceLocator().getInvalidator()` → `.getServiceInvalidator()`
- [ ] Replace `container.removeActiveRequest()` with `container.removeRequestId()`
- [ ] Update internal class references:
  - `HolderManager` → `UnifiedStorage`
  - `SingletonStorage` → `UnifiedStorage`
  - `RequestStorage` → `UnifiedStorage`
  - `RequestContext` → `UnifiedStorage`
  - `Instantiator` → `ServiceInitializer`
  - `Invalidator` → `ServiceInvalidator`
  - `TokenProcessor` → `TokenResolver`
- [ ] Consider using new testing utilities (`TestContainer` assertions, `UnitTestContainer`)
- [ ] Check error handling (new error codes available)
- [ ] Consider using `priority` option for service registration if needed
- [ ] Use `registry.getAll(token)` if you need all registrations, not just highest priority

## Known Limitations (Alpha)

- This is alpha software (v0.0.1-alpha.0)
- API may change before stable release
- Some edge cases may not be fully tested
- Performance benchmarks pending

## Changelog

### v0.0.1-alpha.0

- Initial experimental release
- Unified storage architecture (replaces HolderManager, SingletonStorage, RequestStorage, RequestContext)
- Reverse dependency index for O(1) invalidation lookups
- Priority system for multiple registrations per token
- Extended DIErrorCode enum with 8 new error types
- Enhanced TestContainer with assertion helpers and dependency graph
- New UnitTestContainer for isolated unit testing with auto-tracking
- Renamed internal components (Instantiator→ServiceInitializer, etc.)
- Removed ServiceLocator wrapper class
- New NameResolver and ScopeTracker components
- New AbstractContainer base class
