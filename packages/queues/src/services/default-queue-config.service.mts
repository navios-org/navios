import { registerInjectable } from '@navios/di'

import { QueueConfigServiceToken } from '../tokens/queue-config-service.token.mjs'

import type { QueueConfigService } from '../interfaces/queue-config-service.mjs'
import type { QueueConfig } from '../types/queue-config.mjs'

/**
 * Default queue configuration service with lowest priority.
 * This service throws an error by default, forcing users to provide their own implementation.
 */
export class DefaultQueueConfigService implements QueueConfigService {
  getConfig(): QueueConfig {
    throw new Error(
      '[Navios/Queues] QueueConfigService not provided. Implement QueueConfigService and bind it with provide(QueueConfigServiceToken, YourConfigService) in the application, module or container providers.',
    )
  }
}

registerInjectable(DefaultQueueConfigService, { token: QueueConfigServiceToken })
