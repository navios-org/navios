import type { ClassType, Provider } from '@navios/di'

import {
  classAttributes,
  classGuards,
  classInterceptors,
  prepend,
  unique,
} from '../metadata/class-metadata.mjs'

import type { DecoratorMetadata } from '../metadata/decorator-metadata.mjs'

import type { ModuleOptions } from './module-options.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ModuleMetadata {
  imports: ClassType[]
  guards: ClassType[]
  interceptors: ClassType[]
  providers: Provider[]
  attributes: Map<symbol, unknown>
  /**
   * Every option the module system itself does not use, by option name, as
   * written. A transport reads its own from here.
   */
  entries: Map<string, unknown>
}

export const ModuleMetadataKey = Symbol.for('navios.core.module')

const ownOptions = new Set(['imports', 'guards', 'interceptors', 'providers', 'attributes'])

export function defineModuleMetadata(
  target: ClassType,
  context: { metadata?: DecoratorMetadata },
  options: ModuleOptions,
): ModuleMetadata {
  const entries = new Map<string, unknown>()
  for (const [name, value] of Object.entries(options)) {
    if (!ownOptions.has(name) && value !== undefined) {
      entries.set(name, value)
    }
  }
  const module: ModuleMetadata = {
    imports: unique([...(options.imports ?? [])]),
    guards: prepend(classGuards(context), options.guards),
    interceptors: prepend(classInterceptors(context), options.interceptors),
    providers: [...(options.providers ?? [])],
    attributes: classAttributes(context),
    entries,
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
