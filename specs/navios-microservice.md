# @navios/microservice Specification

## Overview

`@navios/microservice` is a message-driven microservice framework for Navios. It provides decorator-based message handling with seamless integration into Navios's dependency injection system and the `@navios/queues` transport layer.

**Package:** `@navios/microservice`
**Version:** 0.1.0
**License:** MIT
**Dependencies:** None
**Peer Dependencies:** `@navios/core`, `@navios/di`, `@navios/queues`

---

## Core Concepts

### Architecture Overview

```
MicroserviceFactory
├── MessageModule (organizes handlers)
│   ├── MessageControllers (group related handlers)
│   │   └── @Message(definition) handlers
│   ├── Guards (authorization/validation)
│   └── Imported MessageModules
│
├── Attributes (cross-cutting concerns)
│   ├── Acknowledgment: @Ack, @NoAck, @ManualAck
│   ├── @Retry - exponential backoff, max attempts
│   ├── @DeadLetterQueue - failure handling
│   ├── @Concurrency - prefetch, max concurrent
│   ├── @Timeout - processing time limits
│   ├── @Idempotency - duplicate detection
│   ├── @RateLimit - throttling
│   └── @BatchProcessing - batch processing
│
└── Transports (via @navios/queues)
    ├── RabbitMQ
    ├── Kafka
    └── AWS SQS/SNS
```

### Key Principles

- **Contract-First** - Define messages with `messageBuilder()`, bind with `@Message()`
- **DI Integration** - Full dependency injection via `inject()`
- **Type-Safe Messages** - Zod-validated message payloads
- **Transport Agnostic** - Same handlers work with any queue system
- **Resilient** - Built-in retry, DLQ, and error handling

---

## Message Definitions (Contract-First)

Define type-safe messages using `@navios/queues` message builder.

### Pub/Sub Messages

One-to-many event broadcasting.

```typescript
import { messageBuilder } from '@navios/queues'
import { z } from 'zod'

const messages = messageBuilder()

// Define the message contract
export const UserCreatedMessage = messages.declarePubSub({
  topic: 'user.created',
  payloadSchema: z.object({
    userId: z.string().uuid(),
    email: z.string().email(),
    createdAt: z.string().datetime(),
  }),
})

export const OrderPlacedMessage = messages.declarePubSub({
  topic: 'order.placed',
  payloadSchema: z.object({
    orderId: z.string(),
    userId: z.string(),
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number(),
      price: z.number(),
    })),
    total: z.number(),
  }),
})
```

### Point-to-Point Messages

Direct queue-based messaging.

```typescript
export const ProcessPaymentMessage = messages.declarePointToPoint({
  queue: 'payments.process',
  payloadSchema: z.object({
    paymentId: z.string(),
    orderId: z.string(),
    amount: z.number(),
    currency: z.string(),
    method: z.enum(['card', 'bank', 'crypto']),
  }),
})

export const SendEmailMessage = messages.declarePointToPoint({
  queue: 'emails.send',
  payloadSchema: z.object({
    to: z.string().email(),
    subject: z.string(),
    template: z.string(),
    data: z.record(z.unknown()),
  }),
})
```

### Request/Reply Messages

RPC-style synchronous communication.

```typescript
export const GetUserMessage = messages.declareRequestReply({
  topic: 'user.get',
  payloadSchema: z.object({
    userId: z.string(),
  }),
  responseSchema: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    createdAt: z.string(),
  }),
})

export const ValidateInventoryMessage = messages.declareRequestReply({
  topic: 'inventory.validate',
  payloadSchema: z.object({
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number(),
    })),
  }),
  responseSchema: z.object({
    valid: z.boolean(),
    unavailable: z.array(z.string()),
  }),
})
```

---

## Setup

### Queue Client Configuration

Configure the queue client using `provideQueueClient`.

```typescript
import { provideQueueClient, RabbitMQClient } from '@navios/queues'

// Static configuration
export const QueueClient = provideQueueClient({
  adapter: 'rabbitmq',
  url: 'amqp://localhost:5672',
})

// Or async configuration
export const QueueClient = provideQueueClient(async () => {
  const config = await inject(ConfigService)
  return {
    adapter: 'rabbitmq',
    url: config.rabbitmq.url,
  }
})
```

### Message Module

```typescript
import { MessageModule, MessageController, Message } from '@navios/microservice'

@MessageModule({
  controllers: [OrderController, UserController],
})
class AppMessageModule {}
```

### Starting the Microservice

```typescript
import { MicroserviceFactory } from '@navios/microservice'

async function bootstrap() {
  const app = await MicroserviceFactory.create(AppMessageModule)

  // Start consuming messages
  await app.start()

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await app.stop()
  })
}

bootstrap()
```

---

## Message Controllers

### Basic Controller

```typescript
import { inject } from '@navios/di'
import { MessageController, Message, MessageParams } from '@navios/microservice'
import { UserCreatedMessage, OrderPlacedMessage } from './messages'

@MessageController()
class NotificationController {
  private emailService = inject(EmailService)
  private pushService = inject(PushService)

  @Message(UserCreatedMessage)
  async handleUserCreated(params: MessageParams<typeof UserCreatedMessage>) {
    const { userId, email } = params.payload

    await this.emailService.sendWelcome(email)
    console.log(`Welcome email sent to user ${userId}`)
  }

  @Message(OrderPlacedMessage)
  async handleOrderPlaced(params: MessageParams<typeof OrderPlacedMessage>) {
    const { orderId, userId, total } = params.payload

    await this.pushService.notify(userId, {
      title: 'Order Confirmed',
      body: `Your order #${orderId} for $${total} has been placed.`,
    })
  }
}
```

### Request/Reply Handler

```typescript
@MessageController()
class UserController {
  private userService = inject(UserService)

  @Message(GetUserMessage)
  async handleGetUser(
    params: MessageParams<typeof GetUserMessage>
  ): MessageResult<typeof GetUserMessage> {
    const user = await this.userService.findById(params.payload.userId)

    if (!user) {
      throw new MessageException('User not found', 'USER_NOT_FOUND')
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    }
  }
}
```

### MessageParams Type

The handler receives a single `params` object:

```typescript
type MessageParams<T extends MessageDefinition> = {
  // The validated message payload
  payload: z.infer<T['config']['payloadSchema']>
}
```

For advanced use cases with manual acknowledgment, additional context is available:

```typescript
// When using @ManualAck attribute
type MessageParamsWithAck<T> = MessageParams<T> & {
  ack(): Promise<void>
  nack(requeue?: boolean): Promise<void>
  reject(): Promise<void>
  metadata: {
    messageId: string
    correlationId?: string
    timestamp: Date
    redelivered: boolean
    attempt: number
  }
}
```

---

## Message Attributes

Attributes are decorators that add cross-cutting behavior to handlers.

### Acknowledgment Attributes

Control how messages are acknowledged.

```typescript
import { Message, Ack, NoAck, ManualAck } from '@navios/microservice'

@MessageController()
class OrderController {
  // Default: Auto-ack after successful handler execution
  @Message(OrderPlacedMessage)
  @Ack()
  async handleOrder(params: MessageParams<typeof OrderPlacedMessage>) {
    // Message auto-acknowledged on success
    // Auto-nacked on error
  }

  // No acknowledgment (fire and forget)
  @Message(LogEventMessage)
  @NoAck()
  async handleLog(params: MessageParams<typeof LogEventMessage>) {
    // Message acknowledged immediately on receive
  }

  // Manual acknowledgment for complex flows
  @Message(PaymentMessage)
  @ManualAck()
  async handlePayment(params: MessageParamsWithAck<typeof PaymentMessage>) {
    try {
      await this.processPayment(params.payload)
      await params.ack() // Explicit acknowledgment
    } catch (error) {
      if (isRetryable(error)) {
        await params.nack(true) // Requeue
      } else {
        await params.reject() // Send to DLQ
      }
    }
  }
}
```

### Retry Configuration

```typescript
import { Message, Retry } from '@navios/microservice'

@MessageController()
class PaymentController {
  @Message(ProcessPaymentMessage)
  @Retry({
    maxAttempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,      // Initial delay: 1s
      maxDelay: 60000,  // Max delay: 60s
      multiplier: 2,
    },
    retryOn: ['PAYMENT_GATEWAY_TIMEOUT', 'NETWORK_ERROR'],
    noRetryOn: ['INVALID_CARD', 'INSUFFICIENT_FUNDS'],
  })
  async processPayment(params: MessageParams<typeof ProcessPaymentMessage>) {
    // Retried automatically on failure
  }
}
```

### Dead Letter Queue

```typescript
import { Message, DeadLetterQueue } from '@navios/microservice'

@MessageController()
class OrderController {
  @Message(OrderPlacedMessage)
  @DeadLetterQueue({
    queue: 'orders.dlq',
    retryFromDlq: {
      enabled: true,
      maxAttempts: 3,
    },
  })
  async handleOrder(params: MessageParams<typeof OrderPlacedMessage>) {
    // Failed messages go to DLQ after retries exhausted
  }
}
```

### Concurrency Control

```typescript
import { Message, Concurrency } from '@navios/microservice'

@MessageController()
class HeavyProcessingController {
  @Message(ProcessVideoMessage)
  @Concurrency({
    maxConcurrent: 2,  // Only 2 videos processed at once
    prefetch: 2,       // Only fetch 2 messages at a time
  })
  async processVideo(params: MessageParams<typeof ProcessVideoMessage>) {
    // Resource-intensive processing
  }
}
```

### Timeout

```typescript
import { Message, Timeout } from '@navios/microservice'

@MessageController()
class ApiController {
  @Message(ExternalApiMessage)
  @Timeout({
    duration: 30000, // 30 seconds
    strategy: 'retry', // 'fail' | 'retry' | 'dlq'
  })
  async callExternalApi(params: MessageParams<typeof ExternalApiMessage>) {
    // Times out after 30s
  }
}
```

### Idempotency

Prevent duplicate processing.

```typescript
import { Message, Idempotency } from '@navios/microservice'

@MessageController()
class PaymentController {
  @Message(ProcessPaymentMessage)
  @Idempotency({
    key: (payload) => payload.paymentId,
    ttl: 86400000, // 24 hours
    storage: 'redis', // 'memory' | 'redis'
  })
  async processPayment(params: MessageParams<typeof ProcessPaymentMessage>) {
    // Duplicate messages with same paymentId are ignored
  }
}
```

### Rate Limiting

```typescript
import { Message, RateLimit } from '@navios/microservice'

@MessageController()
class EmailController {
  @Message(SendEmailMessage)
  @RateLimit({
    limit: 100,
    window: 60000, // 100 emails per minute
    strategy: 'queue', // 'drop' | 'queue' | 'fail'
  })
  async sendEmail(params: MessageParams<typeof SendEmailMessage>) {
    // Rate limited to prevent provider throttling
  }
}
```

### Batch Processing

Process multiple messages together.

```typescript
import { Message, BatchProcessing } from '@navios/microservice'

@MessageController()
class AnalyticsController {
  @Message(TrackEventMessage)
  @BatchProcessing({
    size: 100,        // Process 100 at a time
    timeout: 5000,    // Or after 5 seconds
    flushOnError: true,
  })
  async trackEvents(params: BatchMessageParams<typeof TrackEventMessage>) {
    // params.payloads is an array
    await this.analytics.trackBatch(params.payloads)
  }
}
```

### Priority

```typescript
import { Message, Priority } from '@navios/microservice'

@MessageController()
class NotificationController {
  @Message(UrgentAlertMessage)
  @Priority(10) // Higher priority
  async handleUrgent(params: MessageParams<typeof UrgentAlertMessage>) {
    // Processed before lower priority messages
  }

  @Message(NewsletterMessage)
  @Priority(1) // Lower priority
  async handleNewsletter(params: MessageParams<typeof NewsletterMessage>) {
    // Processed when queue is less busy
  }
}
```

---

## Guards

Protect message handlers with guards.

### Defining Guards

```typescript
import { Injectable, inject } from '@navios/di'
import { MessageGuard, MessageExecutionContext } from '@navios/microservice'

@Injectable()
class AuthMessageGuard implements MessageGuard {
  private authService = inject(AuthService)

  async canActivate(context: MessageExecutionContext): Promise<boolean> {
    const metadata = context.getMetadata()
    const token = metadata.headers?.['authorization']

    if (!token) {
      return false
    }

    try {
      const user = await this.authService.validateToken(token)
      context.setUser(user)
      return true
    } catch {
      return false
    }
  }
}
```

### Applying Guards

```typescript
import { MessageModule, MessageController, Message, UseGuards } from '@navios/microservice'

// Module-level guards (apply to all controllers)
@MessageModule({
  controllers: [OrderController],
  guards: [AuthMessageGuard],
})
class SecureModule {}

// Controller-level guards
@MessageController({ guards: [TenantGuard] })
class TenantController {
  @Message(TenantDataMessage)
  async handleTenantData(params: MessageParams<typeof TenantDataMessage>) {
    // Only accessible if guards pass
  }
}

// Handler-level guards
@MessageController()
class MixedController {
  @Message(PublicMessage)
  async handlePublic(params: MessageParams<typeof PublicMessage>) {
    // No guards
  }

  @Message(PrivateMessage)
  @UseGuards(AuthMessageGuard)
  async handlePrivate(params: MessageParams<typeof PrivateMessage>) {
    // Requires auth
  }
}
```

---

## Publishing Messages

Send messages from any service using injectable publishers.

### Using QueuePublisher

```typescript
import { Injectable, inject } from '@navios/di'
import { QueuePublisher, QueueSender } from '@navios/queues'
import { UserCreatedMessage, SendEmailMessage } from './messages'

@Injectable()
class UserService {
  // Inject with message definition for type safety
  private userPublisher = inject(QueuePublisher, {
    message: UserCreatedMessage,
  })

  private emailSender = inject(QueueSender, {
    message: SendEmailMessage,
  })

  async createUser(data: CreateUserDto) {
    const user = await this.db.users.create({ data })

    // Publish event (type-safe payload)
    await this.userPublisher.publish({
      userId: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    })

    // Send to queue (type-safe payload)
    await this.emailSender.send({
      to: user.email,
      subject: 'Welcome!',
      template: 'welcome',
      data: { name: user.name },
    })

    return user
  }
}
```

### Request/Reply

```typescript
import { Injectable, inject } from '@navios/di'
import { QueueRequester } from '@navios/queues'
import { GetUserMessage, ValidateInventoryMessage } from './messages'

@Injectable()
class OrderService {
  private userRequester = inject(QueueRequester, {
    message: GetUserMessage,
  })

  private inventoryRequester = inject(QueueRequester, {
    message: ValidateInventoryMessage,
  })

  async placeOrder(userId: string, items: OrderItem[]) {
    // Request user data (type-safe request and response)
    const user = await this.userRequester.request(
      { userId },
      { timeout: 5000 }
    )

    // Validate inventory
    const inventory = await this.inventoryRequester.request(
      { items },
      { timeout: 10000 }
    )

    if (!inventory.valid) {
      throw new Error(`Items unavailable: ${inventory.unavailable.join(', ')}`)
    }

    // Continue with order...
  }
}
```

---

## Error Handling

### Message Exceptions

```typescript
import { MessageException } from '@navios/microservice'

@MessageController()
class OrderController {
  @Message(OrderPlacedMessage)
  async handleOrder(params: MessageParams<typeof OrderPlacedMessage>) {
    const inventory = await this.checkInventory(params.payload.items)

    if (!inventory.available) {
      throw new MessageException(
        'Insufficient inventory',
        'INVENTORY_UNAVAILABLE',
        {
          retryable: false,
          sendToDlq: true,
          metadata: {
            unavailableItems: inventory.unavailable,
          },
        }
      )
    }
  }
}
```

### Global Error Handler

```typescript
import { Injectable, inject } from '@navios/di'
import { OnMessageError, MessageExecutionContext } from '@navios/microservice'

@Injectable()
class GlobalErrorHandler implements OnMessageError {
  private alerting = inject(AlertingService)
  private logger = inject(Logger)

  async handleError(error: Error, context: MessageExecutionContext) {
    this.logger.error('Message processing failed', {
      error: error.message,
      messageId: context.getMetadata().messageId,
      handler: context.getHandler(),
    })

    if (error instanceof CriticalError) {
      await this.alerting.send({
        severity: 'critical',
        message: error.message,
      })
    }
  }
}

// Register in module
@MessageModule({
  controllers: [OrderController],
  errorHandler: GlobalErrorHandler,
})
class AppModule {}
```

---

## Testing

### Unit Testing Handlers

```typescript
import { TestContainer } from '@navios/di/testing'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('OrderController', () => {
  let container: TestContainer
  let controller: OrderController

  beforeEach(async () => {
    container = new TestContainer()

    // Mock dependencies
    container.bind(EmailService).toValue({
      send: vi.fn(),
    })

    controller = await container.get(OrderController)
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should process order and send confirmation', async () => {
    const emailService = await container.get(EmailService)

    await controller.handleOrder({
      payload: {
        orderId: '123',
        userId: 'user-1',
        items: [{ productId: 'prod-1', quantity: 2, price: 10 }],
        total: 20,
      },
    })

    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'order-confirmation',
      })
    )
  })
})
```

---

## Complete Example

```typescript
// messages/order.messages.ts
import { messageBuilder } from '@navios/queues'
import { z } from 'zod'

const messages = messageBuilder()

export const OrderPlacedMessage = messages.declarePubSub({
  topic: 'order.placed',
  payloadSchema: z.object({
    orderId: z.string(),
    userId: z.string(),
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number(),
      price: z.number(),
    })),
    total: z.number(),
  }),
})

export const ProcessPaymentMessage = messages.declarePointToPoint({
  queue: 'payments.process',
  payloadSchema: z.object({
    orderId: z.string(),
    amount: z.number(),
    paymentMethod: z.string(),
  }),
})

export const SendNotificationMessage = messages.declarePointToPoint({
  queue: 'notifications.send',
  payloadSchema: z.object({
    userId: z.string(),
    type: z.enum(['email', 'push', 'sms']),
    template: z.string(),
    data: z.record(z.unknown()),
  }),
})
```

```typescript
// controllers/order.controller.ts
import { inject } from '@navios/di'
import {
  MessageController,
  Message,
  MessageParams,
  Retry,
  DeadLetterQueue,
  Idempotency,
} from '@navios/microservice'
import { QueueSender } from '@navios/queues'
import {
  OrderPlacedMessage,
  ProcessPaymentMessage,
  SendNotificationMessage,
} from '../messages/order.messages'

@MessageController()
class OrderController {
  private db = inject(DatabaseService)

  private paymentSender = inject(QueueSender, {
    message: ProcessPaymentMessage,
  })

  private notificationSender = inject(QueueSender, {
    message: SendNotificationMessage,
  })

  @Message(OrderPlacedMessage)
  @Retry({ maxAttempts: 3, backoff: { type: 'exponential', delay: 1000 } })
  @DeadLetterQueue({ queue: 'orders.dlq' })
  @Idempotency({ key: (p) => p.orderId, ttl: 86400000 })
  async handleOrderPlaced(params: MessageParams<typeof OrderPlacedMessage>) {
    const { orderId, userId, items, total } = params.payload

    // Save order to database
    await this.db.orders.create({
      data: { id: orderId, userId, items, total, status: 'pending' },
    })

    // Queue payment processing
    await this.paymentSender.send({
      orderId,
      amount: total,
      paymentMethod: 'card',
    })

    // Send confirmation notification
    await this.notificationSender.send({
      userId,
      type: 'email',
      template: 'order-placed',
      data: { orderId, total },
    })

    console.log(`Order ${orderId} processed successfully`)
  }
}
```

```typescript
// controllers/payment.controller.ts
import { Injectable, inject } from '@navios/di'
import {
  MessageController,
  Message,
  MessageParams,
  ManualAck,
  Timeout,
} from '@navios/microservice'
import { ProcessPaymentMessage } from '../messages/order.messages'

@MessageController()
@Injectable()
class PaymentController {
  private paymentGateway = inject(PaymentGateway)
  private db = inject(DatabaseService)

  @Message(ProcessPaymentMessage)
  @ManualAck()
  @Timeout({ duration: 30000, strategy: 'dlq' })
  async processPayment(params: MessageParamsWithAck<typeof ProcessPaymentMessage>) {
    const { orderId, amount, paymentMethod } = params.payload

    try {
      const result = await this.paymentGateway.charge({
        amount,
        method: paymentMethod,
      })

      await this.db.orders.update({
        where: { id: orderId },
        data: { status: 'paid', paymentId: result.id },
      })

      await params.ack()
    } catch (error) {
      if (isRetryableError(error)) {
        await params.nack(true)
      } else {
        await this.db.orders.update({
          where: { id: orderId },
          data: { status: 'payment_failed' },
        })
        await params.reject()
      }
    }
  }
}
```

```typescript
// modules/app.module.ts
import { MessageModule } from '@navios/microservice'
import { inject } from '@navios/di'

@MessageModule({
  controllers: [OrderController, PaymentController, NotificationController],
})
class AppMessageModule {}
```

```typescript
// main.ts
import { MicroserviceFactory } from '@navios/microservice'
import { AppMessageModule } from './modules/app.module'

async function bootstrap() {
  const app = await MicroserviceFactory.create(AppMessageModule)

  await app.start()
  console.log('Microservice is running')

  const shutdown = async () => {
    console.log('Shutting down...')
    await app.stop()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

bootstrap()
```

---

## API Reference Summary

### Module Exports

| Export                | Type       | Description                          |
| --------------------- | ---------- | ------------------------------------ |
| `MicroserviceFactory` | Class      | Creates and manages microservice     |
| `MessageModule`       | Decorator  | Define message module                |
| `MessageController`   | Decorator  | Define message controller            |
| `Message`             | Decorator  | Bind message definition to handler   |
| `MessageParams`       | Type       | Extract handler params type          |
| `MessageResult`       | Type       | Extract handler return type          |
| `Ack`                 | Decorator  | Auto-acknowledge on success          |
| `NoAck`               | Decorator  | No acknowledgment                    |
| `ManualAck`           | Decorator  | Manual acknowledgment                |
| `Retry`               | Decorator  | Configure retry behavior             |
| `DeadLetterQueue`     | Decorator  | Configure DLQ                        |
| `Concurrency`         | Decorator  | Limit concurrent processing          |
| `Timeout`             | Decorator  | Set processing timeout               |
| `Idempotency`         | Decorator  | Prevent duplicate processing         |
| `RateLimit`           | Decorator  | Throttle message processing          |
| `BatchProcessing`     | Decorator  | Batch message processing             |
| `Priority`            | Decorator  | Set handler priority                 |
| `MessageException`    | Class      | Throw from handlers                  |

### MicroserviceFactory Methods

| Method   | Return                  | Description                    |
| -------- | ----------------------- | ------------------------------ |
| `create` | `Promise<Microservice>` | Create microservice instance   |

### Microservice Methods

| Method  | Return          | Description                    |
| ------- | --------------- | ------------------------------ |
| `start` | `Promise<void>` | Start consuming messages       |
| `stop`  | `Promise<void>` | Stop consuming (graceful)      |
