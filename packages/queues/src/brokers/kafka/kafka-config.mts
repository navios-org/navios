import { z } from 'zod/v4'

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
      compression: z.enum(['none', 'gzip', 'snappy', 'lz4', 'zstd']).default('none'),
      maxInFlightRequests: z.number().int().min(1).default(5),
      idempotent: z.boolean().default(false),
      transactionalId: z.string().optional(),
    })
    .optional(),
})

export type KafkaConfig = z.infer<typeof kafkaConfigSchema>
