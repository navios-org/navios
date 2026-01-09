import type { ClassType } from '@navios/core'

import { Injectable } from '@navios/core'

import type { CommandMetadata } from '../metadata/index.mjs'

/**
 * Represents a registered command with its metadata and module information.
 *
 * @public
 */
export interface RegisteredCommand {
  /**
   * The command class
   */
  class: ClassType
  /**
   * The command metadata from @Command decorator
   */
  metadata: CommandMetadata
  /**
   * Name of the module this command belongs to
   */
  moduleName: string
}

/**
 * Service for registering and looking up CLI commands.
 * Used internally by the CLI adapter to manage discovered commands.
 *
 * @public
 */
@Injectable()
export class CommandRegistryService {
  private commands = new Map<string, RegisteredCommand>()

  /**
   * Register a command with its metadata.
   *
   * @param path - The command path (e.g., 'greet', 'user:create')
   * @param command - The registered command data
   * @throws Error if a command with the same path is already registered
   */
  register(path: string, command: RegisteredCommand): void {
    if (this.commands.has(path)) {
      throw new Error(`[Navios Commander] Duplicate command path: ${path}`)
    }
    this.commands.set(path, command)
  }

  /**
   * Get a command by its path.
   *
   * @param path - The command path
   * @returns The registered command or undefined if not found
   */
  getByPath(path: string): RegisteredCommand | undefined {
    return this.commands.get(path)
  }

  /**
   * Get all registered commands.
   *
   * @returns Map of path to registered command
   */
  getAll(): Map<string, RegisteredCommand> {
    return new Map(this.commands)
  }

  /**
   * Get all registered commands as an array of path and class pairs.
   * Useful for listing available commands.
   *
   * @returns Array of objects containing path and class
   */
  getAllAsArray(): Array<{ path: string; class: ClassType }> {
    const result: Array<{ path: string; class: ClassType }> = []
    for (const [path, { class: cls }] of this.commands) {
      result.push({ path, class: cls })
    }
    return result
  }

  /**
   * Formats help text listing all available commands with descriptions.
   *
   * @returns Formatted string listing all commands
   */
  formatCommandList(): string {
    const lines = ['Available commands:', '']
    for (const [path, { metadata }] of this.commands) {
      const description = metadata.description
      if (description) {
        lines.push(`  ${path.padEnd(20)} ${description}`)
      } else {
        lines.push(`  ${path}`)
      }
    }
    return lines.join('\n')
  }

  /**
   * Formats help text for a specific command.
   *
   * @param commandPath - The command path to show help for
   * @returns Formatted string with command help
   */
  formatCommandHelp(commandPath: string): string {
    const command = this.commands.get(commandPath)
    if (!command) {
      return `Unknown command: ${commandPath}\n\n${this.formatCommandList()}`
    }

    const { metadata } = command
    const lines: string[] = []

    lines.push(`Usage: ${metadata.path} [options]`)
    lines.push('')

    if (metadata.description) {
      lines.push(metadata.description)
      lines.push('')
    }

    // Extract options from schema if available
    if (metadata.optionsSchema) {
      lines.push('Options:')
      try {
        const shape = metadata.optionsSchema.def.shape
        if (shape && typeof shape === 'object') {
          for (const [key, fieldSchema] of Object.entries(shape)) {
            const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase()
            const optionFlag = `--${kebabKey}`
            const fieldType = this.getSchemaTypeName(fieldSchema as any)
            lines.push(`  ${optionFlag.padEnd(20)} ${fieldType}`)
          }
        }
      } catch {
        // Schema introspection failed, skip options
      }
    }

    return lines.join('\n')
  }

  /**
   * Gets a human-readable type name from a Zod schema.
   */
  private getSchemaTypeName(schema: any): string {
    try {
      let currentSchema = schema
      let typeName = currentSchema?.def?.type
      let isOptional = false
      let defaultValue: any

      // Unwrap optional/default wrappers
      while (typeName === 'optional' || typeName === 'default') {
        if (typeName === 'optional') {
          isOptional = true
        }
        if (typeName === 'default') {
          isOptional = true
          defaultValue = currentSchema?.def?.defaultValue?.()
        }
        currentSchema = currentSchema?.def?.innerType
        typeName = currentSchema?.def?.type
      }

      let result = `<${typeName || 'unknown'}>`
      if (defaultValue !== undefined) {
        result += ` (default: ${JSON.stringify(defaultValue)})`
      } else if (isOptional) {
        result += ' (optional)'
      }

      // Get description from meta() if available
      const description = this.getSchemaMeta(schema)?.description
      if (description) {
        result += ` - ${description}`
      }

      return result
    } catch {
      return '<unknown>'
    }
  }

  /**
   * Gets metadata from a Zod schema, traversing innerType if needed.
   * Zod v4 stores meta at the outermost layer when .meta() is called last,
   * or in innerType when .meta() is called before .optional()/.default().
   */
  private getSchemaMeta(schema: any): Record<string, unknown> | undefined {
    try {
      // First check direct meta (when .meta() is called last in chain)
      const directMeta = schema.meta?.()
      if (directMeta) return directMeta

      // Check innerType for wrapped schemas (optional, default, etc.)
      const innerType = schema.def?.innerType
      if (innerType) {
        return this.getSchemaMeta(innerType)
      }

      return undefined
    } catch {
      return undefined
    }
  }

  /**
   * Clear all registered commands.
   */
  clear(): void {
    this.commands.clear()
  }
}
