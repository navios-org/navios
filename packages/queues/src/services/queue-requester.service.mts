import { InjectDerived, Injectable, Token } from '@navios/di'
import { z } from 'zod/v4'

import { QueueClientToken } from '../tokens/queue-client.token.mjs'
import { requestReplyMessageConfigSchema } from '../types/message-config.mjs'

import type { QueueClient } from '../interfaces/queue-client.mjs'
import type { BaseMessageConfig, MessageDefinition } from '../types/message-config.mjs'

export const queueRequesterOptionsSchema = z.object({
  messageDef: requestReplyMessageConfigSchema,
  name: z.string().default('default'),
})

export const QueueRequesterToken = Token.create<
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
 *   @Inject(QueueRequesterToken, { messageDef: getUserMessage })
 *   private accessor getUser!: QueueRequester<typeof getUserMessage>
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
  // Keystone @InjectDerived case: derive the named QueueClient from THIS
  // host's schema-validated resolution args (`name`). Faithfully replaces the
  // v1 in-constructor `inject(QueueClientToken, { name })`; di populates this
  // accessor after the constructor and before the async `request` reader.
  // QueueClientToken is a per-`name` singleton (same `name` => shared client).
  @InjectDerived(QueueClientToken, (hostArgs: z.infer<typeof queueRequesterOptionsSchema>) => ({
    name: hostArgs.name,
  }))
  private accessor queueClient!: QueueClient

  private messageDef: MessageDef

  constructor({ messageDef }: z.infer<typeof queueRequesterOptionsSchema>) {
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
      throw new Error('[Navios/Queues] Topic is required for request/reply messages')
    }

    // Get response schema
    const responseSchema = this.messageDef.config.responseSchema
    if (!responseSchema) {
      throw new Error('[Navios/Queues] ResponseSchema is required for request/reply messages')
    }

    // Send request and wait for response
    const response = await this.queueClient.request(topic, validatedPayload)

    // Validate and return response
    return responseSchema.parse(response) as z.output<MessageDef['config']['responseSchema']>
  }
}
