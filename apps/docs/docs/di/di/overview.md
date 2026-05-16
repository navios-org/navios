---
sidebar_position: 1
---

# @navios/di

A powerful, type-safe dependency injection framework for TypeScript. It provides decorator-based service registration, multiple injection scopes, lifecycle management, and comprehensive async support.

**Package:** `@navios/di`
**License:** MIT
**Peer Dependencies:** a Standard-Schema validator (zod v4, Valibot, ArkType, …) — only if you use schema tokens
**Platforms:** Node.js, Bun, Deno, Browser (requires stage-3 decorators + decorator metadata)

## Installation

```bash
npm install @navios/di
# or
yarn add @navios/di
# or
pnpm add @navios/di
```

## Foundation: Tokens

**Navios DI is built on `Token`s** (renamed from v1's `InjectionToken`). Every service and factory has a `Token` that identifies it in the DI system:

- **Auto-created tokens**: When you use `@Injectable()` or `@Factory()` without a `token` option, the DI system automatically creates a token from the class
- **Explicit tokens**: You can provide your own token using the `token` option (`Token.create(...)`)

The token is what the Registry uses to store service metadata and what the Container uses to resolve services. This token-based system enables:
- Multiple services per token (with priority-based resolution)
- Interface-based injection
- Dynamic service resolution
- Service overrides

## Core Concepts

### Dependency Injection Pattern

Dependency Injection (DI) is a design pattern that helps manage dependencies between components. Instead of creating dependencies directly, services declare what they need, and the DI container provides them automatically.

**The DI system follows a registration-resolution pattern:**

1. **Registration** - Services are registered via decorators (`@Injectable`, `@Factory`), each with a `Token`
2. **Resolution** - Dependencies are declared with the field decorators (`@Inject`, `@InjectLazy`, `@InjectOptional`, `@InjectDerived`) on `accessor` fields and resolved by the container using their tokens
3. **Lifecycle** - Services have scoped lifetimes and lifecycle hooks

**Benefits:**
- **Loose coupling**: Services don't need to know how to create their dependencies
- **Testability**: Easy to mock dependencies for testing
- **Flexibility**: Swap implementations without changing dependent code
- **Lifecycle management**: Container manages service creation and cleanup

### Key Components

| Component | Purpose |
|-----------|---------|
| `Registry` | Central storage for service metadata, organized by `Token`s, with priority support |
| `Container` | Main entry point for service resolution by `Token` |
| `ScopedContainer` | Per-request container created via `Container.beginRequest()` |
| `PluginRegistry` | Holds plugins, composes middleware, dispatches lifecycle hooks |
| `Token` | Type-safe tokens that identify services in the DI system (`BoundToken` / `FactoryToken` variants) |

## Quick Overview

- **Services**: Classes decorated with `@Injectable()` that have `Token`s
- **Factories**: Classes decorated with `@Factory()` that return created objects
- **Scopes**: Singleton (default), Transient, or Request lifetime
- **Priority**: Multiple services can register for the same token; highest priority wins
- **Lifecycle**: `OnServiceInit` and `OnServiceDestroy` hooks for initialization and cleanup

## Next Steps

- **[Getting Started](/docs/di/di/getting-started/setup)** - Set up your project and create your first service
- **[Architecture](/docs/di/di/architecture/overview)** - Understand the DI system architecture
- **[Core Concepts](/docs/di/di/architecture/core-concepts)** - Deep dive into core concepts
- **[Guides](/docs/di/di/guides/services)** - Learn about specific topics
