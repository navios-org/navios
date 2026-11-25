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

const ModuleMetadataKey = Symbol.for('navios.core.module')

const ownOptions = new Set(['imports', 'guards', 'interceptors', 'providers', 'attributes'])

export function defineModuleMetadata(
  target: ClassType,
  context: { metadata?: DecoratorMetadata },
  options: ModuleOptions,
): ModuleMetadata {
  if (hasModuleMetadata(target)) {
    throw new Error(
      `[Navios] ${target.name} is already a module. One @Module takes all of its options.`,
    )
  }
  const entries = new Map<string, unknown>()
  for (const [name, value] of Object.entries(options)) {
    if (!ownOptions.has(name) && value !== undefined) {
      entries.set(name, value)
    }
  }
  const imports = unique([...(options.imports ?? [])])
  assertImportsDefined(target, imports)
  const providers = [...(options.providers ?? [])]
  assertProviders(target.name, providers)
  // Decorator metadata inherits by itself between two decorated classes. This
  // covers a class or a base class that was registered without decorators.
  const base = Object.getPrototypeOf(target)[ModuleMetadataKey] as ModuleMetadata | undefined
  const module: ModuleMetadata = {
    imports,
    guards: prepend(prepend(classGuards(context), base?.guards), options.guards),
    interceptors: prepend(
      prepend(classInterceptors(context), base?.interceptors),
      options.interceptors,
    ),
    providers,
    attributes: classAttributes(context),
    entries,
  }
  for (const [key, value] of base?.attributes ?? []) {
    if (!module.attributes.has(key)) {
      module.attributes.set(key, value)
    }
  }
  Object.defineProperty(target, ModuleMetadataKey, {
    value: module,
    configurable: true,
    enumerable: false,
  })
  return module
}

/**
 * An import that is `undefined` is what an import cycle between files leaves
 * behind: the importing file ran before the imported one defined its class.
 * @internal
 */
export function assertImportsDefined(target: ClassType, imports: readonly unknown[]): void {
  const index = imports.findIndex((imported) => imported === undefined || imported === null)
  if (index !== -1) {
    throw new Error(
      `[Navios] Module ${target.name} imports ${String(imports[index])} at index ${index} of ` +
        `its imports. This usually means the files of the two modules import each other, so the ` +
        `imported module was not defined yet when ${target.name} was. Break the import cycle.`,
    )
  }
}

/**
 * Where there are no types, a class is easily listed for itself.
 * @internal
 */
export function assertProviders(owner: string, providers: readonly unknown[]): void {
  for (const provider of providers) {
    if (typeof provider === 'object' && provider !== null && 'token' in provider) {
      continue
    }
    const listed =
      typeof provider === 'function'
        ? provider.name
        : typeof provider === 'object' && provider !== null
          ? 'an object'
          : String(provider)
    throw new Error(
      `[Navios] ${owner} lists ${listed} in providers, which is not a provider. Use ` +
        `provide(token, ...); an @Injectable class needs no entry.`,
    )
  }
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
