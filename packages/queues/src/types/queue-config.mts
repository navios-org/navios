import { z } from 'zod/v4'

/**
 * TLS/SSL configuration for secure connections
 */
export const tlsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  rejectUnauthorized: z.boolean().default(true),
  ca: z.string().optional(),
  cert: z.string().optional(),
  key: z.string().optional(),
  passphrase: z.string().optional(),
})

export type TlsConfig = z.infer<typeof tlsConfigSchema>

/**
 * Retry configuration for message processing
 */
export const retryConfigSchema = z.object({
  maxRetries: z.number().int().min(0).default(3),
  initialDelayMs: z.number().int().min(0).default(1000),
  maxDelayMs: z.number().int().min(0).default(30000),
  backoffMultiplier: z.number().min(1).default(2),
})

export type RetryConfig = z.infer<typeof retryConfigSchema>

/**
 * Dead letter queue configuration
 */
export const deadLetterConfigSchema = z.object({
  enabled: z.boolean().default(false),
  queue: z.string().optional(),
  exchange: z.string().optional(),
  maxReceiveCount: z.number().int().min(1).default(3),
})

export type DeadLetterConfig = z.infer<typeof deadLetterConfigSchema>

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
  connectionOptions: rabbitmqConnectionOptionsSchema.optional(),
  /** TLS configuration */
  tls: tlsConfigSchema.optional(),
  /** Retry configuration for message processing */
  retry: retryConfigSchema.optional(),
  /** Dead letter configuration */
  deadLetter: deadLetterConfigSchema.optional(),
  /** Exchange options */
  exchange: z
    .object({
      type: z.enum(['direct', 'topic', 'fanout', 'headers']).default('topic'),
      durable: z.boolean().default(true),
      autoDelete: z.boolean().default(false),
    })
    .optional(),
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
    .optional(),
})

export type RabbitmqConfig = z.infer<typeof rabbitmqConfigSchema>

/**
 * SASL authentication mechanisms for Kafka
 */
export const kafkaSaslConfigSchema = z.discriminatedUnion('mechanism', [
  z.object({
    mechanism: z.literal('plain'),
    username: z.string(),
    password: z.string(),
  }),
  z.object({
    mechanism: z.literal('scram-sha-256'),
    username: z.string(),
    password: z.string(),
  }),
  z.object({
    mechanism: z.literal('scram-sha-512'),
    username: z.string(),
    password: z.string(),
  }),
  z.object({
    mechanism: z.literal('aws'),
    authorizationIdentity: z.string().optional(),
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
    sessionToken: z.string().optional(),
  }),
])

export type KafkaSaslConfig = z.infer<typeof kafkaSaslConfigSchema>

/**
 * Kafka specific configuration
 */
export const kafkaConfigSchema = z.object({
  type: z.literal('kafka'),
  brokers: z.array(z.string()).min(1),
  /** Client ID for the Kafka connection */
  clientId: z.string().optional(),
  /** Connection timeout in milliseconds */
  connectionTimeout: z.number().int().min(0).default(30000),
  /** Request timeout in milliseconds */
  requestTimeout: z.number().int().min(0).default(30000),
  /** TLS/SSL configuration */
  ssl: z
    .union([
      z.boolean(),
      z.object({
        rejectUnauthorized: z.boolean().default(true),
        ca: z.string().optional(),
        cert: z.string().optional(),
        key: z.string().optional(),
      }),
    ])
    .optional(),
  /** SASL authentication */
  sasl: kafkaSaslConfigSchema.optional(),
  /** Retry configuration */
  retry: z
    .object({
      maxRetryTime: z.number().int().min(0).default(30000),
      initialRetryTime: z.number().int().min(0).default(300),
      factor: z.number().min(1).default(0.2),
      multiplier: z.number().min(1).default(2),
      retries: z.number().int().min(0).default(5),
    })
    .optional(),
  /** Consumer group configuration */
  consumer: z
    .object({
      groupId: z.string(),
      sessionTimeout: z.number().int().min(0).default(30000),
      rebalanceTimeout: z.number().int().min(0).default(60000),
      heartbeatInterval: z.number().int().min(0).default(3000),
      maxBytesPerPartition: z.number().int().min(0).default(1048576),
      minBytes: z.number().int().min(0).default(1),
      maxBytes: z.number().int().min(0).default(10485760),
      maxWaitTimeInMs: z.number().int().min(0).default(5000),
      allowAutoTopicCreation: z.boolean().default(true),
      fromBeginning: z.boolean().default(false),
    })
    .optional(),
  /** Producer configuration */
  producer: z
    .object({
      acks: z.union([z.literal(-1), z.literal(0), z.literal(1)]).default(-1),
      timeout: z.number().int().min(0).default(30000),
      compression: z
        .enum(['none', 'gzip', 'snappy', 'lz4', 'zstd'])
        .default('none'),
      maxInFlightRequests: z.number().int().min(1).default(5),
      idempotent: z.boolean().default(false),
      transactionalId: z.string().optional(),
    })
    .optional(),
})

export type KafkaConfig = z.infer<typeof kafkaConfigSchema>

/**
 * AWS SQS specific configuration
 */
export const sqsConfigSchema = z.object({
  type: z.literal('sqs'),
  region: z.string(),
  /** AWS credentials (if not using environment/IAM) */
  credentials: z
    .object({
      accessKeyId: z.string(),
      secretAccessKey: z.string(),
      sessionToken: z.string().optional(),
    })
    .optional(),
  /** Custom endpoint URL (for LocalStack, etc.) */
  endpoint: z.string().optional(),
  /** Queue URL prefix (for account ID based URLs) */
  queueUrlPrefix: z.string().optional(),
  /** Default visibility timeout in seconds */
  visibilityTimeout: z.number().int().min(0).max(43200).default(30),
  /** Wait time for long polling in seconds */
  waitTimeSeconds: z.number().int().min(0).max(20).default(20),
  /** Maximum number of messages to receive at once */
  maxNumberOfMessages: z.number().int().min(1).max(10).default(10),
  /** Message retention period in seconds */
  messageRetentionPeriod: z.number().int().min(60).max(1209600).default(345600),
  /** Delay seconds for messages */
  delaySeconds: z.number().int().min(0).max(900).default(0),
  /** Enable FIFO queue behavior */
  fifo: z
    .object({
      enabled: z.boolean().default(false),
      contentBasedDeduplication: z.boolean().default(false),
      deduplicationScope: z.enum(['messageGroup', 'queue']).default('queue'),
      throughputLimit: z.enum(['perQueue', 'perMessageGroupId']).default('perQueue'),
    })
    .optional(),
  /** Dead letter queue configuration */
  deadLetter: z
    .object({
      enabled: z.boolean().default(false),
      queueArn: z.string().optional(),
      maxReceiveCount: z.number().int().min(1).default(3),
    })
    .optional(),
  /** SNS configuration for pub/sub pattern */
  sns: z
    .object({
      region: z.string().optional(),
      endpoint: z.string().optional(),
      topicArnPrefix: z.string().optional(),
    })
    .optional(),
})

export type SqsConfig = z.infer<typeof sqsConfigSchema>

export const abstractQueueConfigSchema = z.discriminatedUnion('type', [
  rabbitmqConfigSchema,
  kafkaConfigSchema,
  sqsConfigSchema,
])

export type AbstractQueueConfig = z.infer<typeof abstractQueueConfigSchema>

export const queueConfigSchema = z
  .object({
    default: abstractQueueConfigSchema,
  })
  .or(z.record(z.string(), abstractQueueConfigSchema))
// .extend(z.record(z.string(), abstractQueueConfigSchema))

/**
 * Inferred type from queue configuration schema.
 */
export type QueueConfig = z.infer<typeof queueConfigSchema>
