---
sidebar_position: 1
---

# @navios/di

A powerful, type-safe dependency injection framework for TypeScript. It provides decorator-based service registration, multiple injection scopes, lifecycle management, and comprehensive async support.

**Package:** `@navios/di`
**License:** MIT
**Peer Dependencies:** `zod` (^3.25.0 || ^4.0.0)
**Platforms:** Node.js, Bun, Deno, Browser

## Installation

```bash
npm install @navios/di zod
# or
yarn add @navios/di zod
# or
pnpm add @navios/di zod
```

## Foundation: Injection Tokens

**Navios DI is built on Injection Tokens.** Every service and factory has an Injection Token that identifies it in the DI system:

- **Auto-created tokens**: When you use `@Injectable()` or `@Factory()` without a `token` option, the DI system automatically creates a token from the class
- **Explicit tokens**: You can provide your own token using the `token` option

The token is what the Registry uses to store service metadata and what the Container uses to resolve services. This token-based system enables:
- Multiple services per token (with priority-based resolution)
- Interface-based injection
- Dynamic service resolution
- Service overrides

## Core Concepts

### Dependency Injection Pattern

Dependency Injection (DI) is a design pattern that helps manage dependencies between components. Instead of creating dependencies directly, services declare what they need, and the DI container provides them automatically.

**The DI system follows a registration-resolution pattern:**

1. **Registration** - Services are registered via decorators (`@Injectable`, `@Factory`), each with an Injection Token
2. **Resolution** - Dependencies are resolved via injection functions (`inject`, `asyncInject`, `optional`) using their tokens
3. **Lifecycle** - Services have scoped lifetimes and lifecycle hooks

**Benefits:**
- **Loose coupling**: Services don't need to know how to create their dependencies
- **Testability**: Easy to mock dependencies for testing
- **Flexibility**: Swap implementations without changing dependent code
- **Lifecycle management**: Container manages service creation and cleanup

### Key Components

| Component | Purpose |
|-----------|---------|
| `Registry` | Central storage for service metadata, organized by Injection Tokens, with priority support |
| `Container` | Main entry point for service resolution by Injection Token |
| `UnifiedStorage` | Unified storage for all service scopes |
| `ServiceInitializer` | Creates service instances |
| `InstanceResolver` | Resolves service instances and dependencies |
| `InjectionToken` | Type-safe tokens that identify services in the DI system |

## Quick Overview

- **Services**: Classes decorated with `@Injectable()` that have Injection Tokens
- **Factories**: Classes decorated with `@Factory()` that return created objects
- **Scopes**: Singleton (default), Transient, or Request lifetime
- **Priority**: Multiple services can register for the same token; highest priority wins
- **Lifecycle**: `OnServiceInit` and `OnServiceDestroy` hooks for initialization and cleanup

## Next Steps

- **[Getting Started](/docs/di/di/getting-started/setup)** - Set up your project and create your first service
- **[Architecture](/docs/di/di/architecture/overview)** - Understand the DI system architecture
- **[Core Concepts](/docs/di/di/architecture/core-concepts)** - Deep dive into core concepts
- **[Guides](/docs/di/di/guides/services)** - Learn about specific topics
