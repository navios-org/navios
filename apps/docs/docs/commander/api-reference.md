---
sidebar_position: 3
---

# API Reference

Complete API reference for Navios Commander.

## Decorators

### `@Command(options)`

Decorator that marks a class as a CLI command.

**Parameters:**

- `options.path: string` - The command path (e.g., 'greet', 'user:create', 'db:migrate')
- `options.description?: string` - Optional description for help text
- `options.optionsSchema?: ZodObject` - Optional Zod schema for validating command options

**Returns:** Class decorator function

**Example:**

```typescript
@Command({
  path: 'greet',
  description: 'Greet a user with a custom message',
  optionsSchema: z.object({
    name: z.string(),
    greeting: z.string().optional().default('Hello'),
  }),
})
export class GreetCommand implements CommandHandler {
  async execute(options) {
    console.log(`${options.greeting}, ${options.name}!`)
  }
}
```

### `@CliModule(options)`

Decorator that marks a class as a CLI module.

**Parameters:**

- `options.commands?: ClassType[] | Set<ClassType>` - Array or Set of command classes
- `options.imports?: ClassType[] | Set<ClassType>` - Array or Set of other modules to import

**Returns:** Class decorator function

**Example:**

```typescript
@CliModule({
  commands: [GreetCommand, VersionCommand],
  imports: [UserModule, DatabaseModule],
})
export class AppModule {}
```

## Interfaces

### `CommandHandler<TOptions>`

Interface that command classes must implement.

```typescript
interface CommandHandler<TOptions = any> {
  execute(options: TOptions): void | Promise<void>
}
```

**Parameters:**

- `options: TOptions` - The validated command options (validated against the command's schema if provided)

**Returns:** `void | Promise<void>`

**Example:**

```typescript
@Command({ path: 'greet' })
export class GreetCommand implements CommandHandler<{ name: string }> {
  async execute(options: { name: string }) {
    console.log(`Hello, ${options.name}!`)
  }
}
```

### `CommandOptions`

Options for the `@Command` decorator.

```typescript
interface CommandOptions {
  path: string
  description?: string
  optionsSchema?: ZodObject
}
```

### `CliModuleOptions`

Options for the `@CliModule` decorator.

```typescript
interface CliModuleOptions {
  commands?: ClassType[] | Set<ClassType>
  imports?: ClassType[] | Set<ClassType>
}
```

### `CommandMetadata`

Metadata for a command.

```typescript
interface CommandMetadata {
  path: string
  description?: string
  optionsSchema?: ZodObject
}
```

## Classes

### `CommanderFactory`

Factory class for creating CLI applications.

#### `static create(appModule, options?)`

Creates a new `CommanderApplication` instance.

**Parameters:**

- `appModule: ClassTypeWithInstance<NaviosModule>` - The root CLI module class
- `options?: CommanderApplicationOptions` - Optional configuration options

**Returns:** `Promise<CommanderApplication>`

**Example:**

```typescript
const app = await CommanderFactory.create(AppModule)
await app.init()

const adapter = app.getAdapter()
await adapter.run(process.argv)

await app.close()
```

### `NaviosApplication`

Main application class returned by `CommanderFactory.create()`.

#### `init()`

Initializes the application by loading all modules and registering commands.

**Returns:** `Promise<void>`

**Throws:** `Error` if the app module is not set

**Example:**

```typescript
const app = await CommanderFactory.create(AppModule)
await app.init() // Must be called before adapter.run()
```

#### `getAdapter()`

Gets the CLI adapter for running commands.

**Returns:** `AbstractCliAdapterInterface`

**Example:**

```typescript
const adapter = app.getAdapter()
await adapter.run(process.argv)
```

#### `getContainer()`

Gets the dependency injection container used by this application.

**Returns:** `Container`

**Example:**

```typescript
const container = app.getContainer()
const service = await container.get(MyService)
```

#### `close()`

Closes the application and cleans up resources.

**Returns:** `Promise<void>`

**Example:**

```typescript
const adapter = app.getAdapter()
await adapter.run(process.argv)
await app.close()
```

### `AbstractCliAdapterInterface`

CLI adapter interface returned by `app.getAdapter()`.

#### `run(argv?)`

Runs the CLI application by parsing command-line arguments and executing the appropriate command.

**Parameters:**

- `argv?: string[]` - Command-line arguments array (defaults to `process.argv`)

**Returns:** `Promise<void>`

**Throws:**
- `Error` if the application is not initialized
- `Error` if no command is provided
- `Error` if the command is not found
- `ZodError` if options validation fails

**Example:**

```typescript
const adapter = app.getAdapter()

// Parse and execute from process.argv
await adapter.run()

// Or provide custom arguments
await adapter.run(['node', 'cli.js', 'greet', '--name', 'World'])
```

#### `executeCommand(path, options?)`

Executes a command programmatically with the provided options.

**Parameters:**

- `path: string` - The command path (e.g., 'greet', 'user:create')
- `options?: any` - The command options object (will be validated if schema exists)

**Returns:** `Promise<void>`

**Throws:**
- `Error` if the application is not initialized
- `Error` if the command is not found
- `Error` if the command does not implement the execute method
- `ZodError` if options validation fails

**Example:**

```typescript
const adapter = app.getAdapter()
await adapter.executeCommand('greet', {
  name: 'World',
  greeting: 'Hi',
})
```

#### `getAllCommands()`

Gets all registered commands with their paths and class references.

**Returns:** `Array<{ path: string; class: ClassType }>`

**Example:**

```typescript
const adapter = app.getAdapter()
const commands = adapter.getAllCommands()
commands.forEach(({ path }) => {
  console.log(`Available: ${path}`)
})
```

### `CommanderExecutionContext`

Execution context for a command execution. Provides access to command metadata, path, and validated options.

#### `getCommand()`

Gets the command metadata.

**Returns:** `CommandMetadata`

**Example:**

```typescript
const ctx = inject(CommandExecutionContext)
const command = ctx.getCommand()
console.log('Command path:', command.path)
```

#### `getCommandPath()`

Gets the command path that was invoked.

**Returns:** `string`

**Example:**

```typescript
const ctx = inject(CommandExecutionContext)
const path = ctx.getCommandPath()
console.log('Executing:', path)
```

#### `getOptions()`

Gets the validated command options.

**Returns:** `any`

**Example:**

```typescript
const ctx = inject(CommandExecutionContext)
const options = ctx.getOptions()
console.log('Options:', options)
```

## Tokens

### `CommandExecutionContext`

Injection token for accessing the command execution context.

**Type:** `InjectionToken<CommanderExecutionContext>`

**Example:**

```typescript
@Injectable()
class CommandLogger {
  private ctx = inject(CommandExecutionContext)

  log() {
    console.log('Command:', this.ctx.getCommandPath())
    console.log('Options:', this.ctx.getOptions())
  }
}
```

## Types

### `CommandOptions`

Type for command decorator options.

```typescript
type CommandOptions = {
  path: string
  description?: string
  optionsSchema?: ZodObject
}
```

### `CliModuleOptions`

Type for CLI module decorator options.

```typescript
type CliModuleOptions = {
  commands?: ClassType[] | Set<ClassType>
  imports?: ClassType[] | Set<ClassType>
}
```

### `CommandMetadata`

Type for command metadata.

```typescript
type CommandMetadata = {
  path: string
  description?: string
  optionsSchema?: ZodObject
}
```

## Services

### `CliParserService`

Service for parsing command-line arguments.

**Internal:** This service is used internally by `CommanderApplication` and is not typically accessed directly.

### `CliModuleLoaderService`

Service for loading CLI modules and collecting command metadata.

**Internal:** This service is used internally by `CommanderApplication` and is not typically accessed directly.

## Error Types

### `ZodError`

Thrown when command options fail validation against the provided Zod schema.

**Source:** Zod library

**Example:**

```typescript
try {
  await app.executeCommand('create-user', { email: 'invalid-email' })
} catch (error) {
  if (error instanceof ZodError) {
    console.error('Validation error:', error.errors)
  }
}
```

## Integration with @navios/di

All `@navios/di` types and functions are re-exported from `@navios/commander`:

- `Injectable`
- `InjectableScope`
- `InjectionToken`
- `inject`
- `asyncInject`
- `optional`
- `Container`
- `Registry`
- And more...

See the [DI documentation](/docs/di/di/api-reference) for complete details.

## Integration with @navios/core

Navios Commander uses `@navios/core` for module support:

- `NaviosModule` interface for module lifecycle hooks
- `ClassType` and `ClassTypeWithInstance` types
- Module initialization hooks

See the [Core documentation](/docs/server/overview/architecture) for more details.

