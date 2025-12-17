---
sidebar_position: 1
title: Modules
---

# Modules

Modules are the organizational units of a Navios application. They group related functionality and define boundaries between different parts of your application.

## Defining a Module

Use the `@Module()` decorator to define a module:

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
| `controllers` | Array of controller classes to register |
| `imports` | Array of modules to import |
| `guards` | Array of guards to apply to all controllers |

## Root Module

Every Navios application has a root module that serves as the entry point:

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

## Importing Modules

Modules can import other modules to access their functionality:

```typescript
@Module({
  controllers: [AuthController],
})
class AuthModule {}

@Module({
  controllers: [UserController],
  imports: [AuthModule],
})
class UserModule {}

@Module({
  imports: [UserModule, AuthModule],
})
class AppModule {}
```

## Module Guards

Apply guards to all controllers in a module:

```typescript
@Module({
  controllers: [AdminController, ReportController],
  guards: [AuthGuard, AdminGuard],
})
class AdminModule {}
```

Guards run in the order they are defined. All module guards must pass before endpoint guards are checked.

## Feature Modules

Organize your application into feature modules:

```typescript
// user.module.ts
@Module({
  controllers: [UserController, ProfileController],
})
class UserModule {}

// product.module.ts
@Module({
  controllers: [ProductController, CategoryController],
})
class ProductModule {}

// order.module.ts
@Module({
  controllers: [OrderController, CartController],
  imports: [UserModule, ProductModule],
})
class OrderModule {}

// app.module.ts
@Module({
  imports: [UserModule, ProductModule, OrderModule],
})
class AppModule {}
```

## Shared Modules

Create modules that provide shared services:

```typescript
@Module({
  controllers: [],
})
class DatabaseModule {}

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

## Module Lifecycle

Modules can implement lifecycle hooks:

```typescript
import { Module, OnModuleInit } from '@navios/core'

@Module({
  controllers: [UserController],
})
class UserModule implements OnModuleInit {
  async onModuleInit() {
    console.log('UserModule initialized')
    // Perform setup tasks
  }
}
```
