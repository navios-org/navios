import type { FactoryContext, OnServiceDestroy, OnServiceInit } from '@navios/di'
import type { z } from 'zod/v4'

import { Factory, inject } from '@navios/di'

import type { QueueClient } from '../interfaces/queue-client.mjs'
import type { AbstractQueueConfig } from '../types/queue-config.mjs'

import { KafkaClient } from '../adapters/kafka.adapter.mjs'
import { RabbitMQClient } from '../adapters/rabbitmq.adapter.mjs'
import { SQSClient } from '../adapters/sqs.adapter.mjs'
import {
  queueClientOptionsSchema,
  QueueClientToken,
} from '../tokens/queue-client.token.mjs'
import { QueueConfigServiceToken } from '../tokens/queue-config-service.token.mjs'

type QueueClientWithLifecycle = QueueClient & OnServiceInit & OnServiceDestroy

/**
 * Factory for creating queue clients based on configuration.
 * The factory injects QueueConfigService to get the configuration,
 * then creates the appropriate client implementation.
 *
 * Since factories don't automatically call lifecycle hooks on created instances,
 * this factory manually initializes the client and registers cleanup handlers.
 */
@Factory({ token: QueueClientToken })
export class QueueClientFactory {
  private configService = inject(QueueConfigServiceToken)

  async create(
    ctx: FactoryContext,
    { name }: z.infer<typeof queueClientOptionsSchema> = { name: 'default' },
  ): Promise<QueueClient> {
    const config = this.configService.getConfig()
    if (typeof config !== 'object' || config === null || !(name in config)) {
      throw new Error(`Queue ${name} not found in config`)
    }
    // @ts-expect-error - config is a record of string to AbstractQueueConfig
    const queueConfig = config[name] as AbstractQueueConfig

    let client: QueueClientWithLifecycle

    switch (queueConfig.type) {
      case 'rabbitmq':
        client = new RabbitMQClient(queueConfig)
        break
      case 'kafka':
        client = new KafkaClient(queueConfig)
        break
      case 'sqs':
        client = new SQSClient(queueConfig)
        break
    }

    // Initialize the client
    await client.onServiceInit()

    // Register cleanup handler for when the container is disposed
    ctx.addDestroyListener(async () => {
      await client.onServiceDestroy()
    })

    return client
  }
}
