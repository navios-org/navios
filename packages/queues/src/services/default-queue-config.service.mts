import { Injectable } from '@navios/di'

import type { QueueConfigService } from '../interfaces/queue-config-service.mjs'
import type { QueueConfig } from '../types/queue-config.mjs'

import { QueueConfigServiceToken } from '../tokens/queue-config-service.token.mjs'

/**
 * Default queue configuration service with lowest priority.
 * This service throws an error by default, forcing users to provide their own implementation.
 */
@Injectable({ token: QueueConfigServiceToken, priority: -1000 })
export class DefaultQueueConfigService implements QueueConfigService {
  getConfig(): QueueConfig {
    throw new Error(
      '[Navios/Queues] QueueConfigService not provided. Please implement QueueConfigService and register it with QueueConfigServiceToken.',
    )
  }
}
