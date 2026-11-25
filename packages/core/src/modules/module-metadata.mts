import type { ClassType, Provider } from '@navios/di'

import {
  classAttributes,
  classGuards,
  classInterceptors,
  prepend,
  unique,
} from '../metadata/class-metadata.mjs'

import type { RequestValueClass } from '../context/request-value.mjs'
import type { DecoratorMetadata } from '../metadata/decorator-metadata.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ModuleMetadata {
  prefix: string
  imports: ClassType[]
  controllers: ClassType[]
  guards: ClassType[]
  interceptors: ClassType[]
  providers: Provider[]
  requestValues: RequestValueClass[]
  attributes: Map<symbol, unknown>
}

export const ModuleMetadataKey = Symbol.for('navios.core.module')

/** @internal */
export function defineModuleMetadata(
  target: ClassType,
  context: { metadata?: DecoratorMetadata },
  options: {
    prefix?: string
    imports?: Iterable<ClassType>
    controllers?: Iterable<ClassType>
    guards?: Iterable<ClassType>
    interceptors?: Iterable<ClassType>
    providers?: Iterable<Provider>
    requestValues?: Iterable<RequestValueClass>
  },
): ModuleMetadata {
  const module: ModuleMetadata = {
    prefix: options.prefix ?? '',
    imports: unique([...(options.imports ?? [])]),
    controllers: unique([...(options.controllers ?? [])]),
    guards: prepend(classGuards(context), options.guards),
    interceptors: prepend(classInterceptors(context), options.interceptors),
    providers: [...(options.providers ?? [])],
    requestValues: [...(options.requestValues ?? [])],
    attributes: classAttributes(context),
  }
  Object.defineProperty(target, ModuleMetadataKey, {
    value: module,
    configurable: true,
    enumerable: false,
  })
  return module
}

export function getModuleMetadata(target: ClassType): ModuleMetadata {
  const metadata = Object.hasOwn(target, ModuleMetadataKey)
    ? ((target as any)[ModuleMetadataKey] as ModuleMetadata)
    : undefined
  if (!metadata) {
    throw new Error(
      `[Navios] ${target.name} is not a module. Make sure it is decorated with @Module.`,
    )
  }
  return metadata
}

export function hasModuleMetadata(target: ClassType): boolean {
  return Object.hasOwn(target, ModuleMetadataKey)
}
