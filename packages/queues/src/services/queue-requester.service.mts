import { inject, Injectable, InjectionToken } from '@navios/di'

import { z } from 'zod/v4'

import type { QueueClient } from '../interfaces/queue-client.mjs'
import type {
  BaseMessageConfig,
  MessageDefinition,
} from '../types/message-config.mjs'

import { QueueClientToken } from '../tokens/queue-client.token.mjs'
import { requestReplyMessageConfigSchema } from '../types/message-config.mjs'

export const queueRequesterOptionsSchema = z.object({
  messageDef: requestReplyMessageConfigSchema,
  name: z.string().default('default'),
})

export const QueueRequesterToken = InjectionToken.create<
  QueueRequester<any>,
  typeof queueRequesterOptionsSchema
>('QueueRequester', queueRequesterOptionsSchema)

/**
 * Service for sending requests and receiving replies (request/reply pattern).
 * This service is Injectable and can be injected with a message definition.
 *
 * @example
 * ```typescript
 * const getUserMessage = messageBuilder.declareRequestReply({
 *   topic: 'user.get',
 *   payloadSchema: z.object({ userId: z.string() }),
 *   responseSchema: z.object({ id: z.string(), name: z.string() }),
 * })
 *
 * @Injectable()
 * export class UserService {
 *   private getUser = inject(QueueRequester<typeof getUserMessage>, {
 *     format: getUserMessage,
 *   })
 *
 *   async fetchUser(userId: string) {
 *     const user = await this.getUser.request({ userId })
 *     // user is typed as { id: string, name: string }
 *   }
 * }
 * ```
 */
@Injectable({ token: QueueRequesterToken })
export class QueueRequester<
  MessageDef extends MessageDefinition<
    'request-reply',
    BaseMessageConfig<'request-reply', any, any>['payloadSchema'],
    BaseMessageConfig<'request-reply', any, any>['responseSchema']
  >,
> {
  private queueClient: QueueClient
  private messageDef: MessageDef

  constructor({
    messageDef,
    name,
  }: z.infer<typeof queueRequesterOptionsSchema>) {
    this.queueClient = inject(QueueClientToken, { name })
    // @ts-expect-error - messageDef is a request reply message definition
    this.messageDef = messageDef
  }

  /**
   * Sends a request and waits for a reply.
   * The payload is validated against the payloadSchema before sending,
   * and the response is validated against the responseSchema before returning.
   *
   * @param payload - Request payload (validated against payloadSchema)
   * @returns Response payload (validated against responseSchema)
   */
  async request(
    payload: z.input<MessageDef['config']['payloadSchema']>,
  ): Promise<z.output<MessageDef['config']['responseSchema']>> {
    // Validate payload against schema
    const validatedPayload = this.messageDef.config.payloadSchema.parse(payload)

    // Get topic from message definition
    const topic = this.messageDef.config.topic
    if (!topic) {
      throw new Error(
        '[Navios/Queues] Topic is required for request/reply messages',
      )
    }

    // Get response schema
    const responseSchema = this.messageDef.config.responseSchema
    if (!responseSchema) {
      throw new Error(
        '[Navios/Queues] ResponseSchema is required for request/reply messages',
      )
    }

    // Send request and wait for response
    const response = await this.queueClient.request(topic, validatedPayload)

    // Validate and return response
    return responseSchema.parse(response) as z.output<
      MessageDef['config']['responseSchema']
    >
  }
}
