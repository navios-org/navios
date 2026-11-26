import { z } from 'zod/v4'

import { kafkaConfigSchema } from '../brokers/kafka/kafka-config.mjs'
import { rabbitmqConfigSchema } from '../brokers/rabbitmq/rabbitmq-config.mjs'
import { sqsConfigSchema } from '../brokers/sqs/sqs-config.mjs'

/** The configuration of one queue, told apart by `type`. */
export const abstractQueueConfigSchema = z.discriminatedUnion('type', [
  rabbitmqConfigSchema,
  kafkaConfigSchema,
  sqsConfigSchema,
])

/** A parsed queue entry: every default of its broker schema is set. */
export type AbstractQueueConfig = z.output<typeof abstractQueueConfigSchema>

/**
 * The queues by name, as `QueueConfigService.getConfig()` returns them.
 * `QueueClientFactory` parses an entry with `abstractQueueConfigSchema` when
 * its client is first resolved, so an entry may leave out what has a default.
 */
export type QueueConfig = Record<string, z.input<typeof abstractQueueConfigSchema>>
