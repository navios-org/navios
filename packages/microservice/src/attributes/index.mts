import { AttributeFactory } from '@navios/core'
import { z } from 'zod/v4'

// 1. Message Acknowledgment
export const Ack = AttributeFactory.createAttribute(Symbol('Ack'))
export const NoAck = AttributeFactory.createAttribute(Symbol('NoAck'))
export const ManualAck = AttributeFactory.createAttribute(Symbol('ManualAck'))

// 2. Retry Configuration
const RetrySchema = z.object({
  maxAttempts: z.number().min(1).default(3),
  backoff: z.enum(['exponential', 'linear', 'fixed']).default('exponential'),
  initialDelay: z.number().min(0).default(1000), // milliseconds
  maxDelay: z.number().min(0).optional(),
  multiplier: z.number().min(1).default(2),
})
export const Retry = AttributeFactory.createAttribute(Symbol('Retry'), RetrySchema)

// 3. Dead Letter Queue
const DeadLetterQueueSchema = z.object({
  queue: z.string(),
  maxRetries: z.number().min(0).optional(), // Override retry maxAttempts if set
})
export const DeadLetterQueue = AttributeFactory.createAttribute(
  Symbol('DeadLetterQueue'),
  DeadLetterQueueSchema,
)

// 4. Concurrency
const ConcurrencySchema = z.object({
  maxConcurrent: z.number().min(1).default(1),
  prefetch: z.number().min(1).optional(), // For queue-based systems
})
export const Concurrency = AttributeFactory.createAttribute(
  Symbol('Concurrency'),
  ConcurrencySchema,
)

// 5. Timeout
const TimeoutSchema = z.object({
  timeout: z.number().min(0), // milliseconds
  onTimeout: z.enum(['fail', 'retry', 'dlq']).default('fail'),
})
export const Timeout = AttributeFactory.createAttribute(Symbol('Timeout'), TimeoutSchema)

// 6. Error Handling Strategy
const ErrorHandlingSchema = z.object({
  strategy: z.enum(['retry', 'dlq', 'ignore', 'fail']).default('fail'),
  maxRetries: z.number().min(0).optional(),
  dlq: z.string().optional(), // Dead letter queue name
})
export const ErrorHandling = AttributeFactory.createAttribute(
  Symbol('ErrorHandling'),
  ErrorHandlingSchema,
)

// 7. Idempotency
const IdempotencySchema = z.object({
  enabled: z.boolean().default(true),
  keyField: z.string().optional(), // Field in payload to use as idempotency key
  ttl: z.number().min(0).optional(), // TTL for idempotency cache (seconds)
})
export const Idempotency = AttributeFactory.createAttribute(
  Symbol('Idempotency'),
  IdempotencySchema,
)

// 8. Rate Limiting
const RateLimitSchema = z.object({
  maxMessages: z.number().min(1),
  window: z.number().min(1), // milliseconds
  strategy: z.enum(['drop', 'queue', 'fail']).default('queue'),
})
export const RateLimit = AttributeFactory.createAttribute(Symbol('RateLimit'), RateLimitSchema)

// 9. Batch Processing
const BatchProcessingSchema = z.object({
  batchSize: z.number().min(1).default(10),
  timeout: z.number().min(0).optional(), // Max wait time for batch (ms)
  flushOnError: z.boolean().default(false),
})
export const BatchProcessing = AttributeFactory.createAttribute(
  Symbol('BatchProcessing'),
  BatchProcessingSchema,
)

// 10. Message Priority
const PrioritySchema = z.object({
  priority: z.number().min(0).max(10).default(5),
})
export const Priority = AttributeFactory.createAttribute(Symbol('Priority'), PrioritySchema)
