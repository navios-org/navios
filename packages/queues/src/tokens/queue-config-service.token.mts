import { InjectionToken } from '@navios/di'

import type { QueueConfigService } from '../interfaces/queue-config-service.mjs'

/**
 * Injection token for QueueConfigService.
 * Users should implement QueueConfigService and register it with this token.
 */
export const QueueConfigServiceToken = InjectionToken.create<QueueConfigService>(
  'QueueConfigService',
)

