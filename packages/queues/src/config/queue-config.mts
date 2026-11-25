import { z } from 'zod/v4'

import { kafkaConfigSchema } from '../brokers/kafka/kafka-config.mjs'
import { rabbitmqConfigSchema } from '../brokers/rabbitmq/rabbitmq-config.mjs'
import { sqsConfigSchema } from '../brokers/sqs/sqs-config.mjs'

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
