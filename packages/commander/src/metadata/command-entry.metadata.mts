import type { ClassType } from '@navios/core'

import { extractModuleMetadata } from '@navios/core'

/**
 * Symbol key for storing commands in ModuleMetadata.customEntries.
 * Used by @CliModule to store command classes.
 *
 * @public
 */
export const CommandEntryKey = Symbol('CommandEntryKey')

/**
 * Type for the command entry value stored in customEntries.
 *
 * @public
 */
export type CommandEntryValue = Set<ClassType>

/**
 * Extracts commands from a module's metadata.
 * Returns empty set if no commands are defined.
 *
 * @param moduleClass - The module class decorated with @CliModule or @Module
 * @returns Set of command classes registered in the module
 *
 * @example
 * ```typescript
 * const commands = extractModuleCommands(AppModule)
 * for (const command of commands) {
 *   console.log(command.name)
 * }
 * ```
 */
export function extractModuleCommands(moduleClass: ClassType): Set<ClassType> {
  const metadata = extractModuleMetadata(moduleClass)
  return (
    (metadata.customEntries.get(CommandEntryKey) as CommandEntryValue) ??
    new Set()
  )
}
