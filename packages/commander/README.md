# @navios/commander

A CLI command framework built on `@navios/core` that provides a decorator-based approach to building command-line applications. It uses the same patterns and architecture as Navios HTTP applications, making it easy to share code and services between your CLI tools and web servers.

## Installation

```bash
npm install @navios/commander zod
```

## Features

- **Decorator-based**: Use `@Command` and `@CliModule` decorators to define commands and modules
- **Dependency Injection**: Full DI support via `@navios/core` with request-scoped command execution
- **Schema Validation**: Built-in support for Zod schemas to validate command options
- **Modular Architecture**: Organize commands into modules with imports support
- **Built-in Help**: Automatic `help` command and `--help` flag support with Zod meta descriptions

## Usage

### Creating a Command

Commands are defined using the `@Command` decorator. Each command must implement the `CommandHandler` interface with an `execute` method.

```typescript
import { Command, CommandHandler } from '@navios/commander'

import { z } from 'zod'

const greetOptionsSchema = z.object({
  name: z.string().meta({ description: 'Name of the person to greet' }),
  greeting: z.string().optional().default('Hello').meta({ description: 'Greeting message' }),
})

type GreetOptions = z.infer<typeof greetOptionsSchema>

@Command({
  path: 'greet',
  description: 'Greet a user with a custom message',
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
  // Optional: overrides for service implementations with higher priority
  // overrides: [OverrideService],
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

  // Get the adapter and run with command-line arguments
  const adapter = app.getAdapter()
  await adapter.run(process.argv)

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
import {
  CliModule,
  Command,
  CommandHandler,
  inject,
  Injectable,
} from '@navios/commander'

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
export class ShowUserCommand implements CommandHandler<
  z.infer<typeof userOptionsSchema>
> {
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

### Accessing ExecutionContext

The `ExecutionContext` provides access to the current command execution information, including the module metadata, command metadata, command path, and options. This is useful for middleware, guards, or any service that needs context about the current command execution.

```typescript
import {
  Command,
  CommandExecutionContext,
  CommandHandler,
  inject,
  Injectable,
} from '@navios/commander'

@Injectable()
class CommandLogger {
  private executionContext = inject(CommandExecutionContext)

  logCommandInfo() {
    const ctx = this.executionContext
    console.log('Command Path:', ctx.getCommandPath())
    console.log('Command Options:', ctx.getOptions())
    console.log('Command Metadata:', ctx.getCommand())
  }
}

@Command({ path: 'example' })
export class ExampleCommand implements CommandHandler {
  private logger = inject(CommandLogger)

  async execute(options: any) {
    this.logger.logCommandInfo()
    // Your command logic here
  }
}
```

The `ExecutionContext` provides the following methods:

- `getCommand()` - Returns the command metadata
- `getCommandPath()` - Returns the command path (e.g., 'user:create')
- `getOptions()` - Returns the validated command options

### Listing All Commands

```typescript
const app = await CommanderFactory.create(AppModule)
await app.init()

const adapter = app.getAdapter()
const commands = adapter.getAllCommands()
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
  const adapter = app.getAdapter()
  await adapter.executeCommand('greet', {
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
- `description?: string` - Optional description for help text
- `optionsSchema?: ZodSchema` - Optional Zod schema for validating command options

#### `@CliModule(options)`

Defines a CLI module.

**Options:**

- `commands?: ClassType[]` - Array of command classes
- `imports?: ClassType[]` - Array of other modules to import
- `overrides?: ClassType[]` - Array of service override classes to import for side effects (ensures `@Injectable` decorators execute)

### Interfaces

#### `CommandHandler<TOptions>`

Interface that command classes must implement.

```typescript
interface CommandHandler<TOptions = any> {
  execute(options: TOptions): void | Promise<void>
}
```

#### `Module` (alias for `NaviosModule`)

Optional lifecycle hooks for modules. This is an alias for `NaviosModule` from `@navios/core`.

```typescript
interface NaviosModule {
  onModuleInit?: () => Promise<void> | void
}
```

### Classes

#### `CommanderFactory`

Factory class for creating CLI applications.

**Methods:**

- `static async create(appModule, options?)` - Creates a new CommanderApplication

#### `NaviosApplication`

Main application class returned by `CommanderFactory.create()`.

**Methods:**

- `async init()` - Initializes the application
- `getAdapter()` - Returns the CLI adapter for running commands
- `getContainer()` - Returns the DI container
- `async close()` - Closes the application

#### `AbstractCliAdapterInterface`

CLI adapter interface returned by `app.getAdapter()`.

**Methods:**

- `async run(argv)` - Parses command-line arguments and executes the appropriate command
- `async executeCommand(path, options?)` - Executes a command programmatically with options
- `getAllCommands()` - Returns all registered commands

## License

MIT
