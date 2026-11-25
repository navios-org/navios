import type { ClassType } from '@navios/di'

import {
  classAttributes,
  classGuards,
  classInterceptors,
  prepend,
} from '../metadata/class-metadata.mjs'
import { requireMetadata } from '../metadata/decorator-metadata.mjs'
import { MembersKey } from '../metadata/member-metadata.mjs'

import type { DecoratorMetadata } from '../metadata/decorator-metadata.mjs'
import type { MethodHandlerMetadata } from '../metadata/member-metadata.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ControllerMetadata {
  guards: ClassType[]
  interceptors: ClassType[]
  attributes: Map<symbol, unknown>
  /** Method-form handlers, and extras for field-form handlers, by member name. */
  members: Map<string, MethodHandlerMetadata>
}

export const ControllerMetadataKey = Symbol.for('navios.core.controller')

/** @internal */
export function defineControllerMetadata(
  target: ClassType,
  context: { metadata?: DecoratorMetadata },
  options: { guards?: Iterable<ClassType>; interceptors?: Iterable<ClassType> },
): ControllerMetadata {
  const metadata = requireMetadata(context)
  const controller: ControllerMetadata = {
    // The live lists: @UseGuards / @UseInterceptors placed above this
    // decorator run after it and must still be seen.
    guards: prepend(classGuards(context), options.guards),
    interceptors: prepend(classInterceptors(context), options.interceptors),
    attributes: classAttributes(context),
    members: (metadata[MembersKey] as Map<string, MethodHandlerMetadata> | undefined) ?? new Map(),
  }
  Object.defineProperty(target, ControllerMetadataKey, {
    value: controller,
    configurable: true,
    enumerable: false,
  })
  return controller
}

export function getControllerMetadata(target: ClassType): ControllerMetadata {
  const metadata = Object.hasOwn(target, ControllerMetadataKey)
    ? ((target as any)[ControllerMetadataKey] as ControllerMetadata)
    : undefined
  if (!metadata) {
    throw new Error(
      `[Navios] ${target.name} is not a controller. Make sure it is decorated with @Controller.`,
    )
  }
  return metadata
}

export function hasControllerMetadata(target: ClassType): boolean {
  return Object.hasOwn(target, ControllerMetadataKey)
}
