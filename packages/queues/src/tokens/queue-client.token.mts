import { InjectionToken } from '@navios/di'
import { z } from 'zod/v4'

import type { QueueClient } from '../interfaces/queue-client.mjs'

export const queueClientOptionsSchema = z
  .object({
    name: z.string().default('default'),
  })
  .optional()
/**
 * Injection token for QueueClient.
 * The QueueClientFactory registers the created client with this token.
 */
export const QueueClientToken = InjectionToken.create<QueueClient, typeof queueClientOptionsSchema>(
  'QueueClient',
  queueClientOptionsSchema,
)
