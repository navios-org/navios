import { inject, InjectionToken, registerInjectable } from '@navios/di'
import { z } from 'zod/v4'

import { QueueClientToken } from '../client/queue-client-token.mjs'

import type { QueueClient } from '../client/queue-client.mjs'

import { pointToPointMessageDefinitionSchema } from './message-config.mjs'

import type { BaseMessageConfig, MessageDefinition } from './message-config.mjs'

export const queueSenderOptionsSchema = z.object({
  messageDef: pointToPointMessageDefinitionSchema,
  name: z.string().default('default'),
})

export const QueueSenderToken = InjectionToken.create<
  QueueSender<any>,
  typeof queueSenderOptionsSchema
>('QueueSender', queueSenderOptionsSchema)

/**
 * Service for sending messages to queues (point-to-point pattern).
 * This service is Injectable and can be injected with a message definition.
 *
 * @example
 * ```typescript
 * const processOrderMessage = messageBuilder.declarePointToPoint({
 *   queue: 'orders.process',
 *   payloadSchema: z.object({ orderId: z.string() }),
 * })
 *
 * @Injectable()
 * export class OrderService {
 *   private processOrder = inject(QueueSender<typeof processOrderMessage>, {
 *     format: processOrderMessage,
 *   })
 *
 *   async sendOrderForProcessing(orderId: string) {
 *     await this.processOrder.send({ orderId })
 *   }
 * }
 * ```
 */
export class QueueSender<
  MessageDef extends MessageDefinition<
    'point-to-point',
    BaseMessageConfig<'point-to-point', any>['payloadSchema']
  >,
> {
  private queueClient: QueueClient
  private messageDef: MessageDef

  constructor({ messageDef, name }: z.infer<typeof queueSenderOptionsSchema>) {
    this.queueClient = inject(QueueClientToken, { name })
    // @ts-expect-error - messageDef is a point to point message definition
    this.messageDef = messageDef
  }

  /**
   * Sends a message to the queue defined in the message definition.
   * The payload is validated against the payloadSchema before sending.
   *
   * @param payload - Message payload (validated against payloadSchema)
   */
  async send(payload: z.input<MessageDef['config']['payloadSchema']>): Promise<void> {
    // Validate payload against schema
    const validatedPayload = this.messageDef.config.payloadSchema.parse(payload)

    // Get queue from message definition
    const queue = this.messageDef.config.queue
    if (!queue) {
      throw new Error('[Navios/Queues] Queue is required for point-to-point messages')
    }

    // Send to queue
    await this.queueClient.send(queue, validatedPayload)
  }
}

registerInjectable(QueueSender, { token: QueueSenderToken })
