---
sidebar_position: 3
---

# Dependency Injection

Navios Commander has full integration with `@navios/di`, allowing you to inject services into commands and use all DI features. This guide covers how to use dependency injection in your CLI commands.

## Basic Injection

Inject services into commands using the `inject()` function:

```typescript
import { Command, CommandHandler } from '@navios/commander'
import { inject, Injectable } from '@navios/di'

@Injectable()
class UserService {
  async getUser(id: string) {
    return { id, name: 'John Doe', email: 'john@example.com' }
  }
}

@Command({ path: 'user:show' })
export class ShowUserCommand implements CommandHandler {
  private userService = inject(UserService)

  async execute(options: { userId: string }) {
    const user = await this.userService.getUser(options.userId)
    console.log(`User: ${user.name} (${user.email})`)
  }
}
```

## Service Scopes

Services can have different scopes, just like in `@navios/di`:

### Singleton Services

Singleton services are shared across all command executions:

```typescript
import { Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Singleton })
class ConfigService {
  private config = {
    apiUrl: 'https://api.example.com',
    timeout: 5000,
  }

  getApiUrl() {
    return this.config.apiUrl
  }
}

@Command({ path: 'api:call' })
export class ApiCallCommand implements CommandHandler {
  private config = inject(ConfigService)

  async execute() {
    const url = this.config.getApiUrl()
    console.log(`Calling ${url}`)
  }
}
```

### Transient Services

Transient services create a new instance for each injection:

```typescript
import { Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Transient })
class LogEntry {
  private id = Math.random().toString(36)

  getId() {
    return this.id
  }
}

@Command({ path: 'log' })
export class LogCommand implements CommandHandler {
  private logEntry = inject(LogEntry)

  async execute() {
    console.log(`Log entry ID: ${this.logEntry.getId()}`)
  }
}
```

### Request-Scoped Services

Request-scoped services are created per command execution:

```typescript
import { Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class CommandContext {
  private executionId = Math.random().toString(36)

  getExecutionId() {
    return this.executionId
  }
}

@Command({ path: 'process' })
export class ProcessCommand implements CommandHandler {
  private context = inject(CommandContext)

  async execute() {
    console.log(`Execution ID: ${this.context.getExecutionId()}`)
  }
}
```

## Injection Methods

### inject() - Synchronous Injection

Use `inject()` for immediate access to dependencies:

```typescript
@Command({ path: 'user:show' })
export class ShowUserCommand implements CommandHandler {
  private userService = inject(UserService)

  async execute(options: { userId: string }) {
    // Direct access - no await needed
    const user = await this.userService.getUser(options.userId)
    console.log(user)
  }
}
```

### asyncInject() - Asynchronous Injection

Use `asyncInject()` for explicit async control or to break circular dependencies:

```typescript
@Command({ path: 'user:show' })
export class ShowUserCommand implements CommandHandler {
  private userService = asyncInject(UserService)

  async execute(options: { userId: string }) {
    const service = await this.userService
    const user = await service.getUser(options.userId)
    console.log(user)
  }
}
```

### optional() - Optional Injection

Use `optional()` to inject a dependency only if it's available:

```typescript
import { optional } from '@navios/di'

@Command({ path: 'notify' })
export class NotifyCommand implements CommandHandler {
  private emailService = optional(EmailService)

  async execute(options: { message: string }) {
    // Only sends email if EmailService is available
    this.emailService?.send(options.message)
  }
}
```

## Service Dependencies

Services can depend on other services:

```typescript
@Injectable()
class DatabaseService {
  async query(sql: string) {
    // Database query logic
    return { rows: [] }
  }
}

@Injectable()
class UserRepository {
  private db = inject(DatabaseService)

  async findById(id: string) {
    return this.db.query(`SELECT * FROM users WHERE id = '${id}'`)
  }
}

@Command({ path: 'user:show' })
export class ShowUserCommand implements CommandHandler {
  private userRepo = inject(UserRepository)

  async execute(options: { userId: string }) {
    const user = await this.userRepo.findById(options.userId)
    console.log(user)
  }
}
```

## Injection Tokens

Use injection tokens for flexible dependency resolution:

```typescript
import { Injectable, InjectionToken } from '@navios/di'

interface PaymentProcessor {
  processPayment(amount: number): Promise<string>
}

const PAYMENT_PROCESSOR_TOKEN = InjectionToken.create<PaymentProcessor>(
  'PaymentProcessor',
)

@Injectable({ token: PAYMENT_PROCESSOR_TOKEN })
class StripePaymentProcessor implements PaymentProcessor {
  async processPayment(amount: number) {
    return `Processed $${amount} via Stripe`
  }
}

@Command({ path: 'pay' })
export class PayCommand implements CommandHandler {
  private processor = inject(PAYMENT_PROCESSOR_TOKEN)

  async execute(options: { amount: number }) {
    const result = await this.processor.processPayment(options.amount)
    console.log(result)
  }
}
```

## Configuration Services

Use injection tokens with Zod schemas for type-safe configuration:

```typescript
import { Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string().url(),
  timeout: z.number().min(1000),
})

const CONFIG_TOKEN = InjectionToken.create<ConfigService, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private config: z.infer<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }

  getTimeout() {
    return this.config.timeout
  }
}

@Command({ path: 'api:call' })
export class ApiCallCommand implements CommandHandler {
  private config = inject(CONFIG_TOKEN, {
    apiUrl: 'https://api.example.com',
    timeout: 5000,
  })

  async execute() {
    console.log(`API URL: ${this.config.getApiUrl()}`)
    console.log(`Timeout: ${this.config.getTimeout()}ms`)
  }
}
```

Learn more about [configuration services in DI recipes](/docs/di/di/recipes/configuration-services).

## Lifecycle Hooks

Services can implement lifecycle hooks:

```typescript
import { Injectable, OnServiceInit, OnServiceDestroy } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: any = null

  async onServiceInit() {
    console.log('Connecting to database...')
    this.connection = await this.connect()
    console.log('Database connected')
  }

  async onServiceDestroy() {
    console.log('Disconnecting from database...')
    if (this.connection) {
      await this.connection.close()
    }
  }

  private async connect() {
    // Connection logic
    return { connected: true }
  }
}

@Command({ path: 'db:query' })
export class QueryCommand implements CommandHandler {
  private db = inject(DatabaseService)

  async execute(options: { sql: string }) {
    // Database is already connected
    const result = await this.db.query(options.sql)
    console.log(result)
  }
}
```

## Request Context

Each command execution runs in its own request context, allowing for request-scoped services:

```typescript
@Injectable({ scope: InjectableScope.Request })
class RequestLogger {
  private logs: string[] = []

  log(message: string) {
    this.logs.push(message)
  }

  getLogs() {
    return this.logs
  }
}

@Command({ path: 'process' })
export class ProcessCommand implements CommandHandler {
  private logger = inject(RequestLogger)

  async execute() {
    this.logger.log('Starting process')
    // Process logic
    this.logger.log('Process complete')
    
    const logs = this.logger.getLogs()
    console.log('Logs:', logs)
  }
}
```

## Accessing the Container

You can access the DI container from the application:

```typescript
import { CommanderFactory } from '@navios/commander'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await CommanderFactory.create(AppModule)
  await app.init()

  const container = app.getContainer()
  const service = await container.get(MyService)

  await app.run(process.argv)
  await app.close()
}

bootstrap()
```

## Best Practices

### 1. Use Singleton for Stateless Services

```typescript
// ✅ Good: Stateless service as singleton
@Injectable({ scope: InjectableScope.Singleton })
class EmailService {
  async sendEmail(to: string, subject: string) {
    // No state, safe to share
  }
}
```

### 2. Use Request Scope for Command-Specific State

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

### 3. Avoid Accessing Services in Constructors

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

### 4. Use Injection Tokens for Interfaces

```typescript
// ✅ Good: Use tokens for interfaces
interface PaymentProcessor {
  processPayment(amount: number): Promise<string>
}

const PAYMENT_PROCESSOR_TOKEN = InjectionToken.create<PaymentProcessor>(
  'PaymentProcessor',
)

@Injectable({ token: PAYMENT_PROCESSOR_TOKEN })
class StripeProcessor implements PaymentProcessor {
  // ...
}
```

## Next Steps

- Learn more about [DI in Navios](/docs/di/di/getting-started)
- Explore [service scopes](/docs/di/di/guides/scopes)
- Check out [injection tokens](/docs/di/di/guides/injection-tokens)
- See [execution context](/docs/commander/guides/execution-context) for command-specific context

