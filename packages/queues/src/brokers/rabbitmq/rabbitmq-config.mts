import { z } from 'zod/v4'

import { deadLetterConfigSchema, retryConfigSchema, tlsConfigSchema } from '../common-config.mjs'

/**
 * RabbitMQ connection options
 */
export const rabbitmqConnectionOptionsSchema = z.object({
  /** Connection timeout in milliseconds */
  timeout: z.number().int().min(0).default(30000),
  /** Enable TCP keep-alive */
  keepAlive: z.boolean().default(true),
  /** Delay in milliseconds before sending keep-alive probes */
  keepAliveDelay: z.number().int().min(0).default(10000),
  /** Disable Nagle's algorithm (enable for low-latency) */
  noDelay: z.boolean().default(false),
  /** Client properties sent to the broker */
  clientProperties: z
    .object({
      product: z.string().optional(),
      version: z.string().optional(),
      platform: z.string().optional(),
      copyright: z.string().optional(),
      information: z.string().optional(),
    })
    .passthrough()
    .optional(),
})

export type RabbitmqConnectionOptions = z.infer<typeof rabbitmqConnectionOptionsSchema>

/**
 * RabbitMQ specific configuration
 */
export const rabbitmqConfigSchema = z.object({
  type: z.literal('rabbitmq'),
  url: z.string(),
  /** Virtual host */
  vhost: z.string().default('/'),
  /** Heartbeat interval in seconds (sent to broker) */
  heartbeatIntervalInSeconds: z.number().int().min(0).default(5),
  /** Time to wait before trying to reconnect in seconds */
  reconnectTimeInSeconds: z.number().int().min(0).optional(),
  /** Channel prefetch count for consumer */
  prefetch: z.number().int().min(1).default(10),
  /** Connection options */
  connectionOptions: rabbitmqConnectionOptionsSchema.prefault({}),
  /** TLS configuration */
  tls: tlsConfigSchema.optional(),
  /** Retry configuration for message processing */
  retry: retryConfigSchema.prefault({}),
  /** Dead letter configuration */
  deadLetter: deadLetterConfigSchema.optional(),
  /** Exchange options */
  exchange: z
    .object({
      type: z.enum(['direct', 'topic', 'fanout', 'headers']).default('topic'),
      durable: z.boolean().default(true),
      autoDelete: z.boolean().default(false),
    })
    .prefault({}),
  /** Queue options */
  queue: z
    .object({
      durable: z.boolean().default(true),
      autoDelete: z.boolean().default(false),
      exclusive: z.boolean().default(false),
      messageTtl: z.number().int().min(0).optional(),
      maxLength: z.number().int().min(0).optional(),
      maxPriority: z.number().int().min(0).max(255).optional(),
    })
    .prefault({}),
})

/** A parsed RabbitMQ entry: the defaults are set, and so are the option objects. */
export type RabbitmqConfig = z.infer<typeof rabbitmqConfigSchema>
