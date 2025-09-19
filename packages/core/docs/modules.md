# Modules

Modules in Navios are the primary building blocks for organizing your application. They provide a way to group related controllers, services, and other providers into cohesive units that can be easily managed and imported.

## What is a Module?

A module is a TypeScript class decorated with the `@Module()` decorator. It serves as a container for controllers, other modules, and shared guards. Modules help organize your application into logical boundaries and enable dependency injection across the application.

## Creating a Module

### Basic Module

```typescript
import { Module } from '@navios/core'

@Module()
export class AppModule {}
```

### Module with Controllers

```typescript
import { Module } from '@navios/core'

import { ProductController } from './product.controller'
import { UserController } from './user.controller'

@Module({
  controllers: [UserController, ProductController],
})
export class AppModule {}
```

### Module with Imports

```typescript
import { Module } from '@navios/core'

import { AuthModule } from './auth/auth.module'
import { UserModule } from './user/user.module'

@Module({
  imports: [UserModule, AuthModule],
})
export class AppModule {}
```

### Module with Guards

```typescript
import { Module } from '@navios/core'

import { AuthGuard } from './auth.guard'
import { UserController } from './user.controller'

@Module({
  controllers: [UserController],
  guards: [AuthGuard], // Applied to all controllers in this module
})
export class UserModule {}
```

## Module Options

The `@Module()` decorator accepts the following options:

### `controllers`

- **Type**: `ClassType[] | Set<ClassType>`
- **Description**: Array of controller classes that belong to this module
- **Example**:

```typescript
@Module({
  controllers: [UserController, PostController],
})
export class UserModule {}
```

### `imports`

- **Type**: `ClassType[] | Set<ClassType>`
- **Description**: Array of other modules to import into this module
- **Example**:

```typescript
@Module({
  imports: [DatabaseModule, AuthModule],
})
export class AppModule {}
```

### `guards`

- **Type**: `ClassType[] | Set<ClassType>`
- **Description**: Array of guard classes that will be applied to all controllers in this module
- **Example**:

```typescript
@Module({
  guards: [AuthGuard, RoleGuard],
})
export class ProtectedModule {}
```

## Module Lifecycle

Modules in Navios follow a specific lifecycle:

1. **Registration**: Modules are registered with the dependency injection container
2. **Import Resolution**: Imported modules are loaded recursively
3. **Controller Registration**: Controllers are registered and their endpoints discovered
4. **Guard Application**: Module-level guards are applied to all controllers
5. **Initialization**: Module initialization hooks are called

## Module Lifecycle Methods

### `onModuleInit`

The `onModuleInit` lifecycle method is called after the module has been initialized and all its dependencies have been resolved. This is useful for performing setup tasks, initializing connections, or running startup logic.

#### Interface

```typescript
interface NaviosModule {
  onModuleInit(): void | Promise<void>
}
```

#### Usage

To use the `onModuleInit` lifecycle method, implement the `NaviosModule` interface in your module class:

```typescript
import { Module, NaviosModule } from '@navios/core'

@Module({
  controllers: [UserController],
})
export class UserModule implements NaviosModule {
  onModuleInit() {
    console.log('UserModule has been initialized')
    // Perform initialization logic here
  }
}
```

#### Async Initialization

The `onModuleInit` method can be asynchronous, allowing you to perform async setup tasks:

```typescript
import { Module, NaviosModule } from '@navios/core'

@Module({
  controllers: [DatabaseController],
})
export class DatabaseModule implements NaviosModule {
  async onModuleInit() {
    console.log('Initializing database connection...')
    await this.connectToDatabase()
    console.log('Database connection established')
  }

  private async connectToDatabase() {
    // Database connection logic
    return new Promise((resolve) => setTimeout(resolve, 1000))
  }
}
```

#### Common Use Cases

- **Database Connections**: Initialize database connections or verify connectivity
- **Cache Warming**: Pre-populate caches with frequently accessed data
- **External Service Setup**: Initialize connections to external APIs or services
- **Configuration Validation**: Validate required configuration settings
- **Background Tasks**: Start background processes or scheduled tasks

```typescript
import { Module, NaviosModule } from '@navios/core'

@Module({
  controllers: [CacheController],
})
export class CacheModule implements NaviosModule {
  private cache = new Map<string, any>()

  async onModuleInit() {
    // Warm up the cache with initial data
    await this.warmUpCache()

    // Validate configuration
    this.validateConfiguration()

    console.log('CacheModule initialized successfully')
  }

  private async warmUpCache() {
    // Pre-populate cache with frequently accessed data
    this.cache.set('app:config', await this.loadAppConfig())
    this.cache.set('user:defaults', await this.loadUserDefaults())
  }

  private validateConfiguration() {
    if (!process.env.CACHE_TTL) {
      throw new Error('CACHE_TTL environment variable is required')
    }
  }

  private async loadAppConfig() {
    // Load application configuration
    return { theme: 'dark', language: 'en' }
  }

  private async loadUserDefaults() {
    // Load default user settings
    return { notifications: true, theme: 'auto' }
  }
}
```

#### Execution Order

The `onModuleInit` methods are called in dependency order:

1. **Imported modules first**: All imported modules' `onModuleInit` methods are called before the current module
2. **Current module last**: The current module's `onModuleInit` method is called after all its dependencies

```typescript
@Module({
  imports: [DatabaseModule, CacheModule], // These initialize first
})
export class AppModule implements NaviosModule {
  onModuleInit() {
    // This runs after DatabaseModule and CacheModule have been initialized
    console.log('AppModule initialized - all dependencies are ready')
  }
}
```

## Module Metadata

Each module decorated with `@Module()` has associated metadata that Navios uses internally:

```typescript
export interface ModuleMetadata {
  controllers: Set<ClassType>
  imports: Set<ClassType>
  guards: Set<ClassType>
  attributes: Map<symbol, unknown>
}
```

## Best Practices

### 1. Feature-Based Organization

Organize modules around business features rather than technical layers:

```typescript
// ✅ Good - Feature-based
@Module({
  controllers: [UserController],
  imports: [UserDatabaseModule],
})
export class UserModule {}

// ❌ Avoid - Layer-based
@Module({
  controllers: [UserController, ProductController, OrderController],
})
export class ControllersModule {}
```

### 2. Single Responsibility

Each module should have a single, well-defined responsibility:

```typescript
// ✅ Good - Single responsibility
@Module({
  controllers: [AuthController],
  imports: [JwtModule],
})
export class AuthModule {}

// ❌ Avoid - Multiple responsibilities
@Module({
  controllers: [AuthController, UserController, ProductController],
})
export class EverythingModule {}
```

### 3. Explicit Dependencies

Always explicitly import the modules you depend on:

```typescript
// ✅ Good - Explicit imports
@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [UserController],
})
export class UserModule {}
```

### 4. Module Composition

Build complex applications by composing smaller, focused modules:

```typescript
@Module({
  imports: [AuthModule, UserModule, ProductModule, OrderModule],
})
export class AppModule {}
```

## Advanced Usage

### Conditional Module Loading

You can conditionally include modules based on environment or configuration:

```typescript
import { Module } from '@navios/core'

const imports = [CoreModule]
if (process.env.NODE_ENV === 'development') {
  imports.push(DevToolsModule)
}

@Module({
  imports,
  controllers: [AppController],
})
export class AppModule {}
```

### Module with Complex Guard Setup

```typescript
import { Module } from '@navios/core'

import { AuthGuard, RoleGuard, ThrottleGuard } from './guards'

@Module({
  guards: [
    AuthGuard, // Applied first
    RoleGuard, // Applied second
    ThrottleGuard, // Applied last
  ],
  controllers: [AdminController],
})
export class AdminModule {}
```

## Testing Modules

When testing modules, you can create test-specific module configurations:

```typescript
import { Module } from '@navios/core'

import { MockUserService } from './mocks/user.service'
import { UserController } from './user.controller'

@Module({
  controllers: [UserController],
  // Use mock services for testing
})
export class TestUserModule {}
```

## Module Discovery

Navios automatically discovers and registers modules through the module tree starting from your root application module.
