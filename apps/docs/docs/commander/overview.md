---
sidebar_position: 2
---

# Overview

Navios Commander is a CLI command framework built on `@navios/di` that provides a decorator-based approach to building command-line applications, similar to how `@navios/core` works for HTTP applications.

**Package:** `@navios/commander`  
**License:** MIT  
**Peer Dependencies:** `@navios/di`, `zod` (^4.0.0)

## Installation

```bash
npm install @navios/commander @navios/di zod
# or
yarn add @navios/commander @navios/di zod
# or
pnpm add @navios/commander @navios/di zod
```

## Core Concepts

### Decorator-Based Commands

Commands are defined using the `@Command` decorator, similar to how controllers work in `@navios/core`:

```typescript
@Command({ path: 'greet' })
export class GreetCommand implements CommandHandler {
  async execute(options) {
    console.log('Hello!')
  }
}
```

### Modular Architecture

Commands are organized into modules using the `@CliModule` decorator:

```typescript
@CliModule({
  commands: [GreetCommand],
  imports: [OtherModule],
})
export class AppModule {}
```

### Dependency Injection

Full integration with `@navios/di` allows you to inject services into commands:

```typescript
@Command({ path: 'user:show' })
export class ShowUserCommand implements CommandHandler {
  private userService = inject(UserService)

  async execute(options) {
    const user = await this.userService.getUser(options.userId)
    console.log(user)
  }
}
```

### Schema Validation

Built-in support for Zod schemas to validate command options:

```typescript
const optionsSchema = z.object({
  name: z.string(),
  age: z.number().min(18),
})

@Command({
  path: 'create-user',
  optionsSchema: optionsSchema,
})
export class CreateUserCommand implements CommandHandler<
  z.infer<typeof optionsSchema>
> {
  async execute(options) {
    // options are validated and typed
  }
}
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Decorator-based** | Use `@Command` and `@CliModule` decorators to define commands and modules |
| **Dependency Injection** | Full integration with `@navios/di` for service injection |
| **Schema Validation** | Built-in support for Zod schemas to validate command options |
| **Modular Architecture** | Organize commands into modules with imports support |
| **Type Safety** | Full TypeScript support with type inference from schemas |
| **Execution Context** | Access command execution information via `CommandExecutionContext` |
| **Programmatic API** | Execute commands programmatically for testing and automation |

## Architecture

### Command Lifecycle

1. **Registration** - Commands are registered via `@Command` decorator
2. **Module Loading** - Modules are loaded and commands are collected
3. **Initialization** - Application initializes and prepares command handlers
4. **Execution** - Commands are executed with validated options
5. **Cleanup** - Resources are cleaned up after execution

### Request Context

Each command execution runs in its own request context, allowing for:
- Request-scoped services
- Execution context access
- Isolated dependency resolution

## Comparison with Other CLI Frameworks

### vs Commander.js

| Feature | Navios Commander | Commander.js |
|---------|------------------|--------------|
| Type Safety | Full TypeScript support | Limited |
| Dependency Injection | Built-in with `@navios/di` | Manual |
| Schema Validation | Zod integration | Manual validation |
| Modular Architecture | Module-based | Programmatic |

### vs NestJS CLI

| Feature | Navios Commander | NestJS CLI |
|---------|------------------|------------|
| Framework | Standalone | Part of NestJS |
| DI System | `@navios/di` | NestJS DI |
| Decorators | ES Decorators | Legacy decorators |
| Size | Lightweight | Full framework |

## Use Cases

### CLI Tools

Build command-line tools with type-safe options and dependency injection:

```typescript
@Command({ path: 'build' })
export class BuildCommand implements CommandHandler {
  private builder = inject(BuilderService)

  async execute(options) {
    await this.builder.build(options.target)
  }
}
```

### Development Scripts

Create development scripts with validation and services:

```typescript
@Command({ path: 'db:migrate' })
export class MigrateCommand implements CommandHandler {
  private db = inject(DatabaseService)

  async execute(options) {
    await this.db.migrate(options.version)
  }
}
```

### Automation Workflows

Build automation workflows with programmatic command execution:

```typescript
const app = await CommanderFactory.create(AppModule)
await app.init()

await app.executeCommand('deploy', { environment: 'production' })
await app.executeCommand('test', { coverage: true })
```

## Integration with Navios Ecosystem

### With @navios/di

Commander uses `@navios/di` for dependency injection. All DI features are available:

- Service injection with `inject()`
- Request-scoped services
- Lifecycle hooks
- Injection tokens

Learn more about [dependency injection in commands](/docs/commander/guides/dependency-injection).

### With @navios/core

You can share services between your HTTP server and CLI commands:

```typescript
// Shared service
@Injectable()
class UserService {
  async getUser(id: string) {
    // Shared logic
  }
}

// Use in HTTP controller
@Controller('/users')
export class UserController {
  private userService = inject(UserService)
  // ...
}

// Use in CLI command
@Command({ path: 'user:show' })
export class ShowUserCommand implements CommandHandler {
  private userService = inject(UserService)
  // ...
}
```

## Next Steps

- **[Getting Started](/docs/commander/getting-started)** - Set up your first command
- **[Commands Guide](/docs/commander/guides/commands)** - Learn how to create commands
- **[Modules Guide](/docs/commander/guides/modules)** - Organize commands into modules
- **[Dependency Injection](/docs/commander/guides/dependency-injection)** - Use DI in commands
- **[API Reference](/docs/commander/api-reference)** - Complete API documentation


