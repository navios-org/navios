---
sidebar_position: 1
---

# Getting Started

Get up and running with Navios Commander in minutes. This guide will walk you through installation, basic setup, and your first CLI command.

## What is Navios Commander?

Navios Commander is a framework for building type-safe CLI applications with TypeScript. It provides:

- **Type-safe commands** with Zod schema validation
- **Dependency injection** for clean, testable code
- **Modular organization** with CLI modules
- **Automatic help generation** from command metadata

Commands are defined as classes with decorators, making them easy to organize, test, and extend.

## Installation

Install Navios Commander using your preferred package manager:

```bash
npm install @navios/commander zod
# or
yarn add @navios/commander zod
# or
pnpm add @navios/commander zod
```

:::info
`zod` is a peer dependency required for schema validation. `@navios/core` (which includes DI) is bundled with `@navios/commander`.
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

Commands are classes decorated with `@Command` that implement the `CommandHandler` interface. They're organized into modules and executed by the CommanderFactory.

Here's a complete example:

```typescript
import { Command, CommandHandler, CliModule, CommanderFactory } from '@navios/commander'
import { z } from 'zod'

// 1. Define command options schema
const greetOptionsSchema = z.object({
  name: z.string(),
  greeting: z.string().optional().default('Hello'),
})

type GreetOptions = z.infer<typeof greetOptionsSchema>

// 2. Create a command
@Command({
  path: 'greet',
  optionsSchema: greetOptionsSchema,
})
export class GreetCommand implements CommandHandler<GreetOptions> {
  async execute(options: GreetOptions) {
    console.log(`${options.greeting}, ${options.name}!`)
  }
}

// 3. Create a CLI module
@CliModule({
  commands: [GreetCommand],
})
export class AppModule {}

// 4. Bootstrap and run
async function bootstrap() {
  const app = await CommanderFactory.create(AppModule)
  await app.init()

  const adapter = app.getAdapter()
  await adapter.run(process.argv)

  await app.close()
}

bootstrap()
```

## How It Works

1. **Command Definition**: The `@Command` decorator registers the command with a path and optional schema for validation.

2. **Module Organization**: Commands are organized into modules using `@CliModule`. Modules can import other modules to build complex CLI structures.

3. **Execution**: `CommanderFactory` creates the application, initializes modules, and executes commands based on command-line arguments.

4. **Type Safety**: Zod schemas provide runtime validation and TypeScript type inference for command options.

## Running Your CLI

Build your TypeScript code and run it:

```bash
npm run build
node dist/cli.js greet --name World --greeting Hi
# Output: Hi, World!
```

The framework automatically generates help text:

```bash
node dist/cli.js help
# or
node dist/cli.js --help
```

## Using Dependency Injection

Commands can use dependency injection to access services. Simply inject services using the `inject()` function:

```typescript
import { inject, Injectable } from '@navios/di'

@Injectable()
class UserService {
  async getUser(id: string) {
    return { id, name: 'John Doe', email: 'john@example.com' }
  }
}

@Command({ path: 'user:show', optionsSchema: userOptionsSchema })
export class ShowUserCommand implements CommandHandler<{ userId: string }> {
  private userService = inject(UserService)

  async execute(options: { userId: string }) {
    const user = await this.userService.getUser(options.userId)
    console.log(`User: ${user.name} (ID: ${user.id})`)
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

## Troubleshooting

### Command Not Found

**Problem**: Getting "Command not found" error.

**Solution**:
- Make sure the command is registered in a module
- Verify the module is imported in your root module
- Check that `app.init()` was called before `adapter.run()`

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
