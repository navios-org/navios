---
sidebar_position: 1
title: Modules
---

# Modules

Modules are the organizational units of a Navios application. They group related functionality and define clear boundaries between different parts of your application.

## Why Use Modules?

Modules solve several architectural problems:

- **Organization**: Group related controllers and services together
- **Encapsulation**: Define clear boundaries between features
- **Reusability**: Import modules to share functionality across your app
- **Scalability**: As your app grows, modules keep it manageable
- **Testing**: Test features in isolation by module

## Defining a Module

Use the `@Module()` decorator:

```typescript
import { Module } from '@navios/core'

@Module({
  controllers: [UserController, ProfileController],
})
class UserModule {}
```

## Module Options

| Option | Description |
|--------|-------------|
| `controllers` | Controllers that handle HTTP requests in this module |
| `imports` | Other modules whose functionality this module needs |
| `guards` | Guards applied to all controllers in this module |
| `overrides` | Service override classes to import for side effects (see [Service Overrides](#service-overrides)) |

## Root Module

Every Navios application has exactly one root module - the entry point that ties everything together:

```typescript
@Module({
  controllers: [AppController],
  imports: [UserModule, ProductModule, AuthModule],
})
class AppModule {}

// Bootstrap with root module
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})
```

The root module imports all feature modules. It's often lightweight, containing only configuration and imports.

## Feature Modules

Organize your application into feature modules, each handling a specific domain:

```typescript
// user.module.ts - handles user-related features
@Module({
  controllers: [UserController, ProfileController],
})
class UserModule {}

// product.module.ts - handles product catalog
@Module({
  controllers: [ProductController, CategoryController],
})
class ProductModule {}

// order.module.ts - handles orders, needs user and product data
@Module({
  controllers: [OrderController, CartController],
  imports: [UserModule, ProductModule],
})
class OrderModule {}
```

This separation makes large applications manageable. Each team can own specific modules.

## Importing Modules

Modules can import other modules to access their services:

```typescript
@Module({
  controllers: [AuthController],
})
class AuthModule {}

@Module({
  controllers: [UserController],
  imports: [AuthModule], // Can now use AuthModule's services
})
class UserModule {}
```

When you import a module, services registered in that module become available to the importing module through dependency injection.

## Module Guards

Apply guards to protect all controllers in a module:

```typescript
@Module({
  controllers: [AdminController, ReportController],
  guards: [AuthGuard, AdminGuard],
})
class AdminModule {}
```

Guards run in array order. All module guards must pass before endpoint guards are checked. This is useful for:

- Requiring authentication for all routes in a module
- Restricting access to admin-only sections
- Rate limiting entire feature areas

## Shared Modules

Create modules that provide services without controllers:

```typescript
@Module({
  controllers: [], // No controllers - this module provides services
})
class DatabaseModule {}

// Multiple modules can import DatabaseModule
@Module({
  controllers: [UserController],
  imports: [DatabaseModule],
})
class UserModule {}

@Module({
  controllers: [ProductController],
  imports: [DatabaseModule],
})
class ProductModule {}
```

Services defined in `DatabaseModule` are shared across all importing modules.

## Service Overrides

Navios uses InjectionTokens for dependency injection, allowing you to override services using priority. The `overrides` option ensures that override service classes are imported so their `@Injectable` decorators execute and register with the DI system.

### When to Use Overrides

Use `overrides` when you have service implementations that override other services using the same InjectionToken with a higher priority. These override classes are not "used" in the module - they're imported purely for side effects (decorator execution).

### Example: Overriding a Service

```typescript
// user.service.ts - Original service
import { Injectable, InjectionToken } from '@navios/di'

export const USER_SERVICE_TOKEN = InjectionToken.create<UserService>('UserService')

@Injectable({ token: USER_SERVICE_TOKEN, priority: 100 })
export class UserService {
  getUsers() {
    return ['Alice', 'Bob']
  }
}

// user.service.override.ts - Override service with higher priority
import { Injectable } from '@navios/di'
import { USER_SERVICE_TOKEN } from './user.service'

@Injectable({ token: USER_SERVICE_TOKEN, priority: 200 })
export class OverrideUserService {
  getUsers() {
    return ['Charlie', 'David'] // Override implementation
  }
}

// app.module.ts - Register the override
import { Module } from '@navios/core'
import { OverrideUserService } from './user.service.override'

@Module({
  controllers: [UserController],
  overrides: [OverrideUserService], // Ensures override is registered
})
export class AppModule {}
```

When `UserService` is injected using `USER_SERVICE_TOKEN`, the DI system will resolve `OverrideUserService` because it has the higher priority (200 > 100).

### Override Validation

The framework automatically validates overrides during module loading:

- **Warns** if an override class is not registered (missing `@Injectable` decorator)
- **Warns** if an override doesn't have the highest priority (another service with higher priority is active)
- **Logs debug message** when an override is successfully active

This helps catch configuration errors early and ensures your overrides are working as expected.

## Module Lifecycle

Modules can implement lifecycle hooks for initialization:

```typescript
import { Module, OnModuleInit } from '@navios/core'

@Module({
  controllers: [UserController],
})
class UserModule implements OnModuleInit {
  async onModuleInit() {
    console.log('UserModule initialized')
    // Connect to databases, warm caches, etc.
  }
}
```

## Best Practices

**One module per feature**: Don't put unrelated functionality in the same module.

```typescript
// Good - focused modules
@Module({ controllers: [UserController] })
class UserModule {}

@Module({ controllers: [PaymentController] })
class PaymentModule {}

// Avoid - mixed concerns
@Module({ controllers: [UserController, PaymentController] })
class AppModule {}
```

**Keep the root module slim**: It should mainly import other modules, not contain business logic.

**Use guards at the right level**: Module-level guards for broad protection, endpoint-level for specific routes.
