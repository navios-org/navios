import { inject, registerFactory } from '@navios/di'
import { z } from 'zod/v4'

import type { FactoryContext } from '@navios/di'

import { KafkaClient } from './brokers/kafka/kafka-client.mjs'
import { RabbitMQClient } from './brokers/rabbitmq/rabbitmq-client.mjs'
import { SQSClient } from './brokers/sqs/sqs-client.mjs'
import { queueClientOptionsSchema, QueueClientToken } from './client/queue-client-token.mjs'
import { QueueConfigServiceToken } from './config/queue-config-service-token.mjs'
import { abstractQueueConfigSchema } from './config/queue-config.mjs'

import type { QueueClient } from './client/queue-client.mjs'
import type { AbstractQueueConfig } from './config/queue-config.mjs'

function createClient(config: AbstractQueueConfig): KafkaClient | RabbitMQClient | SQSClient {
  switch (config.type) {
    case 'rabbitmq':
      return new RabbitMQClient(config)
    case 'kafka':
      return new KafkaClient(config)
    case 'sqs':
      return new SQSClient(config)
  }
}

/**
 * Factory for creating queue clients based on configuration.
 * The factory injects QueueConfigService to get the configuration, parses the
 * entry of the requested name with `abstractQueueConfigSchema` (an invalid
 * entry rejects here) and creates the client of its broker.
 *
 * A client is the product of this factory, not a class the container
 * constructs, so the factory connects it and registers `disconnect()` as a
 * destroy listener: it runs when the client is invalidated or the container is
 * disposed.
 */
export class QueueClientFactory {
  private configService = inject(QueueConfigServiceToken)

  async create(
    ctx: FactoryContext,
    { name }: z.infer<typeof queueClientOptionsSchema> = { name: 'default' },
  ): Promise<QueueClient> {
    const config = this.configService.getConfig()
    if (!Object.hasOwn(config, name)) {
      throw new Error(`Queue ${name} not found in config`)
    }
    const parsed = abstractQueueConfigSchema.safeParse(config[name])
    if (!parsed.success) {
      throw new Error(
        `[Navios/Queues] Invalid configuration of queue ${name}:\n${z.prettifyError(parsed.error)}`,
        { cause: parsed.error },
      )
    }
    const client = createClient(parsed.data)

    await client.connect()
    ctx.addDestroyListener(() => client.disconnect())

    return client
  }
}

registerFactory(QueueClientFactory, { token: QueueClientToken })
