import { InjectableScope, registerInjectable } from '@navios/core'
import { classMetadata, describeHandlerClass } from '@navios/core/transport'

import type { ClassType, GuardClass, InterceptorClass } from '@navios/core'
import type { HandlerClassMetadata } from '@navios/core/transport'

export interface MessageControllerOptions {
  /** Guards for every handler of the controller, after the module's. */
  guards?: GuardClass[]
  /** Interceptors around every handler of the controller, inside the module's. */
  interceptors?: InterceptorClass[]
}

export type MessageControllerMetadata = HandlerClassMetadata

const messageControllerMetadata = classMetadata<MessageControllerMetadata>(
  Symbol.for('navios.microservice.controller'),
  'a message controller',
  'MessageController',
)

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
    messageControllerMetadata.define(target, describeHandlerClass(context, options))
    registerInjectable(target, { scope: InjectableScope.Singleton })
    return target
  }
}

export function hasMessageControllerMetadata(target: ClassType): boolean {
  return messageControllerMetadata.has(target)
}

export function getMessageControllerMetadata(target: ClassType): MessageControllerMetadata {
  return messageControllerMetadata.get(target)
}
