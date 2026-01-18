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
│   │   └── @Message handlers (process messages)
│   ├── Guards (authorization/validation)
│   └── Imported MessageModules
│
├── Attributes (cross-cutting concerns)
│   ├── Acknowledgment: @Ack, @NoAck, @ManualAck
│   ├── Retry: exponential backoff, max attempts
│   ├── DeadLetterQueue: failure handling
│   ├── Concurrency: prefetch, max concurrent
│   ├── Timeout: processing time limits
│   ├── Idempotency: duplicate detection
│   ├── RateLimit: throttling
│   └── Batch: batch processing
│
└── Transports (via @navios/queues)
    ├── RabbitMQ
    ├── Kafka
    └── AWS SQS/SNS
```

### Key Principles

- **Decorator-Based** - Clean API using TypeScript decorators
- **DI Integration** - Full dependency injection support
- **Type-Safe Messages** - Zod-validated message payloads via @navios/queues
- **Transport Agnostic** - Same handlers work with any queue system
- **Resilient** - Built-in retry, DLQ, and error handling

---

## Setup

### Basic Configuration

```typescript
import { MessageModule } from '@navios/microservice'
import { QueueModule, RabbitMQClient } from '@navios/queues'

@MessageModule({
  imports: [
    QueueModule.register({
      client: new RabbitMQClient({
        url: 'amqp://localhost:5672',
      }),
    }),
  ],
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

### Hybrid Mode (HTTP + Messages)

Run HTTP server and message consumer together.

```typescript
import { NaviosFactory, Module } from '@navios/core'
import { MicroserviceFactory, MessageModule } from '@navios/microservice'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

// HTTP module
@Module({
  controllers: [ApiController],
})
class HttpModule {}

// Message module
@MessageModule({
  controllers: [MessageController],
})
class MessagesModule {}

async function bootstrap() {
  // Start HTTP server
  const httpApp = await NaviosFactory.create(HttpModule, {
    adapter: defineFastifyEnvironment(),
  })
  await httpApp.listen({ port: 3000 })

  // Start message consumer
  const msApp = await MicroserviceFactory.create(MessagesModule)
  await msApp.start()
}

bootstrap()
```

---

## Message Definitions

Define type-safe messages using `@navios/queues` message builder.

### Pub/Sub Messages

One-to-many event broadcasting.

```typescript
import { messageBuilder } from '@navios/queues'
import { z } from 'zod'

// Define the message
export const UserCreatedMessage = messageBuilder.declarePubSub({
  topic: 'user.created',
  payloadSchema: z.object({
    userId: z.string().uuid(),
    email: z.string().email(),
    createdAt: z.string().datetime(),
  }),
})

export const OrderPlacedMessage = messageBuilder.declarePubSub({
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
export const ProcessPaymentMessage = messageBuilder.declarePointToPoint({
  queue: 'payments.process',
  payloadSchema: z.object({
    paymentId: z.string(),
    orderId: z.string(),
    amount: z.number(),
    currency: z.string(),
    method: z.enum(['card', 'bank', 'crypto']),
  }),
})

export const SendEmailMessage = messageBuilder.declarePointToPoint({
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
export const GetUserMessage = messageBuilder.declareRequestReply({
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

export const ValidateInventoryMessage = messageBuilder.declareRequestReply({
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

## Message Controllers

### Basic Controller

```typescript
import { Injectable, inject } from '@navios/di'
import { MessageController, Message, MessageParams } from '@navios/microservice'
import { UserCreatedMessage, OrderPlacedMessage } from './messages'

@MessageController()
@Injectable()
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
@Injectable()
class UserController {
  private userService = inject(UserService)

  @Message(GetUserMessage)
  async handleGetUser(
    params: MessageParams<typeof GetUserMessage>
  ): Promise<MessageResponse<typeof GetUserMessage>> {
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

```typescript
interface MessageParams<T extends MessageDefinition> {
  // The validated message payload
  payload: z.infer<T['payloadSchema']>

  // Message metadata
  metadata: {
    messageId: string
    correlationId?: string
    timestamp: Date
    redelivered: boolean
    attempt: number
  }

  // Raw message context (transport-specific)
  context: MessageContext

  // Manual acknowledgment (when using @ManualAck)
  ack(): Promise<void>
  nack(requeue?: boolean): Promise<void>
  reject(): Promise<void>
}
```

---

## Message Attributes

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
  async handlePayment(params: MessageParams<typeof PaymentMessage>) {
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
      multiplier: 2,    // Exponential multiplier
    },
    retryOn: [
      'PAYMENT_GATEWAY_TIMEOUT',
      'NETWORK_ERROR',
    ],
    // Don't retry these
    noRetryOn: [
      'INVALID_CARD',
      'INSUFFICIENT_FUNDS',
    ],
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
    // Override retry for DLQ'd messages
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

// Controller-level concurrency
@MessageController()
@Concurrency({ maxConcurrent: 10, prefetch: 10 })
class BulkController {
  // All handlers in this controller share concurrency limit
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
    // Extract idempotency key from payload
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
import { Message, Batch, BatchParams } from '@navios/microservice'

@MessageController()
class AnalyticsController {
  @Message(TrackEventMessage)
  @Batch({
    size: 100,        // Process 100 at a time
    timeout: 5000,    // Or after 5 seconds
    flushOnError: true,
  })
  async trackEvents(params: BatchParams<typeof TrackEventMessage>) {
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

@Injectable()
class TenantGuard implements MessageGuard {
  async canActivate(context: MessageExecutionContext): Promise<boolean> {
    const payload = context.getPayload()
    const user = context.getUser()

    // Ensure user can access this tenant's data
    return user.tenantId === payload.tenantId
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
@MessageController()
@UseGuards(TenantGuard)
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

Send messages from any service.

### Using QueuePublisher

```typescript
import { Injectable, inject } from '@navios/di'
import { QueuePublisher, QueueSender } from '@navios/queues'
import { UserCreatedMessage, SendEmailMessage } from './messages'

@Injectable()
class UserService {
  // For pub/sub messages
  private userPublisher = inject(QueuePublisher<typeof UserCreatedMessage>)

  // For point-to-point messages
  private emailSender = inject(QueueSender<typeof SendEmailMessage>)

  async createUser(data: CreateUserDto) {
    const user = await this.db.users.create({ data })

    // Publish event (fan-out to all subscribers)
    await this.userPublisher.publish(UserCreatedMessage, {
      userId: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    })

    // Send to specific queue
    await this.emailSender.send(SendEmailMessage, {
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
  private userRequester = inject(QueueRequester<typeof GetUserMessage>)
  private inventoryRequester = inject(QueueRequester<typeof ValidateInventoryMessage>)

  async placeOrder(userId: string, items: OrderItem[]) {
    // Request user data from user service
    const user = await this.userRequester.request(GetUserMessage, {
      userId,
    }, {
      timeout: 5000,
    })

    // Validate inventory
    const inventory = await this.inventoryRequester.request(
      ValidateInventoryMessage,
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
          retryable: false, // Don't retry
          sendToDlq: true,  // Send to DLQ
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
import { MicroserviceFactory, OnMessageError } from '@navios/microservice'

@Injectable()
class ErrorHandler implements OnMessageError {
  private alerting = inject(AlertingService)
  private logger = inject(Logger)

  async handleError(error: Error, context: MessageExecutionContext) {
    this.logger.error('Message processing failed', {
      error: error.message,
      messageId: context.getMetadata().messageId,
      handler: context.getHandler(),
    })

    if (error instanceof CriticalError) {
      await this.alerting.sendAlert({
        severity: 'critical',
        message: error.message,
      })
    }
  }
}

// Register in module
@MessageModule({
  controllers: [OrderController],
  errorHandler: ErrorHandler,
})
class AppModule {}
```

---

## Lifecycle Hooks

### Module Lifecycle

```typescript
import { MessageModule, OnModuleInit, OnModuleDestroy } from '@navios/microservice'
import { inject } from '@navios/di'

@MessageModule({
  controllers: [OrderController],
})
class AppModule implements OnModuleInit, OnModuleDestroy {
  private cache = inject(CacheService)

  async onModuleInit() {
    // Called before starting message consumption
    await this.cache.warmup()
    console.log('Microservice module initialized')
  }

  async onModuleDestroy() {
    // Called during graceful shutdown
    await this.cache.flush()
    console.log('Microservice module destroyed')
  }
}
```

### Message Lifecycle

```typescript
import {
  MessageController,
  Message,
  BeforeMessage,
  AfterMessage,
} from '@navios/microservice'

@MessageController()
class OrderController {
  @BeforeMessage()
  async beforeAnyMessage(context: MessageExecutionContext) {
    console.log(`Processing message: ${context.getMetadata().messageId}`)
  }

  @AfterMessage()
  async afterAnyMessage(context: MessageExecutionContext, result: unknown) {
    console.log(`Message processed: ${context.getMetadata().messageId}`)
  }

  @Message(OrderPlacedMessage)
  async handleOrder(params: MessageParams<typeof OrderPlacedMessage>) {
    // Handler logic
  }
}
```

---

## Testing

### Unit Testing Handlers

```typescript
import { TestContainer } from '@navios/di/testing'
import { MockQueueClient } from '@navios/queues/testing'
import { describe, it, expect, vi } from 'vitest'

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

  it('should process order and send confirmation', async () => {
    const emailService = container.get(EmailService)

    await controller.handleOrder({
      payload: {
        orderId: '123',
        userId: 'user-1',
        items: [{ productId: 'prod-1', quantity: 2, price: 10 }],
        total: 20,
      },
      metadata: {
        messageId: 'msg-1',
        timestamp: new Date(),
        redelivered: false,
        attempt: 1,
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

### Integration Testing

```typescript
import { MicroserviceFactory } from '@navios/microservice'
import { MockQueueClient, TestQueueModule } from '@navios/queues/testing'

describe('Order Processing', () => {
  let app: Microservice
  let mockClient: MockQueueClient

  beforeEach(async () => {
    mockClient = new MockQueueClient()

    @MessageModule({
      imports: [TestQueueModule.withClient(mockClient)],
      controllers: [OrderController],
    })
    class TestModule {}

    app = await MicroserviceFactory.create(TestModule)
    await app.start()
  })

  afterEach(async () => {
    await app.stop()
  })

  it('should process order message', async () => {
    // Simulate incoming message
    await mockClient.simulateMessage(OrderPlacedMessage, {
      orderId: '123',
      userId: 'user-1',
      items: [],
      total: 100,
    })

    // Wait for processing
    await mockClient.waitForAck()

    // Assert side effects
    // ...
  })
})
```

---

## Complete Example

```typescript
// messages/order.messages.ts
import { messageBuilder } from '@navios/queues'
import { z } from 'zod'

export const OrderPlacedMessage = messageBuilder.declarePubSub({
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

export const ProcessPaymentMessage = messageBuilder.declarePointToPoint({
  queue: 'payments.process',
  payloadSchema: z.object({
    orderId: z.string(),
    amount: z.number(),
    paymentMethod: z.string(),
  }),
})

export const SendNotificationMessage = messageBuilder.declarePointToPoint({
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
import { Injectable, inject } from '@navios/di'
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
@Injectable()
class OrderController {
  private db = inject(DatabaseService)
  private paymentSender = inject(QueueSender<typeof ProcessPaymentMessage>)
  private notificationSender = inject(QueueSender<typeof SendNotificationMessage>)

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
    await this.paymentSender.send(ProcessPaymentMessage, {
      orderId,
      amount: total,
      paymentMethod: 'card', // Would come from order data
    })

    // Send confirmation notification
    await this.notificationSender.send(SendNotificationMessage, {
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
import { QueuePublisher } from '@navios/queues'
import { ProcessPaymentMessage } from '../messages/order.messages'

@MessageController()
@Injectable()
class PaymentController {
  private paymentGateway = inject(PaymentGateway)
  private db = inject(DatabaseService)

  @Message(ProcessPaymentMessage)
  @ManualAck()
  @Timeout({ duration: 30000, strategy: 'dlq' })
  async processPayment(params: MessageParams<typeof ProcessPaymentMessage>) {
    const { orderId, amount, paymentMethod } = params.payload

    try {
      // Process with external gateway
      const result = await this.paymentGateway.charge({
        amount,
        method: paymentMethod,
      })

      // Update order status
      await this.db.orders.update({
        where: { id: orderId },
        data: { status: 'paid', paymentId: result.id },
      })

      // Acknowledge success
      await params.ack()
    } catch (error) {
      if (isRetryableError(error)) {
        // Requeue for retry
        await params.nack(true)
      } else {
        // Mark order as failed and reject message
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
import { MessageModule, OnModuleInit, OnModuleDestroy } from '@navios/microservice'
import { QueueModule, RabbitMQClient } from '@navios/queues'
import { inject } from '@navios/di'

@MessageModule({
  imports: [
    QueueModule.register({
      client: new RabbitMQClient({
        url: process.env.RABBITMQ_URL ?? 'amqp://localhost:5672',
      }),
    }),
  ],
  controllers: [OrderController, PaymentController, NotificationController],
})
class AppMessageModule implements OnModuleInit, OnModuleDestroy {
  private logger = inject(Logger)

  async onModuleInit() {
    this.logger.info('Microservice starting...')
  }

  async onModuleDestroy() {
    this.logger.info('Microservice shutting down...')
  }
}
```

```typescript
// main.ts
import { MicroserviceFactory } from '@navios/microservice'
import { AppMessageModule } from './modules/app.module'

async function bootstrap() {
  const app = await MicroserviceFactory.create(AppMessageModule, {
    logger: true,
  })

  await app.start()
  console.log('Microservice is running')

  // Graceful shutdown
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
| `Message`             | Decorator  | Define message handler               |
| `UseGuards`           | Decorator  | Apply guards to handler              |
| `Ack`                 | Decorator  | Auto-acknowledge on success          |
| `NoAck`               | Decorator  | No acknowledgment                    |
| `ManualAck`           | Decorator  | Manual acknowledgment                |
| `Retry`               | Decorator  | Configure retry behavior             |
| `DeadLetterQueue`     | Decorator  | Configure DLQ                        |
| `Concurrency`         | Decorator  | Limit concurrent processing          |
| `Timeout`             | Decorator  | Set processing timeout               |
| `Idempotency`         | Decorator  | Prevent duplicate processing         |
| `RateLimit`           | Decorator  | Throttle message processing          |
| `Batch`               | Decorator  | Batch message processing             |
| `Priority`            | Decorator  | Set handler priority                 |
| `MessageException`    | Class      | Throw from handlers                  |

### MicroserviceFactory Methods

| Method   | Return             | Description                    |
| -------- | ------------------ | ------------------------------ |
| `create` | `Promise<Microservice>` | Create microservice instance |

### Microservice Methods

| Method   | Return           | Description                    |
| -------- | ---------------- | ------------------------------ |
| `start`  | `Promise<void>`  | Start consuming messages       |
| `stop`   | `Promise<void>`  | Stop consuming (graceful)      |

### Configuration Options

| Property       | Type           | Description                    |
| -------------- | -------------- | ------------------------------ |
| `imports`      | `Module[]`     | Import modules (QueueModule)   |
| `controllers`  | `Class[]`      | Message controllers            |
| `guards`       | `Guard[]`      | Module-level guards            |
| `errorHandler` | `Class`        | Global error handler           |
