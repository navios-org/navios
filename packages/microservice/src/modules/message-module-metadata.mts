import type { ClassType, ClassTypeWithInstance, InjectionToken } from '@navios/di'

import type { MessageMetadata } from '../attributes/message-metadata.mjs'
import type { MessageGuard } from '../guards/message-guard.mjs'

export const MessageModuleMetadataKey = Symbol('MessageModuleMetadataKey')

export interface MessageModuleMetadata extends MessageMetadata {
  controllers: Set<ClassType>
  imports: Set<ClassType>
  guards: Set<ClassTypeWithInstance<MessageGuard> | InjectionToken<MessageGuard, undefined>>
  customAttributes: Map<string | symbol, any>
}

export function getMessageModuleMetadata(
  target: ClassType,
  context: ClassDecoratorContext,
): MessageModuleMetadata {
  if (context.metadata) {
    const metadata = context.metadata[MessageModuleMetadataKey] as MessageModuleMetadata | undefined
    if (metadata) {
      return metadata
    } else {
      const newMetadata: MessageModuleMetadata = {
        controllers: new Set<ClassType>(),
        imports: new Set<ClassType>(),
        guards: new Set<
          ClassTypeWithInstance<MessageGuard> | InjectionToken<MessageGuard, undefined>
        >(),
        customAttributes: new Map<string | symbol, any>(),
      }
      context.metadata[MessageModuleMetadataKey] = newMetadata
      // @ts-expect-error We add a custom metadata key to the target
      target[MessageModuleMetadataKey] = newMetadata
      return newMetadata
    }
  }
  throw new Error('[Navios/Microservice] Wrong environment.')
}

export function extractMessageModuleMetadata(target: ClassType): MessageModuleMetadata {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[MessageModuleMetadataKey] as MessageModuleMetadata | undefined
  if (!metadata) {
    throw new Error(
      '[Navios/Microservice] MessageModule metadata not found. Make sure to use @MessageModule decorator.',
    )
  }
  return metadata
}

export function hasMessageModuleMetadata(target: ClassType): boolean {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[MessageModuleMetadataKey] as MessageModuleMetadata | undefined
  return !!metadata
}
