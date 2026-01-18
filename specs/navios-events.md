# @navios/events Specification

## Overview

`@navios/events` is a type-safe event system for the Navios framework. It provides a builder-based API for defining events with Zod schema validation, decorator-based event handling, and seamless integration with Navios's dependency injection system. The system supports both local and distributed event processing through adapter-based architecture.

**Package:** `@navios/events`
**Version:** 0.1.0
**License:** MIT
**Dependencies:** `zod`
**Peer Dependencies:** `@navios/core`, `@navios/di`

---

## Core Concepts

### Architecture Overview

```
EventBuilder
├── defineEvent({ event, payloadSchema? }) - Define single event
└── anyOf([...events]) - Create event namespace

EventManager (from provideEventManager)
├── emit(event(payload)) - Emit events
├── register(Service) - Register event handlers
├── Adapter Support
│   ├── In-Memory (default)
│   ├── Redis
│   └── Keyv
└── Callbacks
    ├── onError - Error handling
    └── onMessage - Metrics/monitoring
```

### Key Principles

- **Builder-Based** - Events defined using `eventBuilder()` with `defineEvent` and `anyOf`
- **Type-Safe** - Full TypeScript support with inferred types from Zod schemas
- **Schema Validation** - Automatic payload validation on emit using Zod
- **Decorator-Based** - Clean API using `@OnEvent` and `@OnEvents` decorators
- **DI Integration** - Event handlers are injectable services registered with EventManager
- **Distributed** - Support for distributed events across instances via adapters

---

## Event Builder API

### Creating Events

Events are created using the `eventBuilder()` function, which returns an object with methods to define events.

```typescript
import { eventBuilder } from '@navios/events'
import { z } from 'zod'

const builder = eventBuilder()

// Define event with Zod schema
export const userCreated = builder.defineEvent({
  event: 'user.created',
  payloadSchema: z.object({
    userId: z.string(),
    email: z.string().email(),
    name: z.string(),
    createdAt: z.date(),
  }),
})

// Define event without schema (payload type inferred from usage)
export const systemStarted = builder.defineEvent({
  event: 'system.started',
})

// Define event with complex schema
export const orderCompleted = builder.defineEvent({
  event: 'order.completed',
  payloadSchema: z.object({
    orderId: z.string(),
    userId: z.string(),
    items: z.array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
        price: z.number().positive(),
      }),
    ),
    total: z.number().positive(),
    completedAt: z.date(),
  }),
})
```

### Creating Event Namespaces

Use `anyOf()` to create an event namespace from multiple events. This is useful for handlers that listen to multiple related events.

```typescript
import { eventBuilder } from '@navios/events'
import { z } from 'zod'

const builder = eventBuilder()

// Define individual events
export const userCreated = builder.defineEvent({
  event: 'user.created',
  payloadSchema: z.object({
    userId: z.string(),
    email: z.string(),
  }),
})

export const userUpdated = builder.defineEvent({
  event: 'user.updated',
  payloadSchema: z.object({
    userId: z.string(),
    changes: z.record(z.unknown()),
  }),
})

export const userDeleted = builder.defineEvent({
  event: 'user.deleted',
  payloadSchema: z.object({
    userId: z.string(),
  }),
})

// Create namespace from multiple events
export const userEvents = builder.anyOf([
  userCreated,
  userUpdated,
  userDeleted,
])
```

### Organizing Events

```typescript
// events/user.events.ts
import { eventBuilder } from '@navios/events'
import { z } from 'zod'

const userBuilder = eventBuilder()

export const userCreated = userBuilder.defineEvent({
  event: 'user.created',
  payloadSchema: z.object({
    userId: z.string(),
    email: z.string().email(),
    name: z.string(),
  }),
})

export const userUpdated = userBuilder.defineEvent({
  event: 'user.updated',
  payloadSchema: z.object({
    userId: z.string(),
    changes: z.record(z.unknown()),
  }),
})

export const userDeleted = userBuilder.defineEvent({
  event: 'user.deleted',
  payloadSchema: z.object({
    userId: z.string(),
  }),
})

export const userEvents = userBuilder.anyOf([
  userCreated,
  userUpdated,
  userDeleted,
])

// events/order.events.ts
import { eventBuilder } from '@navios/events'
import { z } from 'zod'

const orderBuilder = eventBuilder()

export const orderCreated = orderBuilder.defineEvent({
  event: 'order.created',
  payloadSchema: z.object({
    orderId: z.string(),
    userId: z.string(),
    items: z.array(
      z.object({
        productId: z.string(),
        quantity: z.number(),
      }),
    ),
  }),
})

export const orderCompleted = orderBuilder.defineEvent({
  event: 'order.completed',
  payloadSchema: z.object({
    orderId: z.string(),
    userId: z.string(),
    total: z.number(),
  }),
})

export const orderEvents = orderBuilder.anyOf([
  orderCreated,
  orderCompleted,
])
```

---

## Event Manager Setup

### Provider Function

The event system is configured using the `provideEventManager()` function which returns an `InjectionToken`.

```typescript
import { provideEventManager } from '@navios/events'

// Basic configuration (in-memory adapter)
const MyEventManager = provideEventManager()

// With error handling and metrics
const MyEventManager = provideEventManager({
  onError: (error, eventName, handler) => {
    console.error(`Handler error for ${eventName}:`, error)
    // Send to error tracking service
    sentry.captureException(error, {
      tags: { event: eventName },
    })
  },
  onMessage: (eventName, payload) => {
    // Track metrics
    metrics.increment('events.emitted', { event: eventName })
  },
})

// With Redis adapter for distributed events
import { createRedisAdapter } from '@navios/events/adapters/redis'

const MyEventManager = provideEventManager({
  adapter: createRedisAdapter({
    url: process.env.REDIS_URL,
  }),
  onError: (error, eventName) => {
    logger.error(`Event error [${eventName}]:`, error)
  },
  onMessage: (eventName, payload) => {
    metrics.track('event', { name: eventName })
  },
})

// With Keyv adapter
import { createKeyvAdapter } from '@navios/events/adapters/keyv'
import Keyv from 'keyv'

const MyEventManager = provideEventManager({
  adapter: createKeyvAdapter(
    new Keyv(process.env.DATABASE_URL),
  ),
  onError: (error, eventName) => {
    console.error(`Error:`, error)
  },
  onMessage: (eventName) => {
    console.log(`Event emitted: ${eventName}`)
  },
})
```

### Module Registration

The EventManager token must be provided in the module's providers array, and services with event handlers must be registered in `onModuleInit`.

```typescript
import { Module, NaviosModule } from '@navios/core'
import { Injectable, inject } from '@navios/di'
import { provideEventManager } from '@navios/events'

const MyEventManager = provideEventManager({
  onError: (error, eventName) => {
    console.error(`Event error:`, error)
  },
  onMessage: (eventName) => {
    console.log(`Event: ${eventName}`)
  },
})

@Module()
export class AppModule implements NaviosModule {
  private eventManager = inject(MyEventManager)

  async onModuleInit() {
    // Register services with event handlers
    // This scans for @OnEvent/@OnEvents decorators
    this.eventManager.register(EmailHandler)
    this.eventManager.register(AnalyticsHandler)
  }
}
```

---

## Event Emission

### Injection

```typescript
import { Injectable, inject } from '@navios/di'

@Injectable()
class UserService {
  private eventEmitter = inject(MyEventManager)
}
```

### emit(event(payload))

Emits an event. The event is a function that takes the payload and returns an event object. Payload validation happens automatically if a schema was provided.

```typescript
import { Injectable, inject } from '@navios/di'
import { userCreated } from './events/user.events'

@Injectable()
class UserService {
  private db = inject(DatabaseService)
  private eventEmitter = inject(MyEventManager)

  async createUser(data: CreateUserDto): Promise<User> {
    const user = await this.db.users.create({ data })

    // Emit event - payload is validated against schema
    // userCreated(payload) returns { event: 'user.created', payload: {...} }
    this.eventEmitter.emit(
      userCreated({
        userId: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      }),
    )

    return user
  }
}
```

**Event Function Signature:**
- Events created with `defineEvent` are functions that accept the payload
- Returns an object: `{ event: string, payload: T }` where `T` is inferred from the schema
- If `payloadSchema` is provided, validation occurs on emit and throws `ZodError` on failure
- TypeScript ensures payload matches the inferred schema type at compile time

**Validation Errors:**
If payload validation fails, a `ZodError` is thrown immediately before the event is emitted:

```typescript
try {
  this.eventEmitter.emit(
    userCreated({
      userId: user.id,
      email: 'invalid-email', // Fails validation
      name: user.name,
    }),
  )
} catch (error) {
  if (error instanceof ZodError) {
    // Handle validation error
    console.error('Invalid event payload:', error.errors)
  }
}
```

**Returns:** `void` (fire and forget - handlers execute asynchronously)

### emitAsync(event(payload))

Emits an event and waits for all handlers to complete (parallel execution).

```typescript
@Injectable()
class OrderService {
  private eventEmitter = inject(MyEventManager)

  async completeOrder(orderId: string): Promise<Order> {
    const order = await this.db.orders.update({
      where: { id: orderId },
      data: { status: 'completed' },
    })

    // Wait for all handlers to complete
    await this.eventEmitter.emitAsync(
      orderCompleted({
        orderId: order.id,
        userId: order.userId,
        total: order.total,
      }),
    )

    return order
  }
}
```

**Returns:** `Promise<void>` - Resolves when all handlers complete (or reject if any handler throws and errors aren't suppressed)

**Handler Execution:**
- Handlers execute in parallel by default
- Execution order is determined by `priority` option (higher priority first)
- If a handler throws and `suppressErrors` is `false`, the promise rejects
- If `suppressErrors` is `true` or `onError` handles it, the promise resolves even if handlers fail

### Events Without Payloads

For events without payloads, define them without a schema:

```typescript
const systemStarted = builder.defineEvent({
  event: 'system.started',
})

// Emit without payload
this.eventEmitter.emit(systemStarted())

// Handler receives empty payload
@OnEvent(systemStarted)
async onSystemStart(args: EventParams<typeof systemStarted>) {
  // args.payload is void or undefined
  console.log('System started:', args.event)
}
```

---

## Event Listeners

### @OnEvent(event)

Listens to a specific event. The handler receives typed parameters via `EventParams<typeof event>`.

```typescript
import { Injectable, inject } from '@navios/di'
import { OnEvent, EventParams } from '@navios/events'
import { userCreated } from './events/user.events'

@Injectable()
class EmailHandler {
  private mailer = inject(MailerService)

  @OnEvent(userCreated)
  async sendWelcomeEmail(args: EventParams<typeof userCreated>) {
    // args.payload is typed based on the event's schema
    // args.event contains the event name
    await this.mailer.send({
      to: args.payload.email,
      template: 'welcome',
      data: {
        userId: args.payload.userId,
        name: args.payload.name,
      },
    })
  }
}

@Injectable()
class AnalyticsHandler {
  private analytics = inject(AnalyticsClient)

  @OnEvent(userCreated)
  async trackUserCreation(args: EventParams<typeof userCreated>) {
    await this.analytics.track('user_created', {
      userId: args.payload.userId,
      timestamp: args.payload.createdAt,
    })
  }
}
```

**EventParams Type:**
```typescript
type EventParams<Event> = {
  payload: InferPayload<Event>  // Inferred from Zod schema
  event: string                  // Event name
}
```

### @OnEvents(eventNamespace)

Listens to multiple events using an event namespace created with `anyOf()`. The handler receives a discriminated union via `NamespaceParams<typeof eventNamespace>`.

```typescript
import { Injectable, inject } from '@navios/di'
import { OnEvents, NamespaceParams } from '@navios/events'
import { userEvents } from './events/user.events'

@Injectable()
class AuditHandler {
  private auditLog = inject(AuditLogService)

  @OnEvents(userEvents)
  async logUserChange(args: NamespaceParams<typeof userEvents>) {
    // args is a discriminated union based on event name
    if (args.event === 'user.created') {
      // TypeScript knows args.payload is UserCreatedPayload here
      await this.auditLog.record({
        event: args.event,
        userId: args.payload.userId,
        email: args.payload.email,
        timestamp: new Date(),
      })
    } else if (args.event === 'user.updated') {
      // TypeScript knows args.payload is UserUpdatedPayload here
      await this.auditLog.record({
        event: args.event,
        userId: args.payload.userId,
        changes: args.payload.changes,
        timestamp: new Date(),
      })
    } else if (args.event === 'user.deleted') {
      // TypeScript knows args.payload is UserDeletedPayload here
      await this.auditLog.record({
        event: args.event,
        userId: args.payload.userId,
        timestamp: new Date(),
      })
    }
  }
}
```

**NamespaceParams Type:**
```typescript
// For namespace created from [event1, event2, event3]
type NamespaceParams<Namespace> =
  | { payload: Payload1, event: 'event1.name' }
  | { payload: Payload2, event: 'event2.name' }
  | { payload: Payload3, event: 'event3.name' }
```

### Handler Options

```typescript
@OnEvent(userCreated, {
  priority: 100,        // Higher priority runs first (default: 0)
  suppressErrors: false, // Don't throw on handler error (default: false)
})
async handleUserCreated(args: EventParams<typeof userCreated>) {
  // Handler implementation
}
```

**Options:**

| Property        | Type      | Default | Description                    |
| --------------- | --------- | ------- | ------------------------------ |
| `priority`      | `number`  | `0`     | Handler priority (higher first)|
| `suppressErrors`| `boolean` | `false` | Don't throw on handler error   |

---

## Service Registration

Services with `@OnEvent` or `@OnEvents` decorators must be registered with the EventManager in a module's `onModuleInit` lifecycle hook.

```typescript
import { Module, NaviosModule } from '@navios/core'
import { Injectable, inject } from '@navios/di'
import { provideEventManager } from '@navios/events'

const MyEventManager = provideEventManager({
  onError: (error, eventName) => {
    console.error(`Error in ${eventName}:`, error)
  },
})

@Module()
export class AppModule implements NaviosModule {
  private eventManager = inject(MyEventManager)

  async onModuleInit() {
    // Register all services with event handlers
    this.eventManager.register(EmailHandler)
    this.eventManager.register(AnalyticsHandler)
    this.eventManager.register(AuditHandler)
  }
}
```

**How Registration Works:**
- EventManager scans the service class for `@OnEvent` and `@OnEvents` decorators
- Extracts metadata about which events each method listens to
- Stores handler information to call when events are emitted
- Handlers are called with the service instance from the DI container
- If a service is registered multiple times, it's a no-op (idempotent)
- Services must be `@Injectable()` and available in the DI container

**Handler Lifecycle:**
- Handlers are called asynchronously when events are emitted
- Each handler receives a fresh service instance from the DI container (respects service scope)
- Handlers are executed in priority order (higher priority first)
- Multiple handlers for the same event execute in parallel
- Handler errors are caught and passed to `onError` callback (unless `suppressErrors: true`)

---

## Adapter System

The EventManager supports different adapters for event distribution. By default, events are processed in-memory. For distributed systems with multiple instances, use Redis or Keyv adapters.

**Adapter Interface:**
All adapters must implement the following interface:

```typescript
interface EventAdapter {
  /**
   * Publish an event to the adapter
   */
  publish(eventName: string, payload: unknown): Promise<void>

  /**
   * Subscribe to events matching a pattern
   */
  subscribe(
    pattern: string | string[],
    handler: (eventName: string, payload: unknown) => void | Promise<void>,
  ): Promise<() => void> // Returns unsubscribe function

  /**
   * Dispose of the adapter (cleanup connections, etc.)
   */
  dispose(): Promise<void>
}
```

### In-Memory Adapter (Default)

Events are processed locally within the same process. No adapter configuration needed.

```typescript
const MyEventManager = provideEventManager({
  // No adapter = in-memory
  onError: (error, eventName) => {
    console.error(`Error:`, error)
  },
})
```

### Redis Adapter

For distributed event processing across multiple instances.

```typescript
import { createRedisAdapter } from '@navios/events/adapters/redis'

const MyEventManager = provideEventManager({
  adapter: createRedisAdapter({
    url: process.env.REDIS_URL,
    // Optional: channel prefix
    channelPrefix: 'navios:events:',
  }),
  onError: (error, eventName) => {
    logger.error(`Event error:`, error)
  },
  onMessage: (eventName, payload) => {
    metrics.track('event', { name: eventName })
  },
})
```

### Keyv Adapter

For distributed events using any Keyv-compatible storage.

```typescript
import { createKeyvAdapter } from '@navios/events/adapters/keyv'
import Keyv from 'keyv'

const keyv = new Keyv(process.env.DATABASE_URL)

const MyEventManager = provideEventManager({
  adapter: createKeyvAdapter(keyv, {
    // Optional: namespace for events
    namespace: 'navios:events',
  }),
  onError: (error, eventName) => {
    console.error(`Error:`, error)
  },
})
```

### Local Event Emitter

For events that should only be processed locally (not distributed), create a separate EventManager without an adapter.

```typescript
// Distributed events
const DistributedEventManager = provideEventManager({
  adapter: createRedisAdapter({ url: process.env.REDIS_URL }),
})

// Local-only events
const LocalEventManager = provideEventManager({
  // No adapter = in-memory only
})

@Module()
export class AppModule implements NaviosModule {
  private distributedEvents = inject(DistributedEventManager)
  private localEvents = inject(LocalEventManager)

  async onModuleInit() {
    this.distributedEvents.register(UserService)
    this.localEvents.register(LocalEventHandler)
  }
}
```

---

## Error Handling

### Default Behavior

By default, errors in event handlers are caught and passed to the `onError` callback if provided. If no `onError` is configured, errors are logged to console.

```typescript
@Injectable()
class RiskyHandler {
  @OnEvent(someEvent)
  async handle(args: EventParams<typeof someEvent>) {
    throw new Error('Handler failed')
    // Error is caught and passed to onError callback
  }
}
```

### Suppress Errors

Prevent handler errors from being logged or tracked.

```typescript
@Injectable()
class RiskyHandler {
  @OnEvent(someEvent, { suppressErrors: true })
  async handle(args: EventParams<typeof someEvent>) {
    throw new Error('Handler failed')
    // Error is silently ignored
  }
}
```

### Global Error Handling

Configure error handling at the EventManager level.

```typescript
const MyEventManager = provideEventManager({
  onError: (error, eventName, handler) => {
    // Custom error handling
    logger.error(`Handler error for ${eventName}`, {
      error: error.message,
      handler: handler.name,
      stack: error.stack,
    })

    // Send to error tracking
    sentry.captureException(error, {
      tags: {
        event: eventName,
        handler: handler.name,
      },
    })
  },
})
```

---

## Testing

### Testing Event Emission

```typescript
import { TestContainer } from '@navios/di/testing'
import { provideEventManager } from '@navios/events'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('UserService', () => {
  let container: TestContainer
  let eventEmitter: EventEmitter

  beforeEach(async () => {
    container = new TestContainer()

    const MyEventManager = provideEventManager()

    eventEmitter = await container.get(MyEventManager)
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should emit userCreated event', async () => {
    const emitSpy = vi.spyOn(eventEmitter, 'emit')

    const userService = await container.get(UserService)
    await userService.createUser({ email: 'test@example.com' })

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'user.created',
        payload: expect.objectContaining({
          email: 'test@example.com',
        }),
      }),
    )
  })
})
```

### Testing Event Handlers

```typescript
import { TestContainer } from '@navios/di/testing'
import { provideEventManager } from '@navios/events'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('EmailHandler', () => {
  let container: TestContainer
  let eventEmitter: EventEmitter
  let mailerMock: { send: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    container = new TestContainer()

    mailerMock = { send: vi.fn() }
    container.bind(MailerService).toValue(mailerMock)

    const MyEventManager = provideEventManager()

    // Register handler
    const eventManager = container.get(MyEventManager)
    eventManager.register(EmailHandler)

    eventEmitter = await container.get(MyEventManager)
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should send welcome email on userCreated', async () => {
    await eventEmitter.emitAsync(
      userCreated({
        userId: '123',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
      }),
    )

    expect(mailerMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
        template: 'welcome',
      }),
    )
  })
})
```

---

## Complete Example

```typescript
// events/user.events.ts
import { eventBuilder } from '@navios/events'
import { z } from 'zod'

const builder = eventBuilder()

export const userCreated = builder.defineEvent({
  event: 'user.created',
  payloadSchema: z.object({
    userId: z.string(),
    email: z.string().email(),
    name: z.string(),
  }),
})

export const userUpdated = builder.defineEvent({
  event: 'user.updated',
  payloadSchema: z.object({
    userId: z.string(),
    changes: z.record(z.unknown()),
  }),
})

export const userDeleted = builder.defineEvent({
  event: 'user.deleted',
  payloadSchema: z.object({
    userId: z.string(),
  }),
})

export const userEvents = builder.anyOf([
  userCreated,
  userUpdated,
  userDeleted,
])

// events/order.events.ts
import { eventBuilder } from '@navios/events'
import { z } from 'zod'

const builder = eventBuilder()

export const orderCreated = builder.defineEvent({
  event: 'order.created',
  payloadSchema: z.object({
    orderId: z.string(),
    userId: z.string(),
    items: z.array(
      z.object({
        productId: z.string(),
        quantity: z.number(),
      }),
    ),
  }),
})

export const orderCompleted = builder.defineEvent({
  event: 'order.completed',
  payloadSchema: z.object({
    orderId: z.string(),
    userId: z.string(),
    total: z.number(),
  }),
})
```

```typescript
// events.provider.ts
import { provideEventManager } from '@navios/events'

export const MyEventManager = provideEventManager({
  onError: (error, eventName) => {
    console.error(`Event handler error [${eventName}]:`, error)
  },
  onMessage: (eventName, payload) => {
    console.log(`Event emitted: ${eventName}`)
  },
})
```

```typescript
// services/user.service.ts
import { Injectable, inject } from '@navios/di'
import { userCreated, userUpdated, userDeleted } from '../events/user.events'
import { MyEventManager } from '../events.provider'

@Injectable()
class UserService {
  private db = inject(DatabaseService)
  private eventEmitter = inject(MyEventManager)

  async createUser(data: CreateUserDto): Promise<User> {
    const user = await this.db.users.create({ data })

    this.eventEmitter.emit(
      userCreated({
        userId: user.id,
        email: user.email,
        name: user.name,
      }),
    )

    return user
  }

  async updateUser(userId: string, data: UpdateUserDto): Promise<User> {
    const user = await this.db.users.update({
      where: { id: userId },
      data,
    })

    this.eventEmitter.emit(
      userUpdated({
        userId: user.id,
        changes: data,
      }),
    )

    return user
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db.users.delete({ where: { id: userId } })

    this.eventEmitter.emit(
      userDeleted({ userId }),
    )
  }
}
```

```typescript
// handlers/email.handler.ts
import { Injectable, inject } from '@navios/di'
import { OnEvent, EventParams } from '@navios/events'
import { userCreated, orderCompleted } from '../events'

@Injectable()
class EmailHandler {
  private mailer = inject(MailerService)
  private userService = inject(UserService)

  @OnEvent(userCreated)
  async sendWelcomeEmail(args: EventParams<typeof userCreated>) {
    await this.mailer.send({
      to: args.payload.email,
      template: 'welcome',
      data: {
        userId: args.payload.userId,
        name: args.payload.name,
      },
    })
  }

  @OnEvent(orderCompleted)
  async sendOrderConfirmation(args: EventParams<typeof orderCompleted>) {
    const user = await this.userService.findById(args.payload.userId)

    await this.mailer.send({
      to: user.email,
      template: 'order-confirmation',
      data: {
        orderId: args.payload.orderId,
        total: args.payload.total,
      },
    })
  }
}
```

```typescript
// handlers/analytics.handler.ts
import { Injectable, inject } from '@navios/di'
import { OnEvent, EventParams } from '@navios/events'
import { userCreated } from '../events'

@Injectable()
class AnalyticsHandler {
  private analytics = inject(AnalyticsService)

  @OnEvent(userCreated)
  async trackUserCreation(args: EventParams<typeof userCreated>) {
    await this.analytics.track('user_signup', {
      userId: args.payload.userId,
    })
  }
}
```

```typescript
// handlers/audit.handler.ts
import { Injectable, inject } from '@navios/di'
import { OnEvents, NamespaceParams } from '@navios/events'
import { userEvents } from '../events'

@Injectable()
class AuditHandler {
  private auditLog = inject(AuditLogService)

  @OnEvents(userEvents)
  async logUserChange(args: NamespaceParams<typeof userEvents>) {
    if (args.event === 'user.created') {
      await this.auditLog.record({
        event: args.event,
        userId: args.payload.userId,
        email: args.payload.email,
        timestamp: new Date(),
      })
    } else if (args.event === 'user.updated') {
      await this.auditLog.record({
        event: args.event,
        userId: args.payload.userId,
        changes: args.payload.changes,
        timestamp: new Date(),
      })
    } else if (args.event === 'user.deleted') {
      await this.auditLog.record({
        event: args.event,
        userId: args.payload.userId,
        timestamp: new Date(),
      })
    }
  }
}
```

```typescript
// modules/app.module.ts
import { Module, NaviosModule } from '@navios/core'
import { Injectable, inject } from '@navios/di'
import { MyEventManager } from './events.provider'

@Module({
  controllers: [UserController, OrderController],
})
export class AppModule implements NaviosModule {
  private eventManager = inject(MyEventManager)

  async onModuleInit() {
    // Register all services with event handlers
    this.eventManager.register(EmailHandler)
    this.eventManager.register(AnalyticsHandler)
    this.eventManager.register(AuditHandler)
  }
}
```

---

## Best Practices

### Event Naming

Use dot-separated, hierarchical names for events:

```typescript
// ✅ Good
'user.created'
'user.updated'
'order.payment.completed'
'order.shipping.failed'

// ❌ Avoid
'userCreated'
'USER_CREATED'
'user/created'
```

### Schema Design

Always define schemas for events to ensure type safety and runtime validation:

```typescript
// ✅ Good - explicit schema
export const userCreated = builder.defineEvent({
  event: 'user.created',
  payloadSchema: z.object({
    userId: z.string().uuid(),
    email: z.string().email(),
    name: z.string().min(1),
  }),
})

// ⚠️ Acceptable - no schema (types inferred from usage)
export const systemStarted = builder.defineEvent({
  event: 'system.started',
})
```

### Error Handling

Always provide an `onError` callback for production applications:

```typescript
const MyEventManager = provideEventManager({
  onError: (error, eventName, handler) => {
    // Log error
    logger.error(`Handler error [${eventName}]`, {
      error: error.message,
      handler: handler.name,
      stack: error.stack,
    })

    // Send to error tracking
    sentry.captureException(error, {
      tags: { event: eventName, handler: handler.name },
    })

    // Alert on critical errors
    if (error instanceof CriticalError) {
      alerting.send({ severity: 'critical', event: eventName })
    }
  },
})
```

### Handler Organization

Group related handlers in the same service:

```typescript
// ✅ Good - related handlers together
@Injectable()
class UserEventHandler {
  @OnEvent(userCreated)
  async sendWelcomeEmail(args: EventParams<typeof userCreated>) { }

  @OnEvent(userUpdated)
  async syncToCache(args: EventParams<typeof userUpdated>) { }

  @OnEvents(userEvents)
  async auditLog(args: NamespaceParams<typeof userEvents>) { }
}

// ❌ Avoid - unrelated handlers mixed
@Injectable()
class MixedHandler {
  @OnEvent(userCreated)
  async handleUser() { }

  @OnEvent(orderCompleted)
  async handleOrder() { }
}
```

### Local vs Distributed Events

Use local events for internal, process-specific events. Use distributed events for cross-instance communication:

```typescript
// Local events - fast, no network overhead
const LocalEventManager = provideEventManager()

// Distributed events - for multi-instance deployments
const DistributedEventManager = provideEventManager({
  adapter: createRedisAdapter({ url: process.env.REDIS_URL }),
})
```

### Module Registration

Register all event handlers in the module's `onModuleInit`:

```typescript
@Module()
export class AppModule implements NaviosModule {
  private eventManager = inject(MyEventManager)

  async onModuleInit() {
    // Register all handlers at once
    this.eventManager.register(EmailHandler)
    this.eventManager.register(AnalyticsHandler)
    this.eventManager.register(AuditHandler)
  }
}
```

---

## Troubleshooting

### Handlers Not Executing

**Problem:** Event handlers are not being called when events are emitted.

**Solutions:**
1. Ensure the service is registered with `eventManager.register(Service)`
2. Verify the service is `@Injectable()` and in the DI container
3. Check that the event name matches exactly (case-sensitive)
4. Ensure registration happens in `onModuleInit` (after DI container is ready)

### Type Errors with EventParams

**Problem:** TypeScript errors when using `EventParams<typeof event>`.

**Solutions:**
1. Ensure the event was created with `defineEvent` from the same builder
2. Check that the event has a schema if you're accessing `payload` properties
3. For events without schemas, `payload` may be `void` or `unknown`

### Validation Errors

**Problem:** Events fail to emit with Zod validation errors.

**Solutions:**
1. Check that payload matches the schema exactly
2. Ensure date objects are actually `Date` instances, not strings
3. Use `.passthrough()` or `.strict()` on schemas if needed
4. Wrap emit in try-catch to handle validation errors gracefully

### Handler Execution Order

**Problem:** Handlers execute in unexpected order.

**Solutions:**
1. Use `priority` option to control execution order
2. Higher priority handlers execute first
3. Handlers with same priority execute in parallel (order not guaranteed)
4. Use `emitAsync` to wait for handlers to complete

### Memory Leaks

**Problem:** Event handlers accumulate over time.

**Solutions:**
1. Ensure services are properly disposed when modules are destroyed
2. Use `unregister()` if dynamically adding/removing handlers
3. Check for circular references in event handlers
4. Monitor handler count with adapter metrics

---

## API Reference Summary

### Builder Function

| Export        | Type     | Description                    |
| ------------- | -------- | ------------------------------ |
| `eventBuilder`| Function | Creates event builder instance |

### Builder Methods

| Method        | Return           | Description                    |
| ------------- | ---------------- | ------------------------------ |
| `defineEvent` | `Event`          | Define a single event           |
| `anyOf`       | `EventNamespace` | Create namespace from events    |

### Provider Function

| Export              | Type     | Description                    |
| ------------------- | -------- | ------------------------------ |
| `provideEventManager`| Function | Creates event manager provider |

### Configuration Options

| Property   | Type       | Default | Description                    |
| ---------- | ---------- | ------- | ------------------------------ |
| `adapter`   | `Adapter`  | In-Memory | Event distribution adapter    |
| `onError`   | `Function` | -       | Error handler callback          |
| `onMessage` | `Function` | -       | Message callback for metrics   |

### Decorators

| Export    | Type      | Description                    |
| --------- | --------- | ------------------------------ |
| `@OnEvent`| Decorator | Listen to single event          |
| `@OnEvents`| Decorator | Listen to event namespace       |

### Type Helpers

| Export          | Type      | Description                    |
| --------------- | --------- | ------------------------------ |
| `EventParams`   | Type      | Parameters for @OnEvent handler|
| `NamespaceParams`| Type     | Parameters for @OnEvents handler|

### EventManager Methods

| Method      | Return            | Description                    |
| ----------- | ----------------- | ------------------------------ |
| `emit`      | `void`            | Emit an event (fire and forget)|
| `emitAsync` | `Promise<void>`  | Emit and await all handlers    |
| `register`  | `void`            | Register service with handlers |
| `unregister`| `void`            | Unregister a service           |

### Adapter Functions

| Export            | Type     | Description                    |
| ----------------- | -------- | ------------------------------ |
| `createRedisAdapter`| Function | Create Redis adapter          |
| `createKeyvAdapter`| Function | Create Keyv adapter           |
