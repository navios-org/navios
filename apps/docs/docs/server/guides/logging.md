---
sidebar_position: 6
title: Logging
---

# Logging

Navios provides a built-in logging system with configurable log levels and contextual logging.

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

### Logger Options

The `logger` option accepts:

- **Array of log levels**: `['error', 'warn', 'log', 'debug', 'verbose']`
- **Custom LoggerService**: Your own logger implementation
- **`false`**: Disable logging

## Log Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `fatal` | Critical errors | Unrecoverable errors |
| `error` | Error messages | Exceptions, failures |
| `warn` | Warnings | Deprecations, potential issues |
| `log` | General info | Important events |
| `debug` | Debug info | Detailed debugging |
| `verbose` | Verbose output | Very detailed tracing |

```typescript
// Production - errors and warnings only
logger: ['error', 'warn']

// Development - all levels
logger: ['log', 'error', 'warn', 'debug', 'verbose', 'fatal']
```

## Using the Logger

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

### Logger Methods

```typescript
// General log - important events
logger.log('User logged in')

// Error - exceptions and failures (include stack trace)
logger.error('Database connection failed', error.stack)

// Warning - potential issues
logger.warn('Rate limit approaching')

// Debug - debugging information
logger.debug('Cache hit', { key: 'user:123' })

// Verbose - very detailed tracing
logger.verbose('Request headers', { headers })

// Fatal - critical errors
logger.fatal('Unrecoverable error', error.stack)
```

## Custom Logger

Create custom loggers by implementing `LoggerService`:

```typescript
import { LoggerService } from '@navios/core'

class CustomLogger implements LoggerService {
  log(message: string, ...optionalParams: any[]) {
    // Send to logging service
  }

  error(message: string, stack?: string, context?: string) {
    // Send to error tracking
  }

  warn(message: string, context?: string) {
    // Handle warnings
  }

  debug?(message: string, context?: string) {
    // Debug output
  }

  verbose?(message: string, context?: string) {
    // Verbose output
  }

  fatal?(message: string, stack?: string, context?: string) {
    // Critical error alerting
  }
}

// Use custom logger
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: new CustomLogger(),
})
```

## JSON Logger (Production)

For production, structured JSON logging works better with log aggregation services:

```typescript
class JsonLogger implements LoggerService {
  private output(level: string, message: any, context?: string, extra?: object) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      ...extra,
    }
    console.log(JSON.stringify(logEntry))
  }

  log(message: any) {
    this.output('info', message)
  }

  error(message: any, stack?: string, context?: string) {
    this.output('error', message, context, { stack })
  }

  warn(message: any, context?: string) {
    this.output('warn', message, context)
  }
}
```

Output:
```json
{"timestamp":"2024-01-15T10:30:00.000Z","level":"info","message":"User logged in","context":"UserService"}
```

## Best Practices

**Use appropriate levels**: Errors for failures, warnings for issues, log for events.

```typescript
// Good
logger.error('Payment failed', error.stack)
logger.warn('Rate limit approaching')
logger.log('User created successfully')

// Avoid - wrong level
logger.error('User logged in')  // Should be log()
```

**Always include context**: Makes tracing easier.

```typescript
// Good
private logger = inject(Logger, { context: 'UserService' })

// Avoid
private logger = inject(Logger)
```

**Include stack traces for errors**:

```typescript
// Good
catch (error) {
  logger.error('Operation failed', error.stack)
}

// Avoid
catch (error) {
  logger.error('Operation failed')
}
```

**Include relevant data**:

```typescript
// Good
logger.log('Order created', { orderId: order.id, userId: user.id })

// Avoid
logger.log('Order created')
```
