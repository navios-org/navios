---
sidebar_position: 4
---

# Best Practices

This guide covers best practices for building CLI applications with Navios Commander.

## Command Design

### Use Descriptive Command Paths

Use clear, descriptive command paths that indicate what the command does:

```typescript
// ✅ Good: Clear and descriptive
@Command({ path: 'user:create' })
@Command({ path: 'database:migrate' })
@Command({ path: 'deploy:production' })

// ❌ Avoid: Vague or unclear
@Command({ path: 'create' })
@Command({ path: 'migrate' })
@Command({ path: 'deploy' })
```

### Use Namespaces for Organization

Group related commands with namespaces:

```typescript
// ✅ Good: Organized with namespaces
@Command({ path: 'user:create' })
@Command({ path: 'user:delete' })
@Command({ path: 'user:list' })

// ❌ Avoid: Flat structure
@Command({ path: 'create-user' })
@Command({ path: 'delete-user' })
@Command({ path: 'list-users' })
```

### Keep Commands Focused

Each command should do one thing well:

```typescript
// ✅ Good: Focused command
@Command({ path: 'user:create' })
export class CreateUserCommand implements CommandHandler {
  async execute(options: { name: string; email: string }) {
    // Only creates users
  }
}

// ❌ Avoid: Doing too much
@Command({ path: 'user:manage' })
export class ManageUserCommand implements CommandHandler {
  async execute(options: { action: string; ... }) {
    // Creates, updates, deletes - too many responsibilities
  }
}
```

## Validation

### Always Validate Options

Always provide schemas for command options:

```typescript
// ✅ Good: Validated options
@Command({
  path: 'create-user',
  optionsSchema: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
})

// ❌ Avoid: No validation
@Command({ path: 'create-user' })
export class CreateUserCommand implements CommandHandler {
  async execute(options: any) {
    // No type safety or validation
  }
}
```

### Use Descriptive Error Messages

Provide clear error messages in your schemas:

```typescript
// ✅ Good: Clear error messages
const schema = z.object({
  age: z.number().min(18, 'Must be at least 18 years old'),
  email: z.string().email('Invalid email address'),
})

// ❌ Avoid: Generic error messages
const schema = z.object({
  age: z.number().min(18),
  email: z.string().email(),
})
```

### Provide Default Values

Use default values for optional options:

```typescript
// ✅ Good: Default values
const schema = z.object({
  verbose: z.boolean().default(false),
  timeout: z.number().default(5000),
  format: z.enum(['json', 'table']).default('json'),
})

// ❌ Avoid: Required optional fields
const schema = z.object({
  verbose: z.boolean().optional(), // User must always provide
})
```

## Module Organization

### Group Related Commands

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

### Use Feature Modules

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

### Keep Modules Focused

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

## Dependency Injection

### Use Singleton for Stateless Services

Use singleton scope for stateless services:

```typescript
// ✅ Good: Stateless service as singleton
@Injectable({ scope: InjectableScope.Singleton })
class EmailService {
  async sendEmail(to: string, subject: string) {
    // No state, safe to share
  }
}
```

### Use Request Scope for Command-Specific State

Use request scope for services that need command-specific state:

```typescript
// ✅ Good: Request-scoped for command state
@Injectable({ scope: InjectableScope.Request })
class CommandContext {
  private data: any = {}

  setData(key: string, value: any) {
    this.data[key] = value
  }
}
```

### Avoid Accessing Services in Constructors

Don't access injected services in constructors:

```typescript
// ❌ Avoid: Accessing services in constructor
@Command({ path: 'example' })
export class ExampleCommand implements CommandHandler {
  private service = inject(MyService)

  constructor() {
    // ❌ Service may not be ready
    this.service.doSomething()
  }
}

// ✅ Good: Use in execute method
@Command({ path: 'example' })
export class ExampleCommand implements CommandHandler {
  private service = inject(MyService)

  async execute() {
    // ✅ Service is ready
    await this.service.doSomething()
  }
}
```

## Error Handling

### Provide Meaningful Error Messages

Give users helpful error messages:

```typescript
// ✅ Good: Helpful error messages
@Command({ path: 'delete-user' })
export class DeleteUserCommand implements CommandHandler {
  async execute(options: { userId: string }) {
    const user = await this.userService.getUser(options.userId)
    if (!user) {
      throw new Error(`User ${options.userId} not found`)
    }
    await this.userService.deleteUser(options.userId)
  }
}

// ❌ Avoid: Generic error messages
@Command({ path: 'delete-user' })
export class DeleteUserCommand implements CommandHandler {
  async execute(options: { userId: string }) {
    const user = await this.userService.getUser(options.userId)
    if (!user) {
      throw new Error('Error') // Not helpful
    }
  }
}
```

### Handle Validation Errors Gracefully

Catch and handle validation errors:

```typescript
// ✅ Good: Handle validation errors
@Command({ path: 'create-user' })
export class CreateUserCommand implements CommandHandler {
  async execute(options: { name: string; email: string }) {
    try {
      await this.userService.createUser(options)
    } catch (error) {
      if (error instanceof ZodError) {
        console.error('Validation error:', error.errors)
        process.exit(1)
      }
      throw error
    }
  }
}
```

## Output and Formatting

### Support Multiple Output Formats

Allow users to choose output format:

```typescript
// ✅ Good: Multiple output formats
@Command({
  path: 'list-users',
  optionsSchema: z.object({
    format: z.enum(['json', 'table', 'csv']).default('table'),
  }),
})
export class ListUsersCommand implements CommandHandler {
  async execute(options) {
    const users = await this.userService.getAllUsers()
    
    if (options.format === 'json') {
      console.log(JSON.stringify(users, null, 2))
    } else if (options.format === 'csv') {
      this.printCsv(users)
    } else {
      this.printTable(users)
    }
  }
}
```

### Use Consistent Formatting

Keep output formatting consistent:

```typescript
// ✅ Good: Consistent formatting
@Command({ path: 'user:show' })
export class ShowUserCommand implements CommandHandler {
  async execute(options: { userId: string }) {
    const user = await this.userService.getUser(options.userId)
    console.log(`User ID: ${user.id}`)
    console.log(`Name: ${user.name}`)
    console.log(`Email: ${user.email}`)
  }
}
```

## Testing

### Test Commands in Isolation

Test commands independently:

```typescript
// ✅ Good: Isolated test
it('should create user', async () => {
  const app = await CommanderFactory.create(TestModule)
  await app.init()
  
  await app.executeCommand('user:create', {
    name: 'John',
    email: 'john@example.com',
  })
  
  await app.close()
})
```

### Mock External Dependencies

Mock services that interact with external systems:

```typescript
// ✅ Good: Mocked external service
const mockEmailService = {
  send: jest.fn().mockResolvedValue(true),
}
```

## Performance

### Lazy Load Heavy Dependencies

Load heavy dependencies only when needed:

```typescript
// ✅ Good: Lazy loading
@Command({ path: 'process' })
export class ProcessCommand implements CommandHandler {
  private heavyService = asyncInject(HeavyService)

  async execute() {
    const service = await this.heavyService
    // Use service only when needed
  }
}
```

### Cache Expensive Operations

Cache results of expensive operations:

```typescript
// ✅ Good: Caching
@Injectable()
class ConfigService {
  private cache: any = null

  async getConfig() {
    if (!this.cache) {
      this.cache = await this.loadConfig()
    }
    return this.cache
  }
}
```

## Security

### Validate All Input

Always validate user input:

```typescript
// ✅ Good: Validated input
@Command({
  path: 'delete-file',
  optionsSchema: z.object({
    file: z.string().refine(
      (path) => !path.includes('..'),
      { message: 'Invalid file path' }
    ),
  }),
})
```

### Sanitize Output

Sanitize output to prevent injection attacks:

```typescript
// ✅ Good: Sanitized output
@Command({ path: 'execute' })
export class ExecuteCommand implements CommandHandler {
  async execute(options: { command: string }) {
    // Sanitize command before execution
    const sanitized = this.sanitize(options.command)
    // Execute sanitized command
  }
}
```

## Documentation

### Document Command Options

Provide clear documentation for command options:

```typescript
// ✅ Good: Documented options
const schema = z.object({
  // User's full name
  name: z.string().min(1),
  // User's email address (must be valid email)
  email: z.string().email(),
  // User's age (must be 18 or older)
  age: z.number().min(18),
})
```

### Add Help Text

Consider adding help text to commands:

```typescript
// ✅ Good: Help text
@Command({ path: 'user:create' })
export class CreateUserCommand implements CommandHandler {
  async execute(options: { name: string; email: string }) {
    // Command implementation
  }
}

// Usage: node cli.js user:create --name "John" --email "john@example.com"
```

## Common Patterns

### Configuration Commands

Use commands for configuration:

```typescript
@Command({
  path: 'config:set',
  optionsSchema: z.object({
    key: z.string(),
    value: z.string(),
  }),
})
export class SetConfigCommand implements CommandHandler {
  async execute(options) {
    // Set configuration
  }
}
```

### Status Commands

Provide status commands:

```typescript
@Command({ path: 'status' })
export class StatusCommand implements CommandHandler {
  async execute() {
    // Show application status
  }
}
```

### Health Check Commands

Include health check commands:

```typescript
@Command({ path: 'health' })
export class HealthCommand implements CommandHandler {
  async execute() {
    // Check system health
  }
}
```

## Next Steps

- Review the [guides](/docs/commander/guides) for detailed information
- Check out [recipes](/docs/commander/recipes) for common patterns
- See the [API reference](/docs/commander/api-reference) for complete details

