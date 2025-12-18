import type { ClassType } from '@navios/core'
import type { ZodObject } from 'zod'

/**
 * @internal
 * Symbol key used to store command metadata on classes.
 */
export const CommandMetadataKey = Symbol('CommandMetadataKey')

/**
 * Metadata associated with a command.
 *
 * @public
 */
export interface CommandMetadata {
  /**
   * The command path (e.g., 'greet', 'user:create').
   */
  path: string
  /**
   * Optional Zod schema for validating command options.
   */
  optionsSchema?: ZodObject
  /**
   * Map of custom attributes that can be attached to the command.
   */
  customAttributes: Map<string | symbol, any>
}

/**
 * Gets or creates command metadata for a class.
 *
 * @internal
 * @param target - The command class
 * @param context - The decorator context
 * @param path - The command path
 * @param optionsSchema - Optional Zod schema
 * @returns The command metadata
 */
export function getCommandMetadata(
  target: ClassType,
  context: ClassDecoratorContext,
  path: string,
  optionsSchema?: ZodObject,
): CommandMetadata {
  if (context.metadata) {
    const metadata = context.metadata[CommandMetadataKey] as
      | CommandMetadata
      | undefined
    if (metadata) {
      return metadata
    } else {
      const newMetadata: CommandMetadata = {
        path,
        optionsSchema,
        customAttributes: new Map<string | symbol, any>(),
      }
      context.metadata[CommandMetadataKey] = newMetadata
      // @ts-expect-error We add a custom metadata key to the target
      target[CommandMetadataKey] = newMetadata
      return newMetadata
    }
  }
  throw new Error('[Navios Commander] Wrong environment.')
}

/**
 * Extracts command metadata from a class.
 *
 * @param target - The command class
 * @returns The command metadata
 * @throws {Error} If the class is not decorated with @Command
 *
 * @example
 * ```typescript
 * const metadata = extractCommandMetadata(GreetCommand)
 * console.log(metadata.path) // 'greet'
 * ```
 */
export function extractCommandMetadata(target: ClassType): CommandMetadata {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[CommandMetadataKey] as CommandMetadata | undefined
  if (!metadata) {
    throw new Error(
      '[Navios Commander] Command metadata not found. Make sure to use @Command decorator.',
    )
  }
  return metadata
}

/**
 * Checks if a class has command metadata.
 *
 * @param target - The class to check
 * @returns `true` if the class is decorated with @Command, `false` otherwise
 */
export function hasCommandMetadata(target: ClassType): boolean {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[CommandMetadataKey] as CommandMetadata | undefined
  return !!metadata
}
