import type { CanActivate } from '../interfaces/index.mjs'
import type {
  ClassType,
  ClassTypeWithInstance,
  InjectionToken,
} from '../service-locator/index.mjs'
import type { EndpointMetadata } from './endpoint.metadata.mjs'

import { getAllEndpointMetadata } from './endpoint.metadata.mjs'

export const ControllerMetadataKey = Symbol('ControllerMetadataKey')

export interface ControllerMetadata {
  endpoints: Set<EndpointMetadata>
  guards: Set<
    ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>
  >
  customAttributes: Map<string | symbol, any>
}

export function getControllerMetadata(
  target: ClassType,
  context: ClassDecoratorContext,
): ControllerMetadata {
  if (context.metadata) {
    const metadata = context.metadata[ControllerMetadataKey] as
      | ControllerMetadata
      | undefined
    if (metadata) {
      return metadata
    } else {
      const endpointsMetadata = getAllEndpointMetadata(context)
      const newMetadata: ControllerMetadata = {
        endpoints: endpointsMetadata,
        guards: new Set<
          | ClassTypeWithInstance<CanActivate>
          | InjectionToken<CanActivate, undefined>
        >(),
        customAttributes: new Map<string | symbol, any>(),
      }
      context.metadata[ControllerMetadataKey] = newMetadata
      // @ts-expect-error We add a custom metadata key to the target
      target[ControllerMetadataKey] = newMetadata
      return newMetadata
    }
  }
  throw new Error('[Navios] Wrong environment.')
}

export function extractControllerMetadata(
  target: ClassType,
): ControllerMetadata {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[ControllerMetadataKey] as
    | ControllerMetadata
    | undefined
  if (!metadata) {
    throw new Error(
      '[Navios] Controller metadata not found. Make sure to use @Controller decorator.',
    )
  }
  return metadata
}

export function hasControllerMetadata(target: ClassType): boolean {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[ControllerMetadataKey] as
    | ControllerMetadata
    | undefined
  return !!metadata
}
