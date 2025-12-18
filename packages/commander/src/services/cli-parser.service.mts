import type { ZodObject, ZodType } from 'zod'

import { Injectable } from '@navios/core'

/**
 * Result of parsing command-line arguments.
 *
 * @public
 */
export interface ParsedCliArgs {
  /**
   * The command path (e.g., 'greet', 'user:create').
   * Multi-word commands are joined with spaces.
   */
  command: string
  /**
   * Parsed options as key-value pairs.
   * Keys are converted from kebab-case to camelCase.
   */
  options: Record<string, any>
  /**
   * Positional arguments that don't match any option flags.
   */
  positionals: string[]
}

/**
 * Service for parsing command-line arguments.
 *
 * Handles parsing of various CLI argument formats including:
 * - Long options: `--key value` or `--key=value`
 * - Short options: `-k value` or `-abc` (multiple flags)
 * - Boolean flags
 * - Array options
 * - Positional arguments
 *
 * @public
 */
@Injectable()
export class CliParserService {
  /**
   * Parses command-line arguments from process.argv
   * Commands can be multi-word (e.g., 'db migrate', 'cache clear')
   * Expected format: node script.js command [subcommand...] --flag value --boolean-flag positional1 positional2
   *
   * @param argv - Array of command-line arguments (typically process.argv)
   * @param optionsSchema - Optional Zod schema to determine boolean flags and option types
   * @returns Parsed command (space-separated if multi-word), options, and positional arguments
   */
  parse(argv: string[], optionsSchema?: ZodObject): ParsedCliArgs {
    // Skip first two args (node and script path)
    const args = argv.slice(2)

    if (args.length === 0) {
      throw new Error('[Navios Commander] No command provided')
    }

    // Extract boolean and array field names from schema for accurate parsing
    const booleanFields = optionsSchema
      ? this.extractBooleanFields(optionsSchema)
      : new Set<string>()
    const arrayFields = optionsSchema
      ? this.extractArrayFields(optionsSchema)
      : new Set<string>()

    // Collect command words until we hit an argument that starts with '-' or '--'
    const commandParts: string[] = []
    let i = 0
    while (i < args.length && !args[i].startsWith('-')) {
      commandParts.push(args[i])
      i++
    }

    if (commandParts.length === 0) {
      throw new Error('[Navios Commander] No command provided')
    }

    const command = commandParts.join(' ')
    const options: Record<string, any> = {}
    const positionals: string[] = []
    while (i < args.length) {
      const arg = args[i]

      if (arg.startsWith('--')) {
        // Long option format: --key=value or --key value
        const key = arg.slice(2)
        const equalIndex = key.indexOf('=')

        if (equalIndex !== -1) {
          // Format: --key=value
          const optionName = key.slice(0, equalIndex)
          const optionValue = key.slice(equalIndex + 1)
          const camelCaseKey = this.camelCase(optionName)
          const isArray =
            arrayFields.has(camelCaseKey) || arrayFields.has(optionName)

          if (isArray) {
            // For array fields, accumulate values
            if (!options[camelCaseKey]) {
              options[camelCaseKey] = []
            }
            options[camelCaseKey].push(this.parseValue(optionValue))
          } else {
            options[camelCaseKey] = this.parseValue(optionValue)
          }
          i++
        } else {
          // Format: --key value or --boolean-flag
          const camelCaseKey = this.camelCase(key)
          const isBoolean =
            booleanFields.has(camelCaseKey) || booleanFields.has(key)
          const isArray = arrayFields.has(camelCaseKey) || arrayFields.has(key)
          const nextArg = args[i + 1]

          if (isBoolean) {
            // Known boolean flag from schema
            options[camelCaseKey] = true
            i++
          } else if (isArray && nextArg && !nextArg.startsWith('-')) {
            // Known array field from schema - accumulate values
            if (!options[camelCaseKey]) {
              options[camelCaseKey] = []
            }
            options[camelCaseKey].push(this.parseValue(nextArg))
            i += 2
          } else if (nextArg && !nextArg.startsWith('-')) {
            // Has a value
            options[camelCaseKey] = this.parseValue(nextArg)
            i += 2
          } else {
            // Assume boolean flag
            options[camelCaseKey] = true
            i++
          }
        }
      } else if (arg.startsWith('-') && arg.length > 1 && arg !== '-') {
        // Short option format: -k value or -abc (multiple flags)
        const flags = arg.slice(1)

        if (flags.length === 1) {
          // Single short flag: -k value or -k
          const isBoolean = booleanFields.has(flags)
          const isArray = arrayFields.has(flags)
          const nextArg = args[i + 1]

          if (isBoolean) {
            // Known boolean flag from schema
            options[flags] = true
            i++
          } else if (isArray && nextArg && !nextArg.startsWith('-')) {
            // Known array field from schema - accumulate values
            if (!options[flags]) {
              options[flags] = []
            }
            options[flags].push(this.parseValue(nextArg))
            i += 2
          } else if (nextArg && !nextArg.startsWith('-')) {
            options[flags] = this.parseValue(nextArg)
            i += 2
          } else {
            options[flags] = true
            i++
          }
        } else {
          // Multiple short flags: -abc -> {a: true, b: true, c: true}
          for (const flag of flags) {
            options[flag] = true
          }
          i++
        }
      } else {
        // Positional argument
        positionals.push(arg)
        i++
      }
    }

    return {
      command,
      options,
      positionals,
    }
  }

  /**
   * Converts kebab-case to camelCase
   */
  private camelCase(str: string): string {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
  }

  /**
   * Attempts to parse string values into appropriate types
   */
  private parseValue(value: string): any {
    // Check for boolean
    if (value === 'true') return true
    if (value === 'false') return false

    // Check for null/undefined
    if (value === 'null') return null
    if (value === 'undefined') return undefined

    // Check for number
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10)
    }
    if (/^-?\d+\.\d+$/.test(value)) {
      return parseFloat(value)
    }

    // Check for JSON
    if (
      (value.startsWith('{') && value.endsWith('}')) ||
      (value.startsWith('[') && value.endsWith(']'))
    ) {
      try {
        return JSON.parse(value)
      } catch {
        // If parsing fails, return as string
        return value
      }
    }

    // Return as string
    return value
  }

  /**
   * Extracts boolean field names from a Zod schema
   * Handles ZodObject, ZodOptional, and ZodDefault wrappers
   */
  private extractBooleanFields(schema: ZodObject): Set<string> {
    const booleanFields = new Set<string>()

    try {
      // Check if schema has _def.typeName (Zod schema structure)
      const typeName = schema.def.type

      if (typeName === 'object') {
        // Extract shape from ZodObject
        const shape = schema.def.shape

        if (shape && typeof shape === 'object') {
          for (const [key, fieldSchema] of Object.entries(shape)) {
            if (this.isSchemaBoolean(fieldSchema as any)) {
              booleanFields.add(key)
            }
          }
        }
      }
    } catch {
      // Silently fail if schema introspection fails
    }

    return booleanFields
  }

  /**
   * Extracts array field names from a Zod schema
   * Handles ZodObject, ZodOptional, and ZodDefault wrappers
   */
  private extractArrayFields(schema: ZodObject): Set<string> {
    const arrayFields = new Set<string>()

    try {
      const typeName = schema.def.type

      if (typeName === 'object') {
        const shape = schema.def.shape

        if (shape && typeof shape === 'object') {
          for (const [key, fieldSchema] of Object.entries(shape)) {
            if (this.isSchemaArray(fieldSchema as any)) {
              arrayFields.add(key)
            }
          }
        }
      }
    } catch {
      // Silently fail if schema introspection fails
    }

    return arrayFields
  }

  /**
   * Checks if a Zod schema represents a boolean type
   * Unwraps ZodOptional and ZodDefault
   */
  private isSchemaBoolean(schema: ZodType): boolean {
    try {
      let currentSchema = schema
      const typeName = currentSchema.def.type

      // Unwrap ZodOptional and ZodDefault
      if (typeName === 'optional' || typeName === 'default') {
        currentSchema = (currentSchema as any)?._def?.innerType || currentSchema
      }

      const innerTypeName = currentSchema.def.type
      return innerTypeName === 'boolean'
    } catch {
      return false
    }
  }

  /**
   * Checks if a Zod schema represents an array type
   * Unwraps ZodOptional and ZodDefault
   */
  private isSchemaArray(schema: ZodType): boolean {
    try {
      let currentSchema = schema
      const typeName = currentSchema.def.type

      // Unwrap ZodOptional and ZodDefault
      if (typeName === 'optional' || typeName === 'default') {
        currentSchema = (currentSchema as any)?._def?.innerType || currentSchema
      }

      const innerTypeName = currentSchema.def.type
      return innerTypeName === 'array'
    } catch {
      return false
    }
  }

  /**
   * Formats help text listing all available commands.
   *
   * @param commands - Array of command objects with path and class
   * @returns Formatted string listing all commands
   */
  formatCommandList(commands: Array<{ path: string; class: any }>): string {
    const lines = ['Available commands:', '']
    for (const { path } of commands) {
      lines.push(`  ${path}`)
    }
    return lines.join('\n')
  }
}
