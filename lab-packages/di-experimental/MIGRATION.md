# Migration Guide: @navios/di → @navios/di-experimental

This document describes the differences between `@navios/di` and `@navios/di-experimental`, and serves as a migration guide and changelog.

## Overview

`@navios/di-experimental` is an alpha rewrite of the DI system with improved architecture, better performance characteristics, and enhanced developer experience. While the public API remains largely compatible, the internal implementation has been significantly refactored.

## Breaking Changes

### 1. Registry is Required for Test Isolation

**Before (@navios/di):**
```typescript
// Classes registered in globalRegistry could pollute tests
@Injectable()
class MyService {}
```

**After (@navios/di-experimental):**
```typescript
// Best practice: always use custom registry in tests
const registry = new Registry()

@Injectable({ registry })
class MyService {}

const container = new Container(registry)
```

### 2. Request Scope Renamed from "Request"

The `InjectableScope.Request` value remains the same, but internal handling has changed. Request-scoped services now require explicit `ScopedContainer` usage (same as before, but with stricter enforcement).

### 3. Token ID Generation

**Before:** Token IDs were based on Symbols and runtime identity.

**After:** Token IDs are deterministically generated from token names using hashing. This enables:
- Better serialization
- Predictable caching
- Easier debugging

```typescript
// IDs are now deterministic
const token1 = InjectionToken.create('MyService')
const token2 = InjectionToken.create('MyService')
token1.id === token2.id // true (same name = same id)
```

### 4. Priority System for Multiple Registrations

**New feature:** Services can be registered with priority levels. Higher priority wins.

```typescript
@Injectable({ priority: 100, registry })
class DefaultService {}

@Injectable({ priority: 200, registry }) // This wins
class OverrideService {}
```

## New Features

### 1. Unified Storage Architecture

The experimental package replaces the separate `HolderManager`, `SingletonStorage`, and `RequestStorage` with a single `UnifiedStorage` class:

- **Simpler mental model**: One storage class for all scopes
- **Reverse dependency index**: O(1) lookup of dependents (vs O(n) scan)
- **Better memory efficiency**: Reduced object allocations

### 2. Event-Based Invalidation

Dependency invalidation now uses an event bus pattern:

**Before (@navios/di):**
```typescript
// Manual cascade through dependency graph
invalidator.invalidate(holder)
// Walks dependencies synchronously
```

**After (@navios/di-experimental):**
```typescript
// Event-based cascade
eventBus.on('dependency', 'destroy', () => {
  // Dependents subscribe to dependency events
  // Automatic cascade via event propagation
})
```

Benefits:
- Decoupled invalidation logic
- Easier to debug (can observe events)
- Async-friendly cascade

### 3. Scope Upgrade Tracking

New `ScopeTracker` component handles automatic scope upgrades:

```typescript
@Injectable({ scope: InjectableScope.Singleton })
class SingletonService {
  private requestService = inject(RequestScopedService)
  // ^ SingletonService automatically upgrades to Request scope
}
```

The upgrade is:
- Atomic (registry + storage updated together)
- Tracked (can observe scope changes)
- Logged (when logger provided)

### 4. Service Initialization Context

New internal context for tracking scope during initialization:

```typescript
interface ServiceInitializationContext {
  requestId?: string
  requestStorage?: UnifiedStorage
  singletonStorage: UnifiedStorage
  eventBus: LifecycleEventBus
  currentScope: InjectableScope
  record: FactoryRecord
}
```

This enables better debugging and scope tracking during complex initialization chains.

### 5. Enhanced Error Messages

New error codes with richer context:

```typescript
enum DIErrorCode {
  // Existing
  FactoryNotFound,
  CircularDependency,
  // New
  ScopeMismatchError,      // Wrong container for scope
  PriorityConflictError,   // Multiple same-priority registrations
  InitializationError,     // Constructor/init failures with context
  DependencyResolutionError, // Detailed dependency chain info
}
```

Errors now include `context` object with debug information:

```typescript
catch (error) {
  if (error instanceof DIError) {
    console.log(error.context) // { serviceName, scope, requestId, ... }
  }
}
```

### 6. Improved Async Local Storage Usage

The experimental package uses AsyncLocalStorage more efficiently:

- Reduced context switching
- Better stack trace preservation
- Smaller memory footprint per request

## Architecture Changes

### Internal Component Reorganization

| @navios/di | @navios/di-experimental | Notes |
|------------|------------------------|-------|
| `ServiceLocator` | Split into smaller components | Better separation of concerns |
| `HolderManager` | `UnifiedStorage` | Single storage class |
| `SingletonStorage` | `UnifiedStorage` (singleton instance) | Same class, different instance |
| `RequestStorage` | `UnifiedStorage` (request instance) | Same class, different instance |
| `Instantiator` | `ServiceInitializer` | Renamed, similar function |
| `Invalidator` | `ServiceInvalidator` | Renamed, event-based |
| `TokenProcessor` | `TokenResolver` | Simplified |
| (new) | `ScopeTracker` | Scope upgrade handling |
| (new) | `NameResolver` | Instance naming with LRU cache |
| `FactoryContext` | `FactoryContext` | Same interface |

### File Structure Changes

```
@navios/di                          @navios/di-experimental
├── container/                      ├── container/
│   ├── container.mts              │   ├── container.mts
│   └── scoped-container.mts       │   └── scoped-container.mts
├── internal/                       ├── internal/
│   ├── core/                      │   ├── core/
│   │   ├── service-locator.mts   │   │   ├── instance-resolver.mts
│   │   ├── instance-resolver.mts │   │   ├── service-initializer.mts
│   │   └── instantiator.mts      │   │   ├── service-invalidator.mts
│   │                              │   │   ├── scope-tracker.mts
│   │                              │   │   ├── name-resolver.mts
│   │                              │   │   └── token-resolver.mts
│   ├── holder/                    │   ├── holder/
│   │   ├── holder-manager.mts    │   │   ├── unified-storage.mts
│   │   └── instance-holder.mts   │   │   └── instance-holder.mts
│   └── context/                   │   └── context/
│       ├── factory-context.mts   │       ├── factory-context.mts
│       └── request-context.mts   │       ├── resolution-context.mts
│                                  │       └── service-initialization-context.mts
```

## API Compatibility

### Fully Compatible (No Changes)

- `Container.get(token)` - Same signature and behavior
- `Container.dispose()` - Same signature and behavior
- `Container.beginRequest(requestId)` - Same signature and behavior
- `ScopedContainer.get(token)` - Same signature and behavior
- `@Injectable()` decorator - Same signatures
- `@Factory()` decorator - Same signatures
- `inject()` function - Same signature and behavior
- `asyncInject()` function - Same signature and behavior
- `optional()` function - Same signature and behavior
- `InjectionToken.create()` - Same signatures
- `InjectionToken.bound()` - Same signatures
- `InjectionToken.factory()` - Same signatures
- `OnServiceInit` interface - Same signature
- `OnServiceDestroy` interface - Same signature
- `InjectableScope` enum - Same values
- `InjectableType` enum - Same values

### Extended (New Options)

```typescript
// @Injectable now supports priority
@Injectable({ priority: number })

// Registry now tracks priority
registry.set(token, scope, target, type, priority)
registry.getAll(token) // Returns sorted by priority
```

### Internal-Only Changes

The following are internal implementation details that should not affect user code:

- `UnifiedStorage` replaces `HolderManager` + storage classes
- `ServiceInitializer` replaces `Instantiator`
- `ServiceInvalidator` replaces `Invalidator`
- `LifecycleEventBus` is now used for invalidation cascade
- Instance naming uses LRU cache for performance

## Performance Improvements

1. **LRU Cache for Instance Names**: Frequently resolved services benefit from cached name generation
2. **Reverse Dependency Index**: O(1) dependent lookup during invalidation (vs O(n) scan)
3. **Reduced Object Allocations**: Unified storage reduces holder wrapper objects
4. **Event-Based Cascade**: More efficient invalidation propagation

## Migration Checklist

- [ ] Update imports from `@navios/di` to `@navios/di-experimental`
- [ ] Review test isolation (ensure custom Registry usage)
- [ ] Check for any direct usage of internal APIs (will need updates)
- [ ] Verify circular dependency detection still works (BFS algorithm unchanged)
- [ ] Test lifecycle hooks (`onServiceInit`, `onServiceDestroy`)
- [ ] Validate request-scoped service behavior
- [ ] Check error handling (new error codes available)

## Known Limitations (Alpha)

- This is alpha software (v0.0.1-alpha.0)
- API may change before stable release
- Some edge cases may not be fully tested
- Performance benchmarks pending

## Changelog

### v0.0.1-alpha.0

- Initial experimental release
- Unified storage architecture
- Event-based invalidation
- Scope upgrade tracking
- Enhanced error messages
- Priority system for registrations
- LRU cache for instance naming
- Reverse dependency index
