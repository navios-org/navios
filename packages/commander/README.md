# @navios/commander

A CLI command framework built on `@navios/di` that provides a decorator-based approach to building command-line applications, similar to how `@navios/core` works for HTTP applications.

## Installation

```bash
npm install @navios/commander @navios/di zod
```

## Features

- **Decorator-based**: Use `@Command` and `@CliModule` decorators to define commands and modules
- **Dependency Injection**: Full integration with `@navios/di`
- **Schema Validation**: Built-in support for Zod schemas to validate command options
- **Modular Architecture**: Organize commands into modules with imports support

## Usage

### Creating a Command

Commands are defined using the `@Command` decorator. Each command must implement the `CommandHandler` interface with an `execute` method.

```typescript
import { Command, CommandHandler } from '@navios/commander'
import { z } from 'zod'

const greetOptionsSchema = z.object({
  name: z.string(),
  greeting: z.string().optional().default('Hello'),
})

type GreetOptions = z.infer<typeof greetOptionsSchema>

@Command({
  path: 'greet',
  optionsSchema: greetOptionsSchema,
})
export class GreetCommand implements CommandHandler<GreetOptions> {
  async execute(options: GreetOptions) {
    console.log(`${options.greeting}, ${options.name}!`)
  }
}
```

### Creating a CLI Module

Modules organize commands and can import other modules:

```typescript
import { CliModule } from '@navios/commander'
import { GreetCommand } from './greet.command'

@CliModule({
  commands: [GreetCommand],
})
export class AppModule {}
```

### Bootstrapping the Application

Use `CommanderFactory` to create and run your CLI application:

```typescript
import { CommanderFactory } from '@navios/commander'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await CommanderFactory.create(AppModule)
  await app.init()

  // Run with command-line arguments
  await app.run(process.argv)

  await app.close()
}

bootstrap()
```

Then run your CLI:

```bash
node dist/cli.js greet --name World --greeting Hi
```

### Advanced Example with Dependency Injection

```typescript
import { Command, CommandHandler, CliModule } from '@navios/commander'
import { Injectable, inject } from '@navios/di'
import { z } from 'zod'

// Service
@Injectable()
class UserService {
  async getUser(id: string) {
    return { id, name: 'John Doe' }
  }
}

// Command with injected service
const userOptionsSchema = z.object({
  userId: z.string(),
})

@Command({
  path: 'user:show',
  optionsSchema: userOptionsSchema,
})
export class ShowUserCommand implements CommandHandler<z.infer<typeof userOptionsSchema>> {
  private userService = inject(UserService)

  async execute(options: { userId: string }) {
    const user = await this.userService.getUser(options.userId)
    console.log(`User: ${user.name} (ID: ${user.id})`)
  }
}

// Module
@CliModule({
  commands: [ShowUserCommand],
})
export class UserModule {}

@CliModule({
  imports: [UserModule],
})
export class AppModule {}
```

### Listing All Commands

```typescript
const app = await CommanderFactory.create(AppModule)
await app.init()

const commands = app.getAllCommands()
console.log('Available commands:')
commands.forEach(({ path }) => {
  console.log(`  - ${path}`)
})
```

## Advanced Usage

### Programmatic Command Execution

For advanced use cases where you need to execute commands programmatically (e.g., in tests or programmatic workflows), you can use `executeCommand`:

```typescript
import { CommanderFactory } from '@navios/commander'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await CommanderFactory.create(AppModule)
  await app.init()

  // Execute a command programmatically
  await app.executeCommand('greet', {
    name: 'World',
    greeting: 'Hi',
  })

  await app.close()
}

bootstrap()
```

This is useful for:
- Unit and integration testing
- Building CLI tools that wrap other CLI tools
- Programmatic automation workflows

## API Reference

### Decorators

#### `@Command(options)`

Defines a CLI command.

**Options:**
- `path: string` - The command path (e.g., 'user:create', 'db:migrate')
- `optionsSchema?: ZodSchema` - Optional Zod schema for validating command options

#### `@CliModule(options)`

Defines a CLI module.

**Options:**
- `commands?: ClassType[]` - Array of command classes
- `imports?: ClassType[]` - Array of other modules to import

### Interfaces

#### `CommandHandler<TOptions>`

Interface that command classes must implement.

```typescript
interface CommandHandler<TOptions = any> {
  execute(options: TOptions): void | Promise<void>
}
```

#### `CliModule`

Optional lifecycle hooks for modules.

```typescript
interface CliModule {
  onModuleInit?(): void | Promise<void>
  onModuleDestroy?(): void | Promise<void>
}
```

### Classes

#### `CommanderFactory`

Factory class for creating CLI applications.

**Methods:**
- `static async create(appModule, options?)` - Creates a new CommanderApplication

#### `CommanderApplication`

Main application class.

**Methods:**
- `async init()` - Initializes the application
- `async run(argv)` - Parses command-line arguments and executes the appropriate command (default usage)
- `async executeCommand(path, options?)` - Executes a command programmatically with options (advanced usage)
- `getAllCommands()` - Returns all registered commands
- `getContainer()` - Returns the DI container
- `async close()` - Closes the application

## License

MIT
