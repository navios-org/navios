import { InjectDerived, Injectable, Token } from '@navios/di'
import { z } from 'zod/v4'

import { QueueClientToken } from '../tokens/queue-client.token.mjs'
import { pointToPointMessageConfigSchema } from '../types/message-config.mjs'

import type { QueueClient } from '../interfaces/queue-client.mjs'
import type { BaseMessageConfig, MessageDefinition } from '../types/message-config.mjs'

export const queueSenderOptionsSchema = z.object({
  messageDef: pointToPointMessageConfigSchema,
  name: z.string().default('default'),
})

export const QueueSenderToken = Token.create<
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
 *   @Inject(QueueSenderToken, { messageDef: processOrderMessage })
 *   private accessor processOrder!: QueueSender<typeof processOrderMessage>
 *
 *   async sendOrderForProcessing(orderId: string) {
 *     await this.processOrder.send({ orderId })
 *   }
 * }
 * ```
 */
@Injectable({ token: QueueSenderToken })
export class QueueSender<
  MessageDef extends MessageDefinition<
    'point-to-point',
    BaseMessageConfig<'point-to-point', any>['payloadSchema']
  >,
> {
  @InjectDerived(QueueClientToken, (hostArgs: z.infer<typeof queueSenderOptionsSchema>) => ({
    name: hostArgs.name,
  }))
  private accessor queueClient!: QueueClient

  private messageDef: MessageDef

  constructor({ messageDef }: z.infer<typeof queueSenderOptionsSchema>) {
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
