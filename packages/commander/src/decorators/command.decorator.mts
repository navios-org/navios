import type { ClassType } from '@navios/core'
import type { ZodObject } from 'zod'

import { Injectable, InjectableScope, InjectionToken } from '@navios/core'

import { getCommandMetadata } from '../metadata/index.mjs'

/**
 * Options for the `@Command` decorator.
 *
 * @public
 */
export interface CommandOptions {
  /**
   * The command path that users will invoke from the CLI.
   * Can be a single word (e.g., 'greet') or multi-word with colons (e.g., 'user:create', 'db:migrate').
   */
  path: string
  /**
   * Optional Zod schema for validating command options.
   * If provided, options will be validated and parsed according to this schema.
   */
  optionsSchema?: ZodObject
}

/**
 * Decorator that marks a class as a CLI command.
 *
 * The decorated class must implement the `CommandHandler` interface with an `execute` method.
 * The command will be automatically registered when its module is loaded.
 *
 * @param options - Configuration options for the command
 * @returns A class decorator function
 *
 * @example
 * ```typescript
 * import { Command, CommandHandler } from '@navios/commander'
 * import { z } from 'zod'
 *
 * const optionsSchema = z.object({
 *   name: z.string(),
 *   greeting: z.string().optional().default('Hello')
 * })
 *
 * @Command({
 *   path: 'greet',
 *   optionsSchema: optionsSchema
 * })
 * export class GreetCommand implements CommandHandler<z.infer<typeof optionsSchema>> {
 *   async execute(options) {
 *     console.log(`${options.greeting}, ${options.name}!`)
 *   }
 * }
 * ```
 */
export function Command({ path, optionsSchema }: CommandOptions) {
  return function (target: ClassType, context: ClassDecoratorContext) {
    if (context.kind !== 'class') {
      throw new Error(
        '[Navios Commander] @Command decorator can only be used on classes.',
      )
    }
    const token = InjectionToken.create(target)
    if (context.metadata) {
      getCommandMetadata(target, context, path, optionsSchema)
    }
    return Injectable({
      token,
      scope: InjectableScope.Singleton,
    })(target, context)
  }
}
