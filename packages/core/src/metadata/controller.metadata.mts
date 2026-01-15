import type {
  ClassType,
  ClassTypeWithInstance,
  InjectionToken,
} from '@navios/di'

import type { CanActivate } from '../interfaces/index.mjs'
import type { HandlerMetadata } from './handler.metadata.mjs'

import { getAllEndpointMetadata } from './handler.metadata.mjs'

export const ControllerMetadataKey = Symbol('ControllerMetadataKey')

export interface ControllerMetadata {
  /**
   * The name of the controller class.
   */
  name: string
  endpoints: Set<HandlerMetadata>
  guards: Set<
    ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>
  >
  customAttributes: Map<string | symbol, any>
}

export function getControllerMetadata(
  target: ClassType,
  context: ClassDecoratorContext,
): ControllerMetadata {
  if (!context.metadata) {
    throw new Error('[Navios] Wrong environment.')
  }

  const existingMetadata = context.metadata[ControllerMetadataKey] as
    | ControllerMetadata
    | undefined

  if (existingMetadata) {
    return existingMetadata
  }

  const newMetadata: ControllerMetadata = {
    name: target.name,
    endpoints: getAllEndpointMetadata(context),
    guards: new Set<
      ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>
    >(),
    customAttributes: new Map<string | symbol, any>(),
  }

  context.metadata[ControllerMetadataKey] = newMetadata
  // @ts-expect-error We add a custom metadata key to the target
  target[ControllerMetadataKey] = newMetadata

  return newMetadata
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
