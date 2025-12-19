---
sidebar_position: 1
---

# Getting Started

Get up and running with Navios Commander in minutes. This guide will walk you through installation, basic setup, and your first CLI command.

## Installation

Install Navios Commander using your preferred package manager:

```bash
# npm
npm install @navios/commander @navios/di zod

# yarn
yarn add @navios/commander @navios/di zod

# pnpm
pnpm add @navios/commander @navios/di zod
```

:::info
`@navios/di` and `zod` are peer dependencies required for dependency injection and schema validation. Make sure to install them alongside `@navios/commander`.
:::

## Prerequisites

- **Node.js**: 18 or higher
- **TypeScript**: 4.5 or higher
- **Modern TypeScript project**: ES2022+ target recommended

## TypeScript Configuration

Make sure your `tsconfig.json` has the correct settings for decorators:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node16",
    "experimentalDecorators": false
  }
}
```

:::important
Navios Commander uses native ES decorators, not legacy decorators. Ensure `experimentalDecorators` is set to `false` (or omitted).
:::

## Your First Command

Let's create a simple "greet" command that takes a name and optional greeting:

### 1. Create a Command

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

### 2. Create a CLI Module

Modules organize commands and can import other modules:

```typescript
import { CliModule } from '@navios/commander'
import { GreetCommand } from './greet.command'

@CliModule({
  commands: [GreetCommand],
})
export class AppModule {}
```

### 3. Bootstrap the Application

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

### 4. Run Your CLI

Build your TypeScript code and run it:

```bash
# Build your project
npm run build

# Run the command
node dist/cli.js greet --name World --greeting Hi
# Output: Hi, World!
```

## Understanding the Example

### Command Registration

The `@Command` decorator marks a class as a CLI command:

```typescript
@Command({
  path: 'greet',                    // Command path
  optionsSchema: greetOptionsSchema // Optional Zod schema for validation
})
export class GreetCommand implements CommandHandler<GreetOptions> {
  // Command implementation
}
```

### Command Handler

Commands must implement the `CommandHandler` interface with an `execute` method:

```typescript
interface CommandHandler<TOptions> {
  execute(options: TOptions): void | Promise<void>
}
```

### Module Organization

The `@CliModule` decorator organizes commands:

```typescript
@CliModule({
  commands: [GreetCommand],  // Commands in this module
  imports: [OtherModule]     // Optional: import other modules
})
export class AppModule {}
```

### Application Bootstrap

The `CommanderFactory` creates and initializes your CLI application:

```typescript
const app = await CommanderFactory.create(AppModule)
await app.init()              // Load modules and register commands
await app.run(process.argv)   // Parse and execute commands
await app.close()             // Clean up resources
```

## Command-Line Usage

### Basic Command Execution

```bash
node dist/cli.js greet --name World
# Output: Hello, World!
```

### With Options

```bash
node dist/cli.js greet --name World --greeting Hi
# Output: Hi, World!
```

### Help Command

```bash
node dist/cli.js help
# or
node dist/cli.js --help
# or
node dist/cli.js -h
```

## Adding Dependency Injection

Commands can use dependency injection to access services:

```typescript
import { Command, CommandHandler } from '@navios/commander'
import { inject, Injectable } from '@navios/di'
import { z } from 'zod'

// Service
@Injectable()
class UserService {
  async getUser(id: string) {
    return { id, name: 'John Doe', email: 'john@example.com' }
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
    console.log(`Email: ${user.email}`)
  }
}
```

Learn more about [dependency injection in commands](/docs/commander/guides/dependency-injection).

## Next Steps

Now that you have the basics down, explore these topics:

- **[Commands](/docs/commander/guides/commands)** - Learn how to create and structure commands
- **[Modules](/docs/commander/guides/modules)** - Organize commands into modules
- **[Dependency Injection](/docs/commander/guides/dependency-injection)** - Use DI in your commands
- **[Validation](/docs/commander/guides/validation)** - Validate command options with Zod
- **[Execution Context](/docs/commander/guides/execution-context)** - Access command execution information
- **[Testing](/docs/commander/guides/testing)** - Test your commands

## Common Patterns

### Command with Multiple Options

```typescript
const createUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().min(18).optional(),
  admin: z.boolean().default(false),
})

@Command({
  path: 'user:create',
  optionsSchema: createUserSchema,
})
export class CreateUserCommand implements CommandHandler<
  z.infer<typeof createUserSchema>
> {
  async execute(options) {
    console.log('Creating user:', options)
    // Create user logic
  }
}
```

### Command Namespaces

Use colons to create command namespaces:

```typescript
@Command({ path: 'user:create' })
export class CreateUserCommand {}

@Command({ path: 'user:delete' })
export class DeleteUserCommand {}

@Command({ path: 'user:list' })
export class ListUsersCommand {}
```

### Command Without Options

```typescript
@Command({ path: 'version' })
export class VersionCommand implements CommandHandler {
  async execute() {
    console.log('1.0.0')
  }
}
```

## Troubleshooting

### Command Not Found

**Problem**: Getting "Command not found" error.

**Solution**:
- Make sure the command is registered in a module
- Verify the module is imported in your root module
- Check that `app.init()` was called before `app.run()`

### Options Not Validated

**Problem**: Options are not being validated.

**Solution**:
- Ensure you provided an `optionsSchema` in the `@Command` decorator
- Verify the schema is a valid Zod schema
- Check that options match the schema structure

### Services Not Injected

**Problem**: Injected services are `undefined` or not working.

**Solution**:
- Make sure services are decorated with `@Injectable()`
- Verify services are imported before use
- Check that the DI container is properly initialized

### Type Errors

**Problem**: TypeScript type errors with command options.

**Solution**:
- Use `z.infer<typeof schema>` to get the correct type
- Ensure the `CommandHandler` interface uses the correct type parameter
- Check that all dependencies are properly typed

## Getting Help

- Check the [API Reference](/docs/commander/api-reference) for complete method signatures
- Review the [Recipes](/docs/commander/recipes) for common patterns
- See the [Best Practices](/docs/commander/best-practices) for guidance
- Visit the [GitHub repository](https://github.com/Arilas/navios) for issues and discussions

