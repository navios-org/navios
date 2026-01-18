import type { QueueConfig } from '../types/queue-config.mjs'

/**
 * Service interface for providing queue configuration.
 * Users must implement this service and register it with QueueConfigServiceToken.
 */
export interface QueueConfigService {
  /**
   * Returns the queue configuration.
   *
   * @returns Queue configuration object
   */
  getConfig(): QueueConfig
}
