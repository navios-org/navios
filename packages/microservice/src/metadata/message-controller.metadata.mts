import type { ManagedMetadata } from '@navios/core'
import type { CanActivate } from '@navios/core'
import type { ClassType, ClassTypeWithInstance, InjectionToken } from '@navios/di'

import { getAllMessageHandlerMetadata } from './message-handler.metadata.mjs'

import type { MessageHandlerMetadata } from './message-handler.metadata.mjs'

export const MessageControllerMetadataKey = Symbol('MessageControllerMetadataKey')

export interface MessageControllerMetadata extends ManagedMetadata {
  handlers: Set<MessageHandlerMetadata>
  guards: Set<ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>>
  customAttributes: Map<string | symbol, any>
}

export function getMessageControllerMetadata(
  target: ClassType,
  context: ClassDecoratorContext,
): MessageControllerMetadata {
  if (context.metadata) {
    const metadata = context.metadata[MessageControllerMetadataKey] as
      | MessageControllerMetadata
      | undefined
    if (metadata) {
      return metadata
    } else {
      const handlersMetadata = getAllMessageHandlerMetadata(context)
      const newMetadata: MessageControllerMetadata = {
        handlers: handlersMetadata,
        guards: new Set<
          ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>
        >(),
        customAttributes: new Map<string | symbol, any>(),
      }
      context.metadata[MessageControllerMetadataKey] = newMetadata
      // @ts-expect-error We add a custom metadata key to the target
      target[MessageControllerMetadataKey] = newMetadata
      return newMetadata
    }
  }
  throw new Error('[Navios/Microservice] Wrong environment.')
}

export function extractMessageControllerMetadata(target: ClassType): MessageControllerMetadata {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[MessageControllerMetadataKey] as MessageControllerMetadata | undefined
  if (!metadata) {
    throw new Error(
      '[Navios/Microservice] MessageController metadata not found. Make sure to use @MessageController decorator.',
    )
  }
  return metadata
}

export function hasMessageControllerMetadata(target: ClassType): boolean {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[MessageControllerMetadataKey] as MessageControllerMetadata | undefined
  return !!metadata
}
