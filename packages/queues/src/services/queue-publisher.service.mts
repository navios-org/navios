import { inject, Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod/v4'

import { QueueClientToken } from '../tokens/queue-client.token.mjs'
import { pubsubMessageConfigSchema } from '../types/message-config.mjs'

import type { QueueClient } from '../interfaces/queue-client.mjs'
import type { BaseMessageConfig, MessageDefinition } from '../types/message-config.mjs'

export const queuePublisherOptionsSchema = z.object({
  messageDef: pubsubMessageConfigSchema,
  name: z.string().default('default'),
})

export const QueuePublisherToken = InjectionToken.create<
  QueuePublisher<any>,
  typeof queuePublisherOptionsSchema
>('QueuePublisher', queuePublisherOptionsSchema)

/**
 * Service for publishing messages to topics (pub/sub pattern).
 * This service is Injectable and can be injected with a message definition.
 *
 * @example
 * ```typescript
 * const welcomeMessage = messageBuilder.declarePubSub({
 *   topic: 'user.welcome',
 *   payloadSchema: z.object({ name: z.string() }),
 * })
 *
 * @Injectable()
 * export class UserService {
 *   private publishWelcome = inject(QueuePublisher<typeof welcomeMessage>, {
 *     format: welcomeMessage,
 *   })
 *
 *   async sendWelcome(user: User) {
 *     await this.publishWelcome.publish({ name: user.name })
 *   }
 * }
 * ```
 */
@Injectable({ token: QueuePublisherToken })
export class QueuePublisher<
  MessageDef extends MessageDefinition<'pubsub', BaseMessageConfig<'pubsub', any>['payloadSchema']>,
> {
  private queueClient: QueueClient
  private messageDef: MessageDef

  constructor({ messageDef, name }: z.infer<typeof queuePublisherOptionsSchema>) {
    this.queueClient = inject(QueueClientToken, { name })
    // @ts-expect-error - messageDef is a pubsub message definition
    this.messageDef = messageDef
  }

  /**
   * Publishes a message to the topic defined in the message definition.
   * The payload is validated against the payloadSchema before publishing.
   *
   * @param payload - Message payload (validated against payloadSchema)
   */
  async publish(payload: z.input<MessageDef['config']['payloadSchema']>): Promise<void> {
    // Validate payload against schema
    const validatedPayload = this.messageDef.config.payloadSchema.parse(payload)

    // Get topic from message definition
    const topic = this.messageDef.config.topic
    if (!topic) {
      throw new Error('[Navios/Queues] Topic is required for pub/sub messages')
    }

    // Publish to topic
    await this.queueClient.publish(topic, validatedPayload)
  }
}
