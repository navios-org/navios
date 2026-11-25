import { memberMetadata } from '@navios/core/transport'

import type { MethodHandlerMetadata } from '@navios/core/transport'
import type { BaseMessageConfig } from '@navios/queues'

import type { MessageParams, MessageResult } from './message-params.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Where `@Message` keeps a member's message declaration among its entries. */
const MessageEntryKey = Symbol.for('navios.microservice.message')

type AnyDeclaration = { config: BaseMessageConfig<any, any, any> }

/**
 * Makes a method of a message controller the handler of a message declared
 * with `messageBuilder()`.
 *
 * ```ts
 * @Message(userCreated)
 * async onCreated({ payload }: MessageParams<typeof userCreated>) {}
 * ```
 */
export function Message<Declaration extends AnyDeclaration>(message: Declaration) {
  return (
    _target: (
      params: MessageParams<Declaration>,
      ...rest: any[]
    ) => MessageResult<Declaration> | Awaited<MessageResult<Declaration>> | Promise<void> | void,
    context: ClassMethodDecoratorContext,
  ): void => {
    if (context.kind !== 'method') {
      throw new Error('[Navios] @Message can only be used on methods.')
    }
    if (typeof context.name !== 'string') {
      throw new Error('[Navios] @Message cannot be used on symbol-named methods.')
    }
    const member = memberMetadata(context, context.name)
    const existing = memberMessage(member)
    if (existing !== null && existing !== message.config) {
      throw new Error(
        `[Navios] ${context.name} already handles ${existing.pattern} ` +
          `${messageDestination(existing)}; a method can handle one message.`,
      )
    }
    member.entries.set(MessageEntryKey, message.config)
  }
}

/** The message a member handles, or `null` when it is not a message handler. */
export function memberMessage(member: MethodHandlerMetadata): BaseMessageConfig | null {
  return (member.entries.get(MessageEntryKey) as BaseMessageConfig | undefined) ?? null
}

/** The topic or queue a message travels on. */
export function messageDestination(config: BaseMessageConfig<any, any, any>): string {
  return (config.pattern === 'point-to-point' ? config.queue : config.topic) ?? ''
}
