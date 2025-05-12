import type {
  BaseEndpointConfig,
  BaseStreamConfig,
  HttpMethod,
} from '@navios/common'
import type { HttpHeader } from 'fastify/types/utils.js'

import type { CanActivate } from '../interfaces/index.mjs'
import type {
  ClassTypeWithInstance,
  InjectionToken,
} from '../service-locator/index.mjs'

export const EndpointMetadataKey = Symbol('EndpointMetadataKey')

export enum EndpointType {
  Unknown = 'unknown',
  Endpoint = 'endpoint',
  Stream = 'stream',
  Handler = 'handler',
}

export interface EndpointMetadata {
  classMethod: string
  url: string
  successStatusCode: number
  type: EndpointType
  headers: Partial<Record<HttpHeader, number | string | string[] | undefined>>
  httpMethod: HttpMethod
  config: BaseEndpointConfig | BaseStreamConfig | null
  guards: Set<
    ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>
  >
  customAttributes: Map<string | symbol, any>
}

export function getAllEndpointMetadata(
  context: ClassMethodDecoratorContext | ClassDecoratorContext,
): Set<EndpointMetadata> {
  if (context.metadata) {
    const metadata = context.metadata[EndpointMetadataKey] as
      | Set<EndpointMetadata>
      | undefined
    if (metadata) {
      return metadata
    } else {
      context.metadata[EndpointMetadataKey] = new Set<EndpointMetadata>()
      return context.metadata[EndpointMetadataKey] as Set<EndpointMetadata>
    }
  }
  throw new Error('[Navios] Wrong environment.')
}

export function getEndpointMetadata(
  target: Function,
  context: ClassMethodDecoratorContext,
): EndpointMetadata {
  if (context.metadata) {
    const metadata = getAllEndpointMetadata(context)
    if (metadata) {
      const endpointMetadata = Array.from(metadata).find(
        (item) => item.classMethod === target.name,
      )
      if (endpointMetadata) {
        return endpointMetadata
      } else {
        const newMetadata: EndpointMetadata = {
          classMethod: target.name,
          url: '',
          successStatusCode: 200,
          headers: {},
          type: EndpointType.Unknown,
          httpMethod: 'GET',
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
