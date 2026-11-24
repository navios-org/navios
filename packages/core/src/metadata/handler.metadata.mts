import type { HttpMethod } from '@navios/builder'
import type { ClassTypeWithInstance, InjectionToken } from '@navios/di'

import type {
  AbstractHttpHandlerAdapterInterface,
  CanActivate,
  HttpHeader,
} from '../interfaces/index.mjs'

export const EndpointMetadataKey = Symbol('EndpointMetadataKey')

export interface HandlerMetadata<Config = null> {
  classMethod: string
  url: string
  successStatusCode: number
  adapterToken:
    | InjectionToken<AbstractHttpHandlerAdapterInterface, undefined>
    | ClassTypeWithInstance<AbstractHttpHandlerAdapterInterface>
    | null
  headers: Partial<Record<HttpHeader, number | string | string[] | undefined>>
  httpMethod: HttpMethod
  config: Config
  guards: Set<ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>>
  customAttributes: Map<string | symbol, any>
}

/** Handlers whose success status was set explicitly (e.g. with `@HttpCode`). */
const explicitStatusCodes = new WeakSet<HandlerMetadata<any>>()

/**
 * Sets the success status of a handler on the user's behalf (`@HttpCode`).
 * An explicit status always wins over a default one.
 */
export function setSuccessStatusCode(metadata: HandlerMetadata<any>, code: number): void {
  metadata.successStatusCode = code
  explicitStatusCodes.add(metadata)
}

/**
 * Sets the status a handler answers with when the user has not chosen one
 * (for example 204 for an endpoint without a response body). Does nothing
 * if a status was already set with {@link setSuccessStatusCode}, and a later
 * explicit status still overrides it — so the order of decorators does not
 * matter.
 */
export function setDefaultSuccessStatusCode(metadata: HandlerMetadata<any>, code: number): void {
  if (!explicitStatusCodes.has(metadata)) {
    metadata.successStatusCode = code
  }
}

/** Whether the handler's success status was set explicitly (with `@HttpCode`). */
export function hasExplicitSuccessStatusCode(metadata: HandlerMetadata<any>): boolean {
  return explicitStatusCodes.has(metadata)
}

export function getAllEndpointMetadata(
  context: ClassMethodDecoratorContext | ClassDecoratorContext,
): Set<HandlerMetadata<any>> {
  if (context.metadata) {
    const metadata = context.metadata[EndpointMetadataKey] as Set<HandlerMetadata> | undefined
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
      const endpointMetadata = Array.from(metadata).find((item) => item.classMethod === target.name)
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
            ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>
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
