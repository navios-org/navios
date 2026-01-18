import type { CanActivate } from '@navios/core'
import type { ClassTypeWithInstance, InjectionToken } from '@navios/di'
import type { BaseMessageConfig } from '@navios/queues'

export const MessageHandlerMetadataKey = Symbol('MessageHandlerMetadataKey')

export interface MessageHandlerMetadata<Config = null> {
  classMethod: string
  config: Config extends BaseMessageConfig<any, any, any> ? Config : null
  guards: Set<ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>>
  customAttributes: Map<string | symbol, any>
}

export function getAllMessageHandlerMetadata(
  context: ClassMethodDecoratorContext | ClassDecoratorContext,
): Set<MessageHandlerMetadata<any>> {
  if (context.metadata) {
    const metadata = context.metadata[MessageHandlerMetadataKey] as
      | Set<MessageHandlerMetadata>
      | undefined
    if (metadata) {
      return metadata
    } else {
      context.metadata[MessageHandlerMetadataKey] = new Set<MessageHandlerMetadata<any>>()
      return context.metadata[MessageHandlerMetadataKey] as Set<MessageHandlerMetadata<any>>
    }
  }
  throw new Error('[Navios/Microservice] Wrong environment.')
}

export function getMessageHandlerMetadata<Config = any>(
  target: Function,
  context: ClassMethodDecoratorContext,
): MessageHandlerMetadata<Config> {
  if (context.metadata) {
    const metadata = getAllMessageHandlerMetadata(context)
    if (metadata) {
      const handlerMetadata = Array.from(metadata).find((item) => item.classMethod === target.name)
      if (handlerMetadata) {
        return handlerMetadata
      } else {
        const newMetadata: MessageHandlerMetadata<Config> = {
          classMethod: target.name,
          // @ts-expect-error We are using a generic type here
          config: null,
          guards: new Set<
            ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>
          >(),
          customAttributes: new Map<string | symbol, any>(),
        }
        metadata.add(newMetadata)
        return newMetadata
      }
    }
  }
  throw new Error('[Navios/Microservice] Wrong environment.')
}
