import type { z, ZodType } from 'zod/v4'

import type { BaseMessageConfig } from '@navios/queues'

import { getMessageHandlerMetadata } from '../metadata/message-handler.metadata.mjs'

/**
 * Decorator that marks a method as a message handler.
 *
 * The message must be defined using @navios/queues messageBuilder helper methods.
 * This ensures type safety and consistency between message publishers and handlers.
 *
 * @param message - The message definition from @navios/queues messageBuilder
 * @returns A method decorator
 *
 * @example
 * ```typescript
 * import { messageBuilder } from '@navios/queues'
 *
 * const createUserMessage = messageBuilder.declarePubSub({
 *   topic: 'user.create',
 *   payloadSchema: z.object({ name: z.string(), email: z.string().email() }),
 * })
 *
 * @MessageController()
 * export class UserMessageController {
 *   @Message(createUserMessage)
 *   async handleCreateUser(params: MessageParams<typeof createUserMessage>) {
 *     const { payload } = params
 *     // Handle message
 *   }
 * }
 * ```
 */
export function Message<
  Pattern extends 'pubsub' | 'point-to-point' | 'request-reply' = any,
  PayloadSchema extends ZodType = ZodType,
  ResponseSchema extends ZodType = ZodType,
>(message: {
  config: BaseMessageConfig<Pattern, PayloadSchema, ResponseSchema>
}) {
  return (
    target: (
      params: { payload: z.input<PayloadSchema> },
    ) => Promise<z.input<ResponseSchema> | void> | z.input<ResponseSchema> | void,
    context: ClassMethodDecoratorContext,
  ) => {
    if (context.kind !== 'method') {
      throw new Error(
        '[Navios/Microservice] Message decorator can only be used on methods.',
      )
    }
    const config = message.config
    if (context.metadata) {
      let handlerMetadata = getMessageHandlerMetadata<BaseMessageConfig>(
        target,
        context,
      )
      if (handlerMetadata.config && handlerMetadata.config.pattern) {
        throw new Error(
          `[Navios/Microservice] Message handler ${config.pattern} ${config.topic || config.queue} already exists. Please use a different message definition.`,
        )
      }
      // @ts-expect-error We don't need to set correctly in the metadata
      handlerMetadata.config = config
      handlerMetadata.classMethod = target.name
    }
    return target
  }
}

