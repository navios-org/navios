import type { HttpMethod } from '@navios/builder'
import type { ClassTypeWithInstance, InjectionToken } from '@navios/di'
import type { HttpHeader } from 'fastify/types/utils.js'

import type { HandlerAdapterInterface } from '../adapters/index.mjs'
import type { CanActivate } from '../interfaces/index.mjs'

export const EndpointMetadataKey = Symbol('EndpointMetadataKey')

export interface HandlerMetadata<Config = null> {
  classMethod: string
  url: string
  successStatusCode: number
  adapterToken:
    | InjectionToken<HandlerAdapterInterface, undefined>
    | ClassTypeWithInstance<HandlerAdapterInterface>
    | null
  headers: Partial<Record<HttpHeader, number | string | string[] | undefined>>
  httpMethod: HttpMethod
  config: Config
  guards: Set<
    ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>
  >
  customAttributes: Map<string | symbol, any>
}

export function getAllEndpointMetadata(
  context: ClassMethodDecoratorContext | ClassDecoratorContext,
): Set<HandlerMetadata<any>> {
  if (context.metadata) {
    const metadata = context.metadata[EndpointMetadataKey] as
      | Set<HandlerMetadata>
      | undefined
    if (metadata) {
      return metadata
    } else {
      context.metadata[EndpointMetadataKey] = new Set<HandlerMetadata<any>>()
      return context.metadata[EndpointMetadataKey] as Set<HandlerMetadata<any>>
    }
  }
  throw new Error('[Navios] Wrong environment.')
}

export function getEndpointMetadata<Config = any>(
  target: Function,
  context: ClassMethodDecoratorContext,
): HandlerMetadata<Config> {
  if (context.metadata) {
    const metadata = getAllEndpointMetadata(context)
    if (metadata) {
      const endpointMetadata = Array.from(metadata).find(
        (item) => item.classMethod === target.name,
      )
      if (endpointMetadata) {
        return endpointMetadata
      } else {
        const newMetadata: HandlerMetadata<Config> = {
          classMethod: target.name,
          url: '',
          successStatusCode: 200,
          adapterToken: null,
          headers: {},
          httpMethod: 'GET',
          // @ts-expect-error We are using a generic type here
          config: null,
          guards: new Set<
            | ClassTypeWithInstance<CanActivate>
            | InjectionToken<CanActivate, undefined>
          >(),
          customAttributes: new Map<string | symbol, any>(),
        }
        metadata.add(newMetadata)
        return newMetadata
      }
    }
  }
  throw new Error('[Navios] Wrong environment.')
}
