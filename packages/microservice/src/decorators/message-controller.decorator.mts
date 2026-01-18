import { NaviosManagedMetadataKey } from '@navios/core'
import { Injectable, InjectionToken, Registry } from '@navios/di'

import type { ClassType, InjectableScope } from '@navios/di'

import { getMessageControllerMetadata } from '../metadata/message-controller.metadata.mjs'

/**
 * Options for configuring a Navios message controller.
 */
export interface MessageControllerOptions {
  /**
   * Guards to apply to all message handlers in this controller.
   * Guards are executed in reverse order (last guard first).
   */
  guards?: ClassType[] | Set<ClassType>
  /**
   * Registry to use for the controller.
   * Registry is used to store the controller and its handlers.
   */
  registry?: Registry
  /**
   * Priority to use for the controller.
   * Priority is used to sort the controller in the registry.
   */
  priority?: number
  /**
   * Scope to use for the controller.
   * Scope is used to determine the scope of the controller.
   */
  scope?: InjectableScope
}

/**
 * Decorator that marks a class as a Navios message controller.
 *
 * Message controllers handle messages from queues and define message handlers.
 * They are request-scoped by default, meaning a new instance is created for each message.
 *
 * @param options - Message controller configuration options
 * @returns A class decorator
 *
 * @example
 * ```typescript
 * @MessageController({ guards: [AuthGuard] })
 * export class UserMessageController {
 *   @Message(createUserMessage)
 *   async handleCreateUser(params: MessageParams<typeof createUserMessage>) {
 *     // Handle message
 *   }
 * }
 * ```
 */
export function MessageController({
  guards,
  registry,
  priority,
  scope,
}: MessageControllerOptions = {}) {
  return function (target: ClassType, context: ClassDecoratorContext) {
    if (context.kind !== 'class') {
      throw new Error(
        '[Navios/Microservice] @MessageController decorator can only be used on classes.',
      )
    }
    const token = InjectionToken.create(target)
    if (context.metadata) {
      const messageControllerMetadata = getMessageControllerMetadata(target, context)
      if (guards) {
        for (const guard of Array.from(guards).reverse()) {
          messageControllerMetadata.guards.add(guard)
        }
      }
      // Store reference to metadata in managed key for AttributeFactory
      context.metadata[NaviosManagedMetadataKey] = messageControllerMetadata
      // Also store on target for runtime access
      // @ts-expect-error
      target[NaviosManagedMetadataKey] = messageControllerMetadata
    }
    return Injectable({
      token,
      registry,
      priority,
      scope,
    })(target, context)
  }
}
