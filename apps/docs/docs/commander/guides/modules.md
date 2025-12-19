---
sidebar_position: 2
---

# Modules

Modules organize commands and provide a way to structure your CLI application. This guide covers how to create and use modules effectively.

## What is a Module?

A module is a class decorated with `@CliModule` that groups related commands together. Modules can also import other modules to compose larger applications.

## Basic Module

The simplest module contains a list of commands:

```typescript
import { CliModule } from '@navios/commander'
import { GreetCommand } from './greet.command'
import { VersionCommand } from './version.command'

@CliModule({
  commands: [GreetCommand, VersionCommand],
})
export class AppModule {}
```

## Module with Imports

Modules can import other modules to compose larger applications:

```typescript
import { CliModule } from '@navios/commander'
import { UserModule } from './user.module'
import { DatabaseModule } from './database.module'

@CliModule({
  imports: [UserModule, DatabaseModule],
})
export class AppModule {}
```

## Module with Commands and Imports

Modules can have both their own commands and import other modules:

```typescript
import { CliModule } from '@navios/commander'
import { GreetCommand } from './greet.command'
import { UserModule } from './user.module'

@CliModule({
  commands: [GreetCommand],
  imports: [UserModule],
})
export class AppModule {}
```

## Organizing by Feature

Group related commands into feature modules:

### User Module

```typescript
import { CliModule } from '@navios/commander'
import { CreateUserCommand } from './commands/create-user.command'
import { DeleteUserCommand } from './commands/delete-user.command'
import { ListUsersCommand } from './commands/list-users.command'

@CliModule({
  commands: [
    CreateUserCommand,
    DeleteUserCommand,
    ListUsersCommand,
  ],
})
export class UserModule {}
```

### Database Module

```typescript
import { CliModule } from '@navios/commander'
import { MigrateCommand } from './commands/migrate.command'
import { SeedCommand } from './commands/seed.command'
import { ResetCommand } from './commands/reset.command'

@CliModule({
  commands: [
    MigrateCommand,
    SeedCommand,
    ResetCommand,
  ],
})
export class DatabaseModule {}
```

### Root Module

```typescript
import { CliModule } from '@navios/commander'
import { UserModule } from './user/user.module'
import { DatabaseModule } from './database/database.module'
import { GreetCommand } from './greet.command'

@CliModule({
  commands: [GreetCommand],
  imports: [UserModule, DatabaseModule],
})
export class AppModule {}
```

## Module Lifecycle

Modules can implement lifecycle hooks from `@navios/core`:

```typescript
import { CliModule } from '@navios/commander'
import type { NaviosModule } from '@navios/core'

@CliModule({
  commands: [GreetCommand],
})
export class AppModule implements NaviosModule {
  async onModuleInit() {
    console.log('AppModule initialized')
    // Module initialization logic
  }
}
```

## Nested Module Imports

Modules can import other modules that also import modules:

```typescript
// User Module
@CliModule({
  commands: [CreateUserCommand, DeleteUserCommand],
})
export class UserModule {}

// Admin Module (imports User Module)
@CliModule({
  commands: [AdminCommand],
  imports: [UserModule], // Commands from UserModule are available
})
export class AdminModule {}

// Root Module (imports Admin Module)
@CliModule({
  imports: [AdminModule], // All commands from AdminModule and UserModule are available
})
export class AppModule {}
```

## Module Best Practices

### 1. Group Related Commands

Organize commands by feature or domain:

```typescript
// ✅ Good: Commands grouped by feature
@CliModule({
  commands: [
    CreateUserCommand,
    DeleteUserCommand,
    ListUsersCommand,
  ],
})
export class UserModule {}

// ❌ Avoid: Unrelated commands together
@CliModule({
  commands: [
    CreateUserCommand,
    MigrateCommand,
    SendEmailCommand,
  ],
})
export class MixedModule {}
```

### 2. Use Feature Modules

Create modules for each feature area:

```typescript
// ✅ Good: Feature-based modules
@CliModule({ commands: [...] })
export class UserModule {}

@CliModule({ commands: [...] })
export class DatabaseModule {}

@CliModule({ commands: [...] })
export class EmailModule {}

@CliModule({
  imports: [UserModule, DatabaseModule, EmailModule],
})
export class AppModule {}
```

### 3. Keep Modules Focused

Each module should have a clear purpose:

```typescript
// ✅ Good: Focused module
@CliModule({
  commands: [
    CreateUserCommand,
    UpdateUserCommand,
    DeleteUserCommand,
  ],
})
export class UserModule {}

// ❌ Avoid: Module doing too much
@CliModule({
  commands: [
    CreateUserCommand,
    MigrateCommand,
    SendEmailCommand,
    ProcessPaymentCommand,
  ],
})
export class EverythingModule {}
```

### 4. Use Imports for Composition

Compose larger applications from smaller modules:

```typescript
// ✅ Good: Composed from feature modules
@CliModule({
  imports: [
    UserModule,
    DatabaseModule,
    EmailModule,
  ],
})
export class AppModule {}

// ❌ Avoid: Everything in one module
@CliModule({
  commands: [
    // 50+ commands...
  ],
})
export class MonolithicModule {}
```

### 5. Organize by Directory Structure

Match your module structure to your directory structure:

```
src/
  commands/
    user/
      create-user.command.ts
      delete-user.command.ts
      user.module.ts
    database/
      migrate.command.ts
      seed.command.ts
      database.module.ts
  app.module.ts
```

## Module Examples

### Simple CLI Tool

```typescript
@CliModule({
  commands: [
    BuildCommand,
    TestCommand,
    LintCommand,
  ],
})
export class CliModule {}
```

### Multi-Feature Application

```typescript
// Feature modules
@CliModule({ commands: [...] })
export class UserModule {}

@CliModule({ commands: [...] })
export class ProductModule {}

@CliModule({ commands: [...] })
export class OrderModule {}

// Root module
@CliModule({
  imports: [
    UserModule,
    ProductModule,
    OrderModule,
  ],
})
export class AppModule {}
```

### Development Tools

```typescript
@CliModule({ commands: [...] })
export class DatabaseModule {}

@CliModule({ commands: [...] })
export class MigrationModule {}

@CliModule({ commands: [...] })
export class SeedModule {}

@CliModule({
  imports: [
    DatabaseModule,
    MigrationModule,
    SeedModule,
  ],
})
export class DevToolsModule {}
```

## Module Registration

Modules are automatically registered when you create the application:

```typescript
import { CommanderFactory } from '@navios/commander'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await CommanderFactory.create(AppModule)
  await app.init() // Modules are loaded here
  await app.run(process.argv)
  await app.close()
}

bootstrap()
```

## Module Discovery

All commands from imported modules are automatically available:

```typescript
// UserModule has: user:create, user:delete
@CliModule({
  commands: [CreateUserCommand, DeleteUserCommand],
})
export class UserModule {}

// AppModule imports UserModule
@CliModule({
  imports: [UserModule],
})
export class AppModule {}

// All commands are available:
// - user:create
// - user:delete
```

## Next Steps

- Learn about [commands](/docs/commander/guides/commands) in detail
- Explore [dependency injection](/docs/commander/guides/dependency-injection) in modules
- Check out [best practices](/docs/commander/best-practices) for module organization

