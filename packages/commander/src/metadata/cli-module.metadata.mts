import type { ClassType } from '@navios/core'

/**
 * @internal
 * Symbol key used to store CLI module metadata on classes.
 */
export const CliModuleMetadataKey = Symbol('CliModuleMetadataKey')

/**
 * Metadata associated with a CLI module.
 *
 * @public
 */
export interface CliModuleMetadata {
  /**
   * Set of command classes registered in this module.
   */
  commands: Set<ClassType>
  /**
   * Set of other modules imported by this module.
   */
  imports: Set<ClassType>
  /**
   * Set of service override classes imported for side effects.
   */
  overrides: Set<ClassType>
  /**
   * Map of custom attributes that can be attached to the module.
   */
  customAttributes: Map<string | symbol, any>
}

/**
 * Gets or creates CLI module metadata for a class.
 *
 * @internal
 * @param target - The module class
 * @param context - The decorator context
 * @returns The module metadata
 */
export function getCliModuleMetadata(
  target: ClassType,
  context: ClassDecoratorContext,
): CliModuleMetadata {
  if (context.metadata) {
    const metadata = context.metadata[CliModuleMetadataKey] as
      | CliModuleMetadata
      | undefined
    if (metadata) {
      return metadata
    } else {
      const newMetadata: CliModuleMetadata = {
        commands: new Set<ClassType>(),
        imports: new Set<ClassType>(),
        overrides: new Set<ClassType>(),
        customAttributes: new Map<string | symbol, any>(),
      }
      context.metadata[CliModuleMetadataKey] = newMetadata
      // @ts-expect-error We add a custom metadata key to the target
      target[CliModuleMetadataKey] = newMetadata
      return newMetadata
    }
  }
  throw new Error('[Navios Commander] Wrong environment.')
}

/**
 * Extracts CLI module metadata from a class.
 *
 * @param target - The module class
 * @returns The module metadata
 * @throws {Error} If the class is not decorated with @CliModule
 *
 * @example
 * ```typescript
 * const metadata = extractCliModuleMetadata(AppModule)
 * console.log(metadata.commands.size) // Number of commands
 * ```
 */
export function extractCliModuleMetadata(target: ClassType): CliModuleMetadata {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[CliModuleMetadataKey] as CliModuleMetadata | undefined
  if (!metadata) {
    throw new Error(
      `[Navios Commander] Module metadata not found for ${target.name}. Make sure to use @CliModule decorator.`,
    )
  }
  return metadata
}

/**
 * Checks if a class has CLI module metadata.
 *
 * @param target - The class to check
 * @returns `true` if the class is decorated with @CliModule, `false` otherwise
 */
export function hasCliModuleMetadata(target: ClassType): boolean {
  // @ts-expect-error We add a custom metadata key to the target
  return !!target[CliModuleMetadataKey]
}
