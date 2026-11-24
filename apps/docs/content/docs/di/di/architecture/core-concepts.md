---
sidebar_position: 2
---

# Core Concepts

Understanding these core concepts is essential for effectively using Navios DI. This section provides detailed descriptions of the fundamental building blocks of the DI system.

## Injection Token

**Injection Tokens are the foundation of Navios DI.** Every service and factory has an Injection Token that identifies it in the DI system.

### What is an Injection Token?

An Injection Token is a unique identifier used by the Registry to store service metadata and by the Container to resolve services. When you use `@Injectable()` or `@Factory()`, the DI system either:

- **Auto-creates a token** from the class (when no `token` option is provided)
- **Uses your provided token** (when you specify a `token` option)

### Token-Based Resolution

Services are resolved by their Injection Token, not by class directly. This means:

1. When you call `container.get(ServiceClass)`, the container converts the class to its token
2. The Registry looks up the token to find service metadata
3. The Container uses this metadata to create and resolve the instance

This token-based system enables:
- Multiple services per token (with priority)
- Interface-based injection
- Dynamic service resolution
- Service overrides

### Token Types

- **Class-based tokens**: Auto-created from classes when using `@Injectable()` without a token
- **Explicit tokens**: Created with `InjectionToken.create()` and provided via the `token` option
- **Schema-based tokens**: Tokens with Zod schemas for type-safe configuration
- **Bound tokens**: Pre-configured tokens with static values
- **Factory tokens**: Tokens that provide dynamic default values

## Service

A **Service** is a class that provides functionality to other parts of your application. Services are registered with the DI container using the `@Injectable()` decorator.

### Service Characteristics

- **Has an Injection Token**: Every service has a token (auto-created or provided)
- **Injectable**: Services can request other services as dependencies
- **Scoped**: Services can have different lifetimes (singleton, transient, request)
- **Lifecycle-aware**: Services can implement initialization and cleanup hooks

### Service Registration

When you use `@Injectable()`, the service is automatically registered in the Registry with its Injection Token. The registration includes:

- The Injection Token (auto-created or provided)
- The service class
- The scope (singleton, transient, or request)
- The priority (for override support)
- Other metadata

### Service Resolution

When a service is requested from the container:

1. The container identifies the service's Injection Token
2. The Registry is queried for the service metadata
3. If multiple services are registered for the token, the highest priority one is selected
4. Dependencies are resolved recursively
5. The service instance is created
6. Dependencies are injected
7. Lifecycle hooks are called if implemented

## Factory

A **Factory** is a class decorated with `@Factory()` that implements a `create()` method. When you request a factory from the container, you get the result of the `create()` method, not the factory instance itself.

### Factory Characteristics

- **Has an Injection Token**: Like services, factories have tokens (auto-created or provided)
- **Returns created objects**: The factory's `create()` method is called, and its return value is what you get
- **Configuration-based**: Factories can accept configuration via injection tokens with schemas
- **Dependency injection**: Factories can inject other services using `inject()` or `ctx.container`

### Factory Registration

When you use `@Factory()`, the factory is automatically registered in the Registry with its Injection Token, similar to services. The registration includes the same metadata as services.

### Factory Resolution

Factory resolution follows the same token-based process as services, but instead of returning the factory instance, the container calls the factory's `create()` method and returns its result.

## Scopes

**Scopes** determine the lifetime and sharing behavior of service instances. Navios DI supports three scopes:

### Singleton

One instance shared across the entire application. The instance is created on first access and reused for all subsequent requests.

**Use when:**
- Service is stateless
- Service is expensive to create
- Service manages shared resources
- Service provides utility functions

### Transient

New instance created for each injection. Each time the service is requested, a new instance is created.

**Use when:**
- Service holds request-specific state
- Service is lightweight
- You need isolated instances
- Service should not be shared

### Request

One instance per request context. The instance is shared within a request context (created via `ScopedContainer`) but isolated between different requests.

**Use when:**
- Service holds request-specific data
- You need isolation between concurrent requests
- Service should be cleaned up after request
- Service needs access to request metadata

## Container

The **Container** is the main entry point for dependency injection. It provides a high-level API for managing services.

### Container Responsibilities

- **Service Resolution**: Resolve services by their Injection Tokens
- **Dependency Injection**: Automatically resolve and inject dependencies
- **Lifecycle Management**: Manage service creation, initialization, and cleanup
- **Request Context Management**: Create and manage scoped containers for request-scoped services
- **Service Invalidation**: Invalidate services to force recreation

### Container Hierarchy

Containers can form a hierarchy:

- **Root Container**: The main container for singleton and transient services
- **ScopedContainer**: Created via `container.beginRequest()`, provides request-scoped services while delegating to the root container for singletons

## Registry

The **Registry** stores service metadata and factory information. It acts as a central repository for all registered services, organized by Injection Tokens.

### Registry Responsibilities

- **Service Storage**: Store service metadata indexed by Injection Token
- **Priority Management**: Track multiple registrations per token and select by priority
- **Metadata Management**: Store scope, priority, and other service metadata
- **Query Interface**: Provide methods to query registered services

### Registry Structure

The Registry maintains:
- A map of Injection Tokens to service metadata
- Priority information for each token
- Support for multiple registrations per token (with priority)

## Lifecycle

**Lifecycle** refers to the stages a service goes through from creation to destruction.

### Lifecycle Stages

1. **Registration**: Service is registered with the Registry (happens when decorator is executed)
2. **Resolution**: Service is requested from the Container
3. **Creation**: Service instance is created
4. **Dependency Injection**: Dependencies are injected into the service
5. **Initialization**: `onServiceInit()` is called if implemented
6. **Usage**: Service is ready for use
7. **Destruction**: `onServiceDestroy()` is called when service is invalidated
8. **Cleanup**: Resources are cleaned up

### Lifecycle Hooks

- **`OnServiceInit`**: Called after the service is instantiated and all dependencies are injected
- **`OnServiceDestroy`**: Called when the service is being destroyed

**Important**: Never access injected services in constructors. Use `onServiceInit()` for initialization logic that depends on other services.

## Invalidation

**Invalidation** is the process of destroying a service instance and forcing its recreation on the next access.

### Invalidation Process

When a service is invalidated:

1. The service's `onServiceDestroy()` hook is called if implemented
2. The service instance is removed from storage
3. Dependent services are also invalidated (propagation)
4. On next access, a new instance is created

### When Invalidation Happens

- Explicitly via `container.invalidate(service)`
- When the container is disposed
- When a request context ends (for request-scoped services)

## Priority System

The **Priority System** allows multiple services to register for the same Injection Token. The service with the highest priority is resolved when the token is requested.

### How Priority Works

- Each service registration can have a priority level (default: 0)
- When multiple services register for the same token, the highest priority one wins
- If priorities are equal, the last registered service wins
- Priority can be any number (higher = higher priority)

### Use Cases

- **Service Overrides**: Override default implementations with higher priority
- **Environment-Specific Implementations**: Different implementations for different environments
- **Feature Flags**: Enable/disable features by overriding services
- **Testing**: Override services with mocks in tests

## Dependency Injection Pattern

**Dependency Injection** is a design pattern where dependencies are provided to a class rather than created by it.

### Benefits

- **Loose Coupling**: Classes don't depend on concrete implementations
- **Testability**: Dependencies can be easily mocked
- **Flexibility**: Dependencies can be swapped without changing code
- **Maintainability**: Changes to dependencies don't require changes to dependents
- **Lifecycle Management**: Container manages service creation and cleanup

### How It Works

1. **Registration**: Services are registered with the DI container (via decorators)
2. **Injection**: Dependencies are requested using `inject()`, `asyncInject()`, or `optional()`
3. **Resolution**: The container automatically resolves and provides dependencies
4. **Lifecycle**: Services have scoped lifetimes and lifecycle hooks

## Next Steps

- **[Architecture Overview](/docs/di/di/architecture/overview)** - Understand the system architecture
- **[Getting Started](/docs/di/di/getting-started/setup)** - Start building with Navios DI
- **[Guides](/docs/di/di/guides/services)** - Learn about specific topics