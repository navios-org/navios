import { InjectionToken } from '@navios/di'
import { z } from 'zod/v4'

import type { QueueClient } from './queue-client.mjs'

export const queueClientOptionsSchema = z
  .object({
    name: z.string().default('default'),
  })
  // Normalise "no arguments" to the default name: the container keys instances
  // by the validated arguments, so `inject(QueueClientToken)` and
  // `inject(QueueClientToken, { name: 'default' })` share one client.
  .default({ name: 'default' })
/**
 * Injection token for QueueClient.
 * The QueueClientFactory registers the created client with this token.
 */
export const QueueClientToken = InjectionToken.create<QueueClient, typeof queueClientOptionsSchema>(
  'QueueClient',
  queueClientOptionsSchema,
)
