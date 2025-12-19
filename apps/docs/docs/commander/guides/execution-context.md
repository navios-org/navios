---
sidebar_position: 4
---

# Execution Context

The `CommandExecutionContext` provides access to information about the current command execution, including the command metadata, path, and validated options. This is useful for middleware, guards, or any service that needs context about the current command execution.

## What is Execution Context?

The execution context is automatically created for each command execution and provides:

- Command metadata (path, options schema)
- Command path (e.g., 'user:create')
- Validated command options
- Access to the current execution state

## Accessing Execution Context

Inject `CommandExecutionContext` into services or commands:

```typescript
import { Command, CommandHandler } from '@navios/commander'
import { inject, Injectable } from '@navios/di'
import { CommandExecutionContext } from '@navios/commander'

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

## Execution Context Methods

### getCommand()

Returns the command metadata including path and options schema:

```typescript
@Injectable()
class CommandService {
  private ctx = inject(CommandExecutionContext)

  getCommandInfo() {
    const command = this.ctx.getCommand()
    console.log('Command path:', command.path)
    console.log('Has schema:', !!command.optionsSchema)
  }
}
```

### getCommandPath()

Returns the command path that was invoked:

```typescript
@Injectable()
class CommandRouter {
  private ctx = inject(CommandExecutionContext)

  route() {
    const path = this.ctx.getCommandPath()
    
    if (path.startsWith('user:')) {
      // Handle user commands
    } else if (path.startsWith('db:')) {
      // Handle database commands
    }
  }
}
```

### getOptions()

Returns the validated command options:

```typescript
@Injectable()
class OptionsValidator {
  private ctx = inject(CommandExecutionContext)

  validate() {
    const options = this.ctx.getOptions()
    
    // Options are already validated by Zod schema
    // Additional validation logic here
    if (options.userId && !options.userId.match(/^[0-9]+$/)) {
      throw new Error('Invalid user ID format')
    }
  }
}
```

## Use Cases

### Logging

Log command execution with context:

```typescript
@Injectable()
class ExecutionLogger {
  private ctx = inject(CommandExecutionContext)

  logExecution() {
    const path = this.ctx.getCommandPath()
    const options = this.ctx.getOptions()
    
    console.log(`[${new Date().toISOString()}] Executing: ${path}`)
    console.log('Options:', JSON.stringify(options, null, 2))
  }
}

@Command({ path: 'user:create' })
export class CreateUserCommand implements CommandHandler {
  private logger = inject(ExecutionLogger)

  async execute(options: { name: string; email: string }) {
    this.logger.logExecution()
    // Create user logic
  }
}
```

### Conditional Logic

Use execution context for conditional behavior:

```typescript
@Injectable()
class FeatureService {
  private ctx = inject(CommandExecutionContext)

  isFeatureEnabled(feature: string) {
    const path = this.ctx.getCommandPath()
    const options = this.ctx.getOptions()
    
    // Enable feature for specific commands
    if (path === 'admin:deploy' && options.environment === 'production') {
      return true
    }
    
    return false
  }
}
```

### Request-Scoped Services

Use execution context with request-scoped services:

```typescript
@Injectable({ scope: InjectableScope.Request })
class CommandTracker {
  private ctx = inject(CommandExecutionContext)
  private startTime = Date.now()

  getExecutionInfo() {
    return {
      command: this.ctx.getCommandPath(),
      options: this.ctx.getOptions(),
      duration: Date.now() - this.startTime,
    }
  }
}

@Command({ path: 'process' })
export class ProcessCommand implements CommandHandler {
  private tracker = inject(CommandTracker)

  async execute() {
    // Process logic
    const info = this.tracker.getExecutionInfo()
    console.log('Execution info:', info)
  }
}
```

### Middleware Pattern

Create middleware that uses execution context:

```typescript
@Injectable()
class AuthMiddleware {
  private ctx = inject(CommandExecutionContext)

  async checkAuth() {
    const path = this.ctx.getCommandPath()
    const options = this.ctx.getOptions()
    
    // Skip auth for public commands
    if (path.startsWith('public:')) {
      return true
    }
    
    // Check auth token
    if (!options.token) {
      throw new Error('Authentication required')
    }
    
    // Validate token
    return this.validateToken(options.token)
  }

  private validateToken(token: string) {
    // Token validation logic
    return true
  }
}

@Command({ path: 'admin:delete' })
export class DeleteCommand implements CommandHandler {
  private auth = inject(AuthMiddleware)

  async execute(options: { token: string; id: string }) {
    await this.auth.checkAuth()
    // Delete logic
  }
}
```

### Error Handling

Use execution context for better error messages:

```typescript
@Injectable()
class ErrorHandler {
  private ctx = inject(CommandExecutionContext)

  handleError(error: Error) {
    const path = this.ctx.getCommandPath()
    const options = this.ctx.getOptions()
    
    console.error(`Error in command: ${path}`)
    console.error('Options:', options)
    console.error('Error:', error.message)
    
    // Log to external service
    this.logToService({
      command: path,
      options,
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }
}
```

## Execution Context in Services

Services can access execution context to get information about the current command:

```typescript
@Injectable()
class UserService {
  private ctx = inject(CommandExecutionContext)

  async getUser(id: string) {
    const command = this.ctx.getCommandPath()
    
    // Log which command requested the user
    console.log(`Command ${command} requested user ${id}`)
    
    // Fetch user logic
    return { id, name: 'John Doe' }
  }
}

@Command({ path: 'user:show' })
export class ShowUserCommand implements CommandHandler {
  private userService = inject(UserService)

  async execute(options: { userId: string }) {
    // UserService can access execution context
    const user = await this.userService.getUser(options.userId)
    console.log(user)
  }
}
```

## Execution Context Scope

The execution context is request-scoped, meaning each command execution has its own context:

```typescript
@Injectable({ scope: InjectableScope.Request })
class ExecutionTracker {
  private ctx = inject(CommandExecutionContext)
  private events: string[] = []

  track(event: string) {
    const command = this.ctx.getCommandPath()
    this.events.push(`${command}: ${event}`)
  }

  getEvents() {
    return this.events
  }
}

@Command({ path: 'process' })
export class ProcessCommand implements CommandHandler {
  private tracker = inject(ExecutionTracker)

  async execute() {
    this.tracker.track('start')
    // Process logic
    this.tracker.track('complete')
    
    const events = this.tracker.getEvents()
    console.log('Events:', events)
  }
}
```

## Best Practices

### 1. Use for Cross-Cutting Concerns

Use execution context for logging, monitoring, and other cross-cutting concerns:

```typescript
@Injectable()
class MonitoringService {
  private ctx = inject(CommandExecutionContext)

  trackExecution() {
    const path = this.ctx.getCommandPath()
    const options = this.ctx.getOptions()
    
    // Track to monitoring service
    this.sendMetrics({
      command: path,
      timestamp: Date.now(),
      options: Object.keys(options),
    })
  }
}
```

### 2. Avoid Overuse

Don't use execution context when you can pass options directly:

```typescript
// ❌ Avoid: Using context when options are available
@Command({ path: 'user:create' })
export class CreateUserCommand implements CommandHandler {
  private ctx = inject(CommandExecutionContext)

  async execute(options: { name: string }) {
    const opts = this.ctx.getOptions() // Unnecessary
    // Use options directly instead
  }
}

// ✅ Good: Use options directly
@Command({ path: 'user:create' })
export class CreateUserCommand implements CommandHandler {
  async execute(options: { name: string }) {
    // Use options directly
    console.log(options.name)
  }
}
```

### 3. Use for Services That Need Context

Use execution context in services that need to know about the current command:

```typescript
// ✅ Good: Service needs context
@Injectable()
class PermissionService {
  private ctx = inject(CommandExecutionContext)

  canExecute() {
    const path = this.ctx.getCommandPath()
    // Check permissions based on command
    return this.checkPermission(path)
  }
}
```

## Next Steps

- Learn about [dependency injection](/docs/commander/guides/dependency-injection) in commands
- Explore [validation](/docs/commander/guides/validation) with Zod schemas
- Check out [best practices](/docs/commander/best-practices) for command design

