---
sidebar_position: 6
title: Logging
---

# Logging

Navios provides a comprehensive built-in logging system with configurable log levels, contextual logging, and customizable output formatting. The logger is built on `@navios/di` for dependency injection support.

## Logger Setup

Configure logging when creating your application:

```typescript
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: ['log', 'error', 'warn'],
})
```

### Logger Configuration Options

The `logger` option accepts:

- **Array of log levels** - Enable specific log levels: `['error', 'warn', 'log']`
- **Custom LoggerService** - Provide your own logger implementation
- **`false`** - Disable logging entirely

```typescript
// Array of log levels
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: ['error', 'warn', 'log', 'debug', 'verbose'],
})

// Custom logger
class CustomLogger implements LoggerService {
  log(message: string) { /* ... */ }
  error(message: string, trace?: string) { /* ... */ }
  warn(message: string) { /* ... */ }
}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: new CustomLogger(),
})

// Disable logging
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: false,
})
```

## Log Levels

Available log levels (in order of severity):

| Level | Description | Use Case |
|-------|-------------|----------|
| `fatal` | Critical errors that cause application termination | Unrecoverable errors |
| `error` | Error messages | Exceptions, failures |
| `warn` | Warning messages | Deprecations, potential issues |
| `log` | General information | Important events, state changes |
| `debug` | Debug information | Detailed debugging information |
| `verbose` | Detailed verbose output | Very detailed tracing |

Enable specific levels:

```typescript
// Production - Only errors and warnings
logger: ['error', 'warn']

// Development - All levels
logger: ['log', 'error', 'warn', 'debug', 'verbose', 'fatal']

// Disable logging
logger: false
```

## Using the Logger

The Logger is a service that can be injected into any class using dependency injection. It provides contextualized logging with automatic context injection.

### Basic Injection

Inject the logger into services with a named context:

```typescript
import { inject, Injectable } from '@navios/di'
import { Logger } from '@navios/core'

@Injectable()
class UserService {
  private logger = inject(Logger, { context: 'UserService' })

  async createUser(data: CreateUserDto) {
    this.logger.log(`Creating user: ${data.email}`)
    // Output: [UserService] Creating user: john@example.com

    try {
      const user = await this.db.users.create({ data })
      this.logger.log(`User created: ${user.id}`)
      return user
    } catch (error) {
      this.logger.error(`Failed to create user: ${error.message}`, error.stack)
      throw error
    }
  }
}
```

The `context` parameter identifies the source of log messages, making it easier to trace logs back to their origin.

### Using Class Name as Context

You can use the class name directly:

```typescript
@Injectable()
class UserService {
  private logger = inject(Logger, { context: UserService.name })

  async findById(id: string) {
    this.logger.debug(`Finding user: ${id}`)
    // Output: [UserService] Finding user: 123
  }
}
```

### Logger in Controllers

```typescript
import { Controller, Endpoint, EndpointParams } from '@navios/core'
import { inject } from '@navios/di'
import { Logger } from '@navios/core'

@Controller()
class UserController {
  private logger = inject(Logger, { context: 'UserController' })

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    this.logger.log(`Fetching user ${params.urlParams.userId}`)
    // ... handler logic
  }
}
```

## Logger Methods

The Logger service provides methods for all log levels:

```typescript
// General log - for important events
logger.log('User logged in')
logger.log('Order processed', { orderId: '123' })

// Error - for exceptions and failures
logger.error('Database connection failed')
logger.error('Payment processing failed', error.stack)
logger.error('Failed to send email', error.stack, 'EmailService')

// Warning - for potential issues
logger.warn('Rate limit approaching')
logger.warn('Deprecated API endpoint used')

// Debug - for debugging information (only shown when debug level enabled)
logger.debug('Processing request', { userId, action })
logger.debug('Cache hit', { key: 'user:123' })

// Verbose - for very detailed tracing (only shown when verbose level enabled)
logger.verbose('Entering function', { args })
logger.verbose('Request headers', { headers })

// Fatal - for critical errors that cause application termination
logger.fatal('Unrecoverable error occurred', error.stack)
```

### Method Signatures

```typescript
interface LoggerService {
  log(message: any, ...optionalParams: any[]): void
  error(message: any, stack?: string, context?: string): void
  warn(message: any, context?: string): void
  debug?(message: any, context?: string): void
  verbose?(message: any, context?: string): void
  fatal?(message: any, stack?: string, context?: string): void
}
```

## Multiple Services Example

Each service should have its own logger context:

```typescript
@Injectable()
class OrderService {
  private logger = inject(Logger, { context: 'OrderService' })

  async processOrder(orderId: string) {
    this.logger.log(`Processing order ${orderId}`)
    // Output: [OrderService] Processing order abc123

    try {
      await this.validateOrder(orderId)
      this.logger.log(`Order ${orderId} validated`)

      await this.chargePayment(orderId)
      this.logger.log(`Payment charged for ${orderId}`)

      await this.fulfillOrder(orderId)
      this.logger.log(`Order ${orderId} fulfilled`)
    } catch (error) {
      this.logger.error(`Order processing failed: ${error.message}`)
      throw error
    }
  }
}

@Injectable()
class PaymentService {
  private logger = inject(Logger, { context: 'PaymentService' })

  async charge(amount: number) {
    this.logger.log(`Charging ${amount}`)
    // Output: [PaymentService] Charging 100
  }
}
```

## ConsoleLogger

The default logger (`ConsoleLogger`) outputs to console with formatting. It's automatically used when you configure log levels in `NaviosFactory.create()`.

### ConsoleLogger Features

- **Colorized output** - Different colors for different log levels
- **Timestamp support** - Optional timestamps for log entries
- **Context display** - Shows the context (service name) in logs
- **Log level filtering** - Only outputs logs for enabled levels
- **JSON output** - Optional JSON formatting for structured logging

### ConsoleLogger Options

```typescript
import { ConsoleLogger, ConsoleLoggerOptions } from '@navios/core'

const options: ConsoleLoggerOptions = {
  context: 'API',
  timestamp: true,
  logLevels: ['log', 'error', 'warn', 'debug'],
  colors: true, // Enable colorized output
  json: false, // Use JSON format instead of text
  prefix: 'Navios', // Custom prefix for log messages
}

const logger = new ConsoleLogger(options)
```

### Using ConsoleLogger Directly

```typescript
import { ConsoleLogger } from '@navios/core'

const logger = new ConsoleLogger({
  context: 'MyApp',
  timestamp: true,
})

logger.log('Application started')
// [2024-01-15T10:30:00.000Z] [MyApp] LOG Application started

logger.error('Error occurred', 'Error stack trace here')
// [2024-01-15T10:30:00.000Z] [MyApp] ERROR Error occurred
// Error stack trace here
```

## Custom Logger Implementation

Create custom loggers by implementing the `LoggerService` interface. This is useful for integrating with external logging services like Datadog, Sentry, or CloudWatch.

### LoggerService Interface

```typescript
import { LoggerService } from '@navios/core'

interface LoggerService {
  log(message: any, ...optionalParams: any[]): void
  error(message: any, stack?: string, context?: string): void
  warn(message: any, context?: string): void
  debug?(message: any, context?: string): void
  verbose?(message: any, context?: string): void
  fatal?(message: any, stack?: string, context?: string): void
  setLogLevels?(levels: LogLevel[]): void
}
```

### Example: Custom Logger

```typescript
import { LoggerService } from '@navios/core'

class CustomLogger implements LoggerService {
  private context?: string

  constructor(context?: string) {
    this.context = context
  }

  log(message: string, ...optionalParams: any[]) {
    // Send to logging service
    this.sendToLoggingService('log', message, optionalParams)
  }

  error(message: string, stack?: string, context?: string) {
    // Send to error tracking
    this.sendToErrorTracking('error', message, stack, context || this.context)
  }

  warn(message: string, context?: string) {
    // Handle warnings
    this.sendToLoggingService('warn', message, [], context || this.context)
  }

  debug(message: string, context?: string) {
    // Debug output (only in development)
    if (process.env.NODE_ENV === 'development') {
      this.sendToLoggingService('debug', message, [], context || this.context)
    }
  }

  verbose(message: string, context?: string) {
    // Verbose output (only in development)
    if (process.env.NODE_ENV === 'development') {
      this.sendToLoggingService('verbose', message, [], context || this.context)
    }
  }

  fatal(message: string, stack?: string, context?: string) {
    // Critical error - send to alerting system
    this.sendToAlerting('fatal', message, stack, context || this.context)
  }

  private sendToLoggingService(level: string, message: string, params: any[], context?: string) {
    // Implementation for sending to your logging service
    console.log(`[${level.toUpperCase()}] [${context}] ${message}`, ...params)
  }

  private sendToErrorTracking(level: string, message: string, stack?: string, context?: string) {
    // Implementation for sending to error tracking service
    console.error(`[${level.toUpperCase()}] [${context}] ${message}`, stack)
  }

  private sendToAlerting(level: string, message: string, stack?: string, context?: string) {
    // Implementation for sending to alerting system
    console.error(`[${level.toUpperCase()}] [${context}] ${message}`, stack)
  }
}
```

### Using Custom Logger

```typescript
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: new CustomLogger('MyApp'),
})
```

## Request Logging

Log incoming requests:

```typescript
@Injectable()
class RequestLoggerGuard implements CanActivate {
  private logger = inject(Logger, { context: 'RequestLogger' })

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    this.logger.log(`${request.method} ${request.url}`)
    // Output: [RequestLogger] GET /users/123
    return true
  }
}

@Module({
  controllers: [AppController],
  guards: [RequestLoggerGuard],
})
class AppModule {}
```

## Structured Logging

For production, use structured logging with JSON format. This makes it easier to parse logs and integrate with log aggregation services.

### JSON Logger Example

```typescript
import { LoggerService } from '@navios/core'

class JsonLogger implements LoggerService {
  private context?: string

  constructor(context?: string) {
    this.context = context
  }

  private output(level: string, message: any, context?: string, extra?: object) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      context: context || this.context,
      ...extra,
    }

    console.log(JSON.stringify(logEntry))
  }

  log(message: any, ...optionalParams: any[]) {
    this.output('info', message, undefined, { params: optionalParams })
  }

  error(message: any, stack?: string, context?: string) {
    this.output('error', message, context, { stack })
  }

  warn(message: any, context?: string) {
    this.output('warn', message, context)
  }

  debug(message: any, context?: string) {
    this.output('debug', message, context)
  }

  verbose(message: any, context?: string) {
    this.output('verbose', message, context)
  }

  fatal(message: any, stack?: string, context?: string) {
    this.output('fatal', message, context, { stack })
  }
}
```

### Using JSON Logger

```typescript
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: new JsonLogger('MyApp'),
})
```

### Output Example

```json
{"timestamp":"2024-01-15T10:30:00.000Z","level":"info","message":"User logged in","context":"UserService","params":["user123"]}
{"timestamp":"2024-01-15T10:30:01.000Z","level":"error","message":"Database connection failed","context":"DatabaseService","stack":"Error: Connection timeout\n    at ..."}
```

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
// ✅ Good - Use appropriate levels
logger.error('Payment failed', error.stack) // For errors
logger.warn('Rate limit approaching') // For warnings
logger.log('User created successfully') // For important events
logger.debug('Cache lookup', { key }) // For debugging

// ❌ Avoid - Wrong log level
logger.error('User logged in') // Should be logger.log()
logger.log('Payment failed') // Should be logger.error()
```

### 2. Include Context

Always include context to identify the source of logs:

```typescript
// ✅ Good - Clear context
private logger = inject(Logger, { context: 'UserService' })

// ❌ Avoid - No context
private logger = inject(Logger)
```

### 3. Include Stack Traces for Errors

Always include stack traces when logging errors:

```typescript
// ✅ Good - Include stack trace
try {
  await processPayment()
} catch (error) {
  logger.error('Payment processing failed', error.stack)
}

// ❌ Avoid - Missing stack trace
catch (error) {
  logger.error('Payment processing failed')
}
```

### 4. Use Structured Data

Include relevant data in logs:

```typescript
// ✅ Good - Include relevant data
logger.log('Order created', { orderId: order.id, userId: user.id, amount: order.total })

// ❌ Avoid - Missing context
logger.log('Order created')
```

## Related Documentation

- [Configuration Guide](/docs/server/guides/configuration) - Configuring logger in application setup
- [Services & DI](/docs/server/guides/services) - Using dependency injection with services
- [DI: Injection Tokens](/docs/di/guides/injection-tokens) - Advanced dependency injection patterns
