import { InjectableScope, registerInjectable } from '@navios/core'
import {
  classAttributes,
  classGuards,
  classInterceptors,
  MembersKey,
  prepend,
  requireMetadata,
} from '@navios/core/transport'

import type { ClassType } from '@navios/core'
import type { DecoratorMetadata, MethodHandlerMetadata } from '@navios/core/transport'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MessageControllerOptions {
  /** Guards for every handler of the controller, after the module's. */
  guards?: ClassType[]
  /** Interceptors around every handler of the controller, inside the module's. */
  interceptors?: ClassType[]
}

export interface MessageControllerMetadata {
  guards: ClassType[]
  interceptors: ClassType[]
  attributes: Map<symbol, unknown>
  /** The members decorators were applied to, by name. */
  members: Map<string, MethodHandlerMetadata>
}

const MessageControllerMetadataKey = Symbol.for('navios.microservice.controller')

function defineMetadata(
  target: ClassType,
  context: { metadata?: DecoratorMetadata },
  options: MessageControllerOptions,
): void {
  const metadata = requireMetadata(context)
  const controller: MessageControllerMetadata = {
    // The live lists: @UseGuards / @UseInterceptors placed above this
    // decorator run after it and must still be seen.
    guards: prepend(classGuards(context), options.guards),
    interceptors: prepend(classInterceptors(context), options.interceptors),
    attributes: classAttributes(context),
    members: (metadata[MembersKey] as Map<string, MethodHandlerMetadata> | undefined) ?? new Map(),
  }
  Object.defineProperty(target, MessageControllerMetadataKey, {
    value: controller,
    configurable: true,
    enumerable: false,
  })
}

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
    defineMetadata(target, context, options)
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
