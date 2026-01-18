# @navios/events Specification

## Overview

`@navios/events` is a type-safe event emitter library for the Navios framework. It provides decorator-based event handling with seamless integration into Navios's dependency injection system for building loosely coupled, event-driven applications.

**Package:** `@navios/events`
**Version:** 0.1.0
**License:** MIT
**Dependencies:** None
**Peer Dependencies:** `@navios/core`, `@navios/di`

---

## Core Concepts

### Architecture Overview

```
EventEmitter
├── Core Operations
│   ├── emit(event, payload) - Emit events
│   ├── emitAsync(event, payload) - Emit and await handlers
│   └── emitSeries(event, payload) - Emit sequentially
│
├── Event Listeners
│   ├── @OnEvent() - Listen to events
│   ├── @OnEvents() - Listen to multiple events
│   └── @OnceEvent() - Listen once then remove
│
├── Event Tokens (type-safe event definitions)
│   └── EventToken.create<PayloadType>('event.name')
│
└── Features
    ├── Wildcards - 'user.*', '**'
    ├── Priority - Handler execution order
    ├── Async - Parallel and series execution
    └── Request-scoped - Events within request context
```

### Key Principles

- **Type-Safe** - Full TypeScript support with typed event payloads
- **Decorator-Based** - Clean API using TypeScript decorators
- **DI Integration** - Event handlers are injectable services
- **Async Support** - Parallel and sequential event processing
- **Wildcard Patterns** - Flexible event matching

---

## Setup

### Provider Function

The event service is configured using the `provideEventService()` function which returns an `InjectionToken`.

```typescript
import { provideEventService } from '@navios/events'

// Basic configuration
const EventToken = provideEventService()

// With options
const EventToken = provideEventService({
  wildcard: true,           // Enable wildcard patterns
  delimiter: '.',           // Event name delimiter
  maxListeners: 100,        // Max listeners per event
  ignoreErrors: false,      // Throw on handler errors
  verboseMemoryLeak: true,  // Warn on potential leaks
})

// Async configuration
const EventToken = provideEventService(async () => {
  const config = await loadConfig()
  return {
    wildcard: config.events.wildcard,
    maxListeners: config.events.maxListeners,
  }
})
```

### Module Registration

```typescript
import { Module } from '@navios/core'
import { provideEventService } from '@navios/events'

const EventToken = provideEventService({
  wildcard: true,
})

@Module({
  providers: [EventToken, EmailHandler, AnalyticsHandler],
})
class AppModule {}
```

---

## Event Tokens

Type-safe event definitions using `EventToken`.

### Creating Event Tokens

```typescript
import { EventToken } from '@navios/events'

// Define event tokens with typed payloads
export const UserCreatedEvent = EventToken.create<{
  userId: string
  email: string
  createdAt: Date
}>('user.created')

export const UserUpdatedEvent = EventToken.create<{
  userId: string
  changes: Record<string, unknown>
}>('user.updated')

export const UserDeletedEvent = EventToken.create<{
  userId: string
}>('user.deleted')

// Events without payload
export const SystemStartedEvent = EventToken.create<void>('system.started')

// Events with complex payloads
export const OrderCompletedEvent = EventToken.create<{
  orderId: string
  userId: string
  items: Array<{ productId: string; quantity: number }>
  total: number
}>('order.completed')
```

### Organizing Events

```typescript
// events/user.events.ts
import { EventToken } from '@navios/events'

export namespace UserEvents {
  export const Created = EventToken.create<UserCreatedPayload>('user.created')
  export const Updated = EventToken.create<UserUpdatedPayload>('user.updated')
  export const Deleted = EventToken.create<UserDeletedPayload>('user.deleted')
  export const LoggedIn = EventToken.create<UserLoggedInPayload>('user.logged-in')
  export const LoggedOut = EventToken.create<UserLoggedOutPayload>('user.logged-out')
}

// events/order.events.ts
export namespace OrderEvents {
  export const Created = EventToken.create<OrderCreatedPayload>('order.created')
  export const Paid = EventToken.create<OrderPaidPayload>('order.paid')
  export const Shipped = EventToken.create<OrderShippedPayload>('order.shipped')
  export const Completed = EventToken.create<OrderCompletedPayload>('order.completed')
  export const Cancelled = EventToken.create<OrderCancelledPayload>('order.cancelled')
}
```

---

## Event Emitter API

### Injection

```typescript
import { Injectable, inject } from '@navios/di'
import { EventEmitter } from '@navios/events'

@Injectable()
class UserService {
  private events = inject(EventEmitter)
}
```

### emit(event, payload)

Emits an event to all listeners (fire and forget).

```typescript
import { UserEvents } from './events/user.events'

@Injectable()
class UserService {
  private events = inject(EventEmitter)
  private db = inject(DatabaseService)

  async createUser(data: CreateUserDto): Promise<User> {
    const user = await this.db.users.create({ data })

    // Fire and forget - doesn't wait for handlers
    this.events.emit(UserEvents.Created, {
      userId: user.id,
      email: user.email,
      createdAt: user.createdAt,
    })

    return user
  }
}
```

**Parameters:**

| Parameter | Type         | Description          |
| --------- | ------------ | -------------------- |
| `event`   | `EventToken` | The event token      |
| `payload` | `T`          | Event payload (typed)|

**Returns:** `void`

### emitAsync(event, payload)

Emits an event and waits for all handlers to complete (parallel execution).

```typescript
@Injectable()
class OrderService {
  private events = inject(EventEmitter)

  async completeOrder(orderId: string): Promise<Order> {
    const order = await this.db.orders.update({
      where: { id: orderId },
      data: { status: 'completed' },
    })

    // Wait for all handlers to complete
    await this.events.emitAsync(OrderEvents.Completed, {
      orderId: order.id,
      userId: order.userId,
      items: order.items,
      total: order.total,
    })

    return order
  }
}
```

**Returns:** `Promise<void>` - Resolves when all handlers complete

### emitSeries(event, payload)

Emits an event and executes handlers sequentially.

```typescript
@Injectable()
class PaymentService {
  private events = inject(EventEmitter)

  async processPayment(paymentId: string): Promise<void> {
    // Handlers run one after another in priority order
    await this.events.emitSeries(PaymentEvents.Processing, {
      paymentId,
    })
  }
}
```

**Returns:** `Promise<void>` - Resolves when handlers complete in series

### emitWithResult<R>(event, payload)

Emits an event and collects results from handlers.

```typescript
@Injectable()
class ValidationService {
  private events = inject(EventEmitter)

  async validateOrder(order: Order): Promise<ValidationResult[]> {
    // Collect validation results from all handlers
    const results = await this.events.emitWithResult<ValidationResult>(
      OrderEvents.Validating,
      { order }
    )

    return results.filter(r => !r.valid)
  }
}
```

**Returns:** `Promise<R[]>` - Array of handler return values

---

## Event Listeners

### @OnEvent(event, options?)

Listens to a specific event.

```typescript
import { Injectable } from '@navios/di'
import { OnEvent } from '@navios/events'
import { UserEvents } from './events/user.events'

@Injectable()
class EmailService {
  private mailer = inject(MailerService)

  @OnEvent(UserEvents.Created)
  async sendWelcomeEmail(payload: typeof UserEvents.Created.payload) {
    await this.mailer.send({
      to: payload.email,
      template: 'welcome',
      data: { userId: payload.userId },
    })
  }
}

@Injectable()
class AnalyticsService {
  private analytics = inject(AnalyticsClient)

  @OnEvent(UserEvents.Created)
  async trackUserCreation(payload: typeof UserEvents.Created.payload) {
    await this.analytics.track('user_created', {
      userId: payload.userId,
      timestamp: payload.createdAt,
    })
  }
}
```

**Options:**

| Property      | Type      | Default | Description                    |
| ------------- | --------- | ------- | ------------------------------ |
| `priority`    | `number`  | `0`     | Handler priority (higher first)|
| `async`       | `boolean` | `true`  | Run handler asynchronously     |
| `suppressErrors` | `boolean` | `false` | Don't throw on handler error |

### @OnEvents(events, options?)

Listens to multiple events with a single handler.

```typescript
import { Injectable } from '@navios/di'
import { OnEvents } from '@navios/events'
import { UserEvents } from './events/user.events'

@Injectable()
class AuditService {
  private auditLog = inject(AuditLogService)

  @OnEvents([
    UserEvents.Created,
    UserEvents.Updated,
    UserEvents.Deleted,
  ])
  async logUserChange(
    payload: unknown,
    eventName: string
  ) {
    await this.auditLog.record({
      event: eventName,
      data: payload,
      timestamp: new Date(),
    })
  }
}
```

### @OnceEvent(event)

Listens to an event only once, then automatically removes the listener.

```typescript
import { Injectable } from '@navios/di'
import { OnceEvent } from '@navios/events'

@Injectable()
class SetupService {
  @OnceEvent(SystemEvents.Started)
  async runInitialSetup() {
    // This will only run once, on the first system start
    await this.performOneTimeSetup()
  }
}
```

### Wildcard Patterns

Listen to multiple events using glob patterns.

```typescript
import { Injectable } from '@navios/di'
import { OnEvent } from '@navios/events'

@Injectable()
class NotificationService {
  // Listen to all user events
  @OnEvent('user.*')
  async onAnyUserEvent(payload: unknown, eventName: string) {
    console.log(`User event: ${eventName}`, payload)
  }

  // Listen to all events
  @OnEvent('**')
  async onAnyEvent(payload: unknown, eventName: string) {
    console.log(`Event: ${eventName}`)
  }

  // Listen to specific pattern
  @OnEvent('order.*.completed')
  async onOrderCompletion(payload: unknown) {
    // Matches: order.standard.completed, order.express.completed, etc.
  }
}
```

### Handler Priority

Control the order of handler execution.

```typescript
@Injectable()
class OrderHandlers {
  // Runs first (highest priority)
  @OnEvent(OrderEvents.Created, { priority: 100 })
  async validateOrder(payload: OrderCreatedPayload) {
    // Validation runs before other handlers
  }

  // Runs second
  @OnEvent(OrderEvents.Created, { priority: 50 })
  async reserveInventory(payload: OrderCreatedPayload) {
    // Reserve items after validation
  }

  // Runs last (default priority)
  @OnEvent(OrderEvents.Created)
  async sendConfirmation(payload: OrderCreatedPayload) {
    // Send email after everything else
  }
}
```

---

## Error Handling

### Default Behavior

By default, errors in event handlers are thrown and can crash the application.

```typescript
@Injectable()
class RiskyHandler {
  @OnEvent(SomeEvent)
  async handle(payload: SomePayload) {
    throw new Error('Handler failed')
    // This will propagate to the emitter
  }
}
```

### Suppress Errors

Prevent handler errors from propagating.

```typescript
// Per-handler
@Injectable()
class RiskyHandler {
  @OnEvent(SomeEvent, { suppressErrors: true })
  async handle(payload: SomePayload) {
    throw new Error('Handler failed')
    // Error is logged but doesn't propagate
  }
}

// Global configuration
const EventToken = provideEventService({
  ignoreErrors: true, // All handler errors are suppressed
  onError: (error, eventName, handler) => {
    // Custom error handling
    logger.error(`Handler error for ${eventName}`, error)
    sentry.captureException(error)
  },
})
```

### Error Events

Listen to handler errors.

```typescript
import { Injectable } from '@navios/di'
import { OnEvent, EventError } from '@navios/events'

@Injectable()
class ErrorHandler {
  @OnEvent(EventError)
  async handleEventError(payload: {
    error: Error
    eventName: string
    originalPayload: unknown
  }) {
    await this.alerting.send({
      type: 'event_handler_error',
      error: payload.error.message,
      event: payload.eventName,
    })
  }
}
```

---

## Integration with Queues

Connect events to message queues for distributed processing.

```typescript
import { Injectable, inject } from '@navios/di'
import { OnEvent } from '@navios/events'
import { QueueService } from '@navios/queues'

@Injectable()
class EventQueueBridge {
  private queue = inject(QueueService)

  // Forward events to queue for async processing
  @OnEvent('order.*')
  async forwardToQueue(payload: unknown, eventName: string) {
    await this.queue.send('events', {
      event: eventName,
      payload,
      timestamp: Date.now(),
    })
  }
}
```

---

## Testing

### Testing Event Emission

```typescript
import { TestContainer } from '@navios/di/testing'
import { provideEventService, EventEmitter } from '@navios/events'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('UserService', () => {
  let container: TestContainer
  let eventEmitter: EventEmitter

  beforeEach(() => {
    container = new TestContainer()
    container.register(provideEventService())
    eventEmitter = container.get(EventEmitter)
  })

  it('should emit UserCreated event', async () => {
    const emitSpy = vi.spyOn(eventEmitter, 'emit')

    const userService = await container.get(UserService)
    await userService.createUser({ email: 'test@example.com' })

    expect(emitSpy).toHaveBeenCalledWith(
      UserEvents.Created,
      expect.objectContaining({
        email: 'test@example.com',
      })
    )
  })
})
```

### Testing Event Handlers

```typescript
import { TestContainer } from '@navios/di/testing'
import { EventEmitter } from '@navios/events'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('EmailService', () => {
  let container: TestContainer
  let eventEmitter: EventEmitter
  let mailerMock: { send: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    container = new TestContainer()

    mailerMock = { send: vi.fn() }
    container.bind(MailerService).toValue(mailerMock)

    // Register the handler
    container.get(EmailService)

    eventEmitter = container.get(EventEmitter)
  })

  it('should send welcome email on UserCreated', async () => {
    await eventEmitter.emitAsync(UserEvents.Created, {
      userId: '123',
      email: 'test@example.com',
      createdAt: new Date(),
    })

    expect(mailerMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
        template: 'welcome',
      })
    )
  })
})
```

---

## Complete Example

```typescript
// events/index.ts
import { EventToken } from '@navios/events'

export namespace UserEvents {
  export const Created = EventToken.create<{
    userId: string
    email: string
    name: string
  }>('user.created')

  export const Updated = EventToken.create<{
    userId: string
    changes: Partial<User>
  }>('user.updated')

  export const Deleted = EventToken.create<{
    userId: string
  }>('user.deleted')
}

export namespace OrderEvents {
  export const Created = EventToken.create<{
    orderId: string
    userId: string
    items: OrderItem[]
  }>('order.created')

  export const Completed = EventToken.create<{
    orderId: string
    userId: string
    total: number
  }>('order.completed')
}
```

```typescript
// events.provider.ts
import { provideEventService } from '@navios/events'

export const EventToken = provideEventService({
  wildcard: true,
  onError: (error, eventName) => {
    console.error(`Event handler error [${eventName}]:`, error)
  },
})
```

```typescript
// services/user.service.ts
import { Injectable, inject } from '@navios/di'
import { EventEmitter } from '@navios/events'
import { UserEvents } from '../events'

@Injectable()
class UserService {
  private db = inject(DatabaseService)
  private events = inject(EventEmitter)

  async createUser(data: CreateUserDto): Promise<User> {
    const user = await this.db.users.create({ data })

    this.events.emit(UserEvents.Created, {
      userId: user.id,
      email: user.email,
      name: user.name,
    })

    return user
  }

  async updateUser(userId: string, data: UpdateUserDto): Promise<User> {
    const user = await this.db.users.update({
      where: { id: userId },
      data,
    })

    this.events.emit(UserEvents.Updated, {
      userId: user.id,
      changes: data,
    })

    return user
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db.users.delete({ where: { id: userId } })

    this.events.emit(UserEvents.Deleted, { userId })
  }
}
```

```typescript
// handlers/email.handler.ts
import { Injectable, inject } from '@navios/di'
import { OnEvent } from '@navios/events'
import { UserEvents, OrderEvents } from '../events'

@Injectable()
class EmailHandler {
  private mailer = inject(MailerService)
  private userService = inject(UserService)

  @OnEvent(UserEvents.Created)
  async sendWelcomeEmail(payload: typeof UserEvents.Created.payload) {
    await this.mailer.send({
      to: payload.email,
      template: 'welcome',
      data: { name: payload.name },
    })
  }

  @OnEvent(OrderEvents.Completed)
  async sendOrderConfirmation(payload: typeof OrderEvents.Completed.payload) {
    const user = await this.userService.findById(payload.userId)

    await this.mailer.send({
      to: user.email,
      template: 'order-confirmation',
      data: {
        orderId: payload.orderId,
        total: payload.total,
      },
    })
  }
}
```

```typescript
// handlers/analytics.handler.ts
import { Injectable, inject } from '@navios/di'
import { OnEvent, OnEvents } from '@navios/events'
import { UserEvents, OrderEvents } from '../events'

@Injectable()
class AnalyticsHandler {
  private analytics = inject(AnalyticsService)

  @OnEvent(UserEvents.Created)
  async trackUserCreation(payload: typeof UserEvents.Created.payload) {
    await this.analytics.track('user_signup', {
      userId: payload.userId,
    })
  }

  @OnEvents([OrderEvents.Created, OrderEvents.Completed])
  async trackOrderEvent(payload: unknown, eventName: string) {
    await this.analytics.track(eventName, payload)
  }
}
```

```typescript
// handlers/audit.handler.ts
import { Injectable, inject } from '@navios/di'
import { OnEvent } from '@navios/events'

@Injectable()
class AuditHandler {
  private auditLog = inject(AuditLogService)

  // Listen to all events using wildcard
  @OnEvent('**')
  async logAllEvents(payload: unknown, eventName: string) {
    await this.auditLog.record({
      event: eventName,
      data: payload,
      timestamp: new Date(),
    })
  }
}
```

```typescript
// modules/app.module.ts
import { Module } from '@navios/core'
import { EventToken } from './events.provider'

@Module({
  providers: [
    EventToken,
    UserService,
    OrderService,
    EmailHandler,
    AnalyticsHandler,
    AuditHandler,
  ],
  controllers: [UserController, OrderController],
})
class AppModule {}
```

---

## API Reference Summary

### Provider Function

| Export               | Type     | Description                     |
| -------------------- | -------- | ------------------------------- |
| `provideEventService`| Function | Creates event service provider  |

### Service & Types

| Export                | Type         | Description                     |
| --------------------- | ------------ | ------------------------------- |
| `EventEmitter`        | Class        | Main event emitter service      |
| `EventToken`          | Class        | Type-safe event token factory   |
| `OnEvent`             | Decorator    | Listen to single event          |
| `OnEvents`            | Decorator    | Listen to multiple events       |
| `OnceEvent`           | Decorator    | Listen once then remove         |
| `EventError`          | EventToken   | Built-in error event            |

### EventEmitter Methods

| Method           | Return              | Description                    |
| ---------------- | ------------------- | ------------------------------ |
| `emit`           | `void`              | Fire and forget emission       |
| `emitAsync`      | `Promise<void>`     | Wait for all handlers          |
| `emitSeries`     | `Promise<void>`     | Execute handlers sequentially  |
| `emitWithResult` | `Promise<R[]>`      | Collect handler results        |
| `addListener`    | `void`              | Programmatically add listener  |
| `removeListener` | `void`              | Remove a listener              |
| `listenerCount`  | `number`            | Count listeners for event      |

### Configuration Options

| Property            | Type       | Default | Description                    |
| ------------------- | ---------- | ------- | ------------------------------ |
| `wildcard`          | `boolean`  | `false` | Enable wildcard patterns       |
| `delimiter`         | `string`   | `'.'`   | Event name delimiter           |
| `maxListeners`      | `number`   | `10`    | Max listeners per event        |
| `ignoreErrors`      | `boolean`  | `false` | Suppress handler errors        |
| `onError`           | `Function` | -       | Global error handler           |
