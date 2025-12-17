---
sidebar_position: 6
title: Logging
---

# Logging

Navios provides a built-in logging system with configurable log levels and output formatting.

## Logger Setup

Configure logging when creating your application:

```typescript
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: ['log', 'error', 'warn'],
})
```

## Log Levels

Available log levels:

| Level | Description |
|-------|-------------|
| `log` | General information |
| `error` | Error messages |
| `warn` | Warning messages |
| `debug` | Debug information |
| `verbose` | Detailed verbose output |

Enable specific levels:

```typescript
// Enable only errors and warnings
logger: ['error', 'warn']

// Enable all levels
logger: ['log', 'error', 'warn', 'debug', 'verbose']

// Disable logging
logger: false
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
      this.logger.error(`Failed to create user: ${error.message}`)
      throw error
    }
  }
}
```

The `context` parameter identifies the source of log messages, making it easier to trace logs back to their origin.

## Logger Methods

```typescript
// General log
logger.log('User logged in')

// Error with optional stack trace
logger.error('Database connection failed', error.stack)

// Warning
logger.warn('Rate limit approaching')

// Debug (only shown when debug level enabled)
logger.debug('Processing request', { userId, action })

// Verbose (detailed tracing)
logger.verbose('Entering function', { args })
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

The default logger outputs to console with formatting:

```typescript
import { ConsoleLogger } from '@navios/core'

const logger = new ConsoleLogger({
  context: 'MyApp',
  timestamp: true,
})

logger.log('Application started')
// [2024-01-15T10:30:00.000Z] [MyApp] LOG Application started
```

## Custom Logger Options

```typescript
import { ConsoleLogger, ConsoleLoggerOptions } from '@navios/core'

const options: ConsoleLoggerOptions = {
  context: 'API',
  timestamp: true,
  logLevels: ['log', 'error', 'warn'],
}

const logger = new ConsoleLogger(options)
```

## LoggerService Interface

Create custom loggers by implementing the interface:

```typescript
import { LoggerService } from '@navios/core'

class CustomLogger implements LoggerService {
  log(message: string, context?: string) {
    // Send to logging service
  }

  error(message: string, trace?: string, context?: string) {
    // Send to error tracking
  }

  warn(message: string, context?: string) {
    // Handle warnings
  }

  debug(message: string, context?: string) {
    // Debug output
  }

  verbose(message: string, context?: string) {
    // Verbose output
  }
}
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

For production, use structured logging:

```typescript
class JsonLogger implements LoggerService {
  private output(level: string, message: string, context?: string, extra?: object) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      ...extra,
    }))
  }

  log(message: string, context?: string) {
    this.output('info', message, context)
  }

  error(message: string, trace?: string, context?: string) {
    this.output('error', message, context, { trace })
  }

  warn(message: string, context?: string) {
    this.output('warn', message, context)
  }

  debug(message: string, context?: string) {
    this.output('debug', message, context)
  }

  verbose(message: string, context?: string) {
    this.output('verbose', message, context)
  }
}
```
