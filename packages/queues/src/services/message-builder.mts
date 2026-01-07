import type { ZodType } from 'zod/v4'

import type {
  BaseMessageConfig,
  MessageDefinition,
  MessagePattern,
} from '../types/message-config.mjs'

/**
 * Creates a new message builder instance.
 *
 * The builder allows you to declaratively define messages with type-safe
 * payload and response schemas using Zod. It supports different messaging patterns:
 * pub/sub, point-to-point, and request/reply.
 *
 * @returns A MessageBuilderInstance with methods to declare messages
 *
 * @example
 * ```ts
 * const messageBuilder = messageBuilder()
 *
 * const welcomeMessage = messageBuilder.declarePubSub({
 *   topic: 'user.welcome',
 *   payloadSchema: z.object({
 *     name: z.string(),
 *     email: z.string().email(),
 *   }),
 * })
 * ```
 */
export function messageBuilder() {
  /**
   * Declares a pub/sub message (one-to-many pattern).
   *
   * @param options - Message configuration
   * @param options.topic - Topic name to publish/subscribe to
   * @param options.payloadSchema - Zod schema for message payload validation
   * @returns A typed message definition
   */
  function declarePubSub<PayloadSchema extends ZodType>(options: {
    topic: string
    payloadSchema: PayloadSchema
  }): MessageDefinition<'pubsub', PayloadSchema> {
    return {
      config: {
        pattern: 'pubsub',
        topic: options.topic,
        payloadSchema: options.payloadSchema,
      },
    }
  }

  /**
   * Declares a point-to-point message (queue-based pattern).
   *
   * @param options - Message configuration
   * @param options.queue - Queue name to send/receive from
   * @param options.payloadSchema - Zod schema for message payload validation
   * @returns A typed message definition
   */
  function declarePointToPoint<PayloadSchema extends ZodType>(options: {
    queue: string
    payloadSchema: PayloadSchema
  }): MessageDefinition<'point-to-point', PayloadSchema> {
    return {
      config: {
        pattern: 'point-to-point',
        queue: options.queue,
        payloadSchema: options.payloadSchema,
      },
    }
  }

  /**
   * Declares a request/reply message (RPC-like pattern).
   *
   * @param options - Message configuration
   * @param options.topic - Topic name for request/reply
   * @param options.payloadSchema - Zod schema for request payload validation
   * @param options.responseSchema - Zod schema for response validation
   * @returns A typed message definition
   */
  function declareRequestReply<
    PayloadSchema extends ZodType,
    ResponseSchema extends ZodType,
  >(options: {
    topic: string
    payloadSchema: PayloadSchema
    responseSchema: ResponseSchema
  }): MessageDefinition<'request-reply', PayloadSchema, ResponseSchema> {
    return {
      config: {
        pattern: 'request-reply',
        topic: options.topic,
        payloadSchema: options.payloadSchema,
        responseSchema: options.responseSchema,
      },
    }
  }

  return {
    declarePubSub,
    declarePointToPoint,
    declareRequestReply,
  }
}
