import { z } from 'zod/v4'

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
    .prefault({}),
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
