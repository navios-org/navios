import type { z } from 'zod/v4'

import type { BaseMessageConfig } from '@navios/queues'

/**
 * Extracts the typed parameters for a message handler function.
 *
 * This utility type extracts the payload from a message definition.
 *
 * @typeParam MessageDeclaration - The message declaration from @navios/queues messageBuilder
 *
 * @example
 * ```typescript
 * const createUserMessage = messageBuilder.declarePubSub({
 *   topic: 'user.create',
 *   payloadSchema: z.object({ name: z.string(), email: z.string().email() }),
 * })
 *
 * @Message(createUserMessage)
 * async handleCreateUser(params: MessageParams<typeof createUserMessage>) {
 *   // params.payload is typed as { name: string, email: string }
 * }
 * ```
 */
export type MessageParams<
  MessageDeclaration extends {
    config: BaseMessageConfig<any, any, any>
  },
> = {
  payload: z.input<MessageDeclaration['config']['payloadSchema']>
}

/**
 * Extracts the typed return value for a message handler function.
 *
 * This utility type extracts the response schema from a message declaration
 * for request/reply patterns.
 *
 * @typeParam MessageDeclaration - The message declaration from @navios/queues messageBuilder
 *
 * @example
 * ```typescript
 * const getUserMessage = messageBuilder.declareRequestReply({
 *   topic: 'user.get',
 *   payloadSchema: z.object({ userId: z.string() }),
 *   responseSchema: z.object({ id: z.string(), name: z.string() }),
 * })
 *
 * @Message(getUserMessage)
 * async handleGetUser(params: MessageParams<typeof getUserMessage>): MessageResult<typeof getUserMessage> {
 *   return { id: '1', name: 'John' } // Type-checked against responseSchema
 * }
 * ```
 */
export type MessageResult<
  MessageDeclaration extends {
    config: BaseMessageConfig<any, any, any>
  },
> = MessageDeclaration['config']['responseSchema'] extends z.ZodType
  ? Promise<z.input<MessageDeclaration['config']['responseSchema']>>
  : Promise<void>

