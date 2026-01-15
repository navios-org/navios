import type {
  ClassType,
  ClassTypeWithInstance,
  InjectionToken,
} from '@navios/di'

import type { CanActivate } from '../index.mjs'

export const ModuleMetadataKey = Symbol('ModuleMetadataKey')

export interface ModuleMetadata {
  /**
   * The name of the module class.
   */
  name: string
  controllers: Set<ClassType>
  imports: Set<ClassType>
  guards: Set<
    ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>
  >
  overrides: Set<ClassType>
  customAttributes: Map<string | symbol, any>
  /**
   * Extensible entries for adapter-specific data.
   * Adapters can store custom metadata using symbol keys.
   *
   * @example
   * ```typescript
   * const CommandEntryKey = Symbol('CommandEntryKey')
   * metadata.customEntries.set(CommandEntryKey, new Set([Command1, Command2]))
   * ```
   */
  customEntries: Map<symbol, unknown>
}

export function getModuleMetadata(
  target: ClassType,
  context: ClassDecoratorContext,
): ModuleMetadata {
  if (!context.metadata) {
    throw new Error('[Navios] Wrong environment.')
  }

  const existingMetadata = context.metadata[ModuleMetadataKey] as
    | ModuleMetadata
    | undefined

  if (existingMetadata) {
    return existingMetadata
  }

  const newMetadata: ModuleMetadata = {
    name: target.name,
    controllers: new Set<ClassType>(),
    imports: new Set<ClassType>(),
    guards: new Set<
      ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>
    >(),
    overrides: new Set<ClassType>(),
    customAttributes: new Map<string | symbol, any>(),
    customEntries: new Map<symbol, unknown>(),
  }

  context.metadata[ModuleMetadataKey] = newMetadata
  // @ts-expect-error We add a custom metadata key to the target
  target[ModuleMetadataKey] = newMetadata

  return newMetadata
}

export function extractModuleMetadata(target: ClassType): ModuleMetadata {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[ModuleMetadataKey] as ModuleMetadata | undefined
  if (!metadata) {
    throw new Error(
      `[Navios] Module metadata not found for ${target.name}. Make sure to use @Module decorator.`,
    )
  }
  return metadata
}

export function hasModuleMetadata(target: ClassType): boolean {
  // @ts-expect-error We add a custom metadata key to the target
  return !!target[ModuleMetadataKey]
}

/**
 * Type-safe helper to get or create a custom entry in module metadata.
 * Adapters use this to store their own metadata in modules.
 *
 * @param metadata - The module metadata object
 * @param key - Symbol key for the custom entry
 * @param defaultValue - Factory function to create default value if entry doesn't exist
 * @returns The existing or newly created entry value
 *
 * @example
 * ```typescript
 * const CommandEntryKey = Symbol('CommandEntryKey')
 * const commands = getModuleCustomEntry<Set<ClassType>>(
 *   metadata,
 *   CommandEntryKey,
 *   () => new Set(),
 * )
 * commands.add(MyCommand)
 * ```
 */
export function getModuleCustomEntry<T>(
  metadata: ModuleMetadata,
  key: symbol,
  defaultValue: () => T,
): T {
  if (!metadata.customEntries.has(key)) {
    metadata.customEntries.set(key, defaultValue())
  }
  return metadata.customEntries.get(key) as T
}
