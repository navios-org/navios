import { InjectableScope, registerInjectable } from '@navios/core'
import { describeHandlerClass } from '@navios/core/transport'

import type { ClassType, GuardClass, InterceptorClass } from '@navios/core'
import type { HandlerClassMetadata } from '@navios/core/transport'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MessageControllerOptions {
  /** Guards for every handler of the controller, after the module's. */
  guards?: GuardClass[]
  /** Interceptors around every handler of the controller, inside the module's. */
  interceptors?: InterceptorClass[]
}

export type MessageControllerMetadata = HandlerClassMetadata

const MessageControllerMetadataKey = Symbol.for('navios.microservice.controller')

/**
 * Marks a class as a message controller: a singleton whose `@Message`
 * methods handle messages. List it in a module's `messageControllers`.
 *
 * ```ts
 * @MessageController()
 * class UsersConsumer {
 *   @Message(userCreated)
 *   async onCreated({ payload }: MessageParams<typeof userCreated>) {}
 * }
 * ```
 */
export function MessageController(options: MessageControllerOptions = {}) {
  return <T extends ClassType>(target: T, context: ClassDecoratorContext): T => {
    if (context.kind !== 'class') {
      throw new Error('[Navios] @MessageController can only be used on classes.')
    }
    Object.defineProperty(target, MessageControllerMetadataKey, {
      value: describeHandlerClass(context, options),
      configurable: true,
      enumerable: false,
    })
    registerInjectable(target, { scope: InjectableScope.Singleton })
    return target
  }
}

export function hasMessageControllerMetadata(target: ClassType): boolean {
  return Object.hasOwn(target, MessageControllerMetadataKey)
}

export function getMessageControllerMetadata(target: ClassType): MessageControllerMetadata {
  if (!hasMessageControllerMetadata(target)) {
    throw new Error(
      `[Navios] ${target.name} is not a message controller. ` +
        `Make sure it is decorated with @MessageController.`,
    )
  }
  return (target as any)[MessageControllerMetadataKey] as MessageControllerMetadata
}
