/**
 * Interface that all command classes must implement.
 *
 * Commands decorated with `@Command` must implement this interface.
 * The `execute` method is called when the command is invoked.
 *
 * @template TOptions - The type of options that the command accepts
 *
 * @example
 * ```typescript
 * import { Command, CommandHandler } from '@navios/commander'
 * import { z } from 'zod'
 *
 * const optionsSchema = z.object({
 *   name: z.string()
 * })
 *
 * type Options = z.infer<typeof optionsSchema>
 *
 * @Command({ path: 'greet', optionsSchema })
 * export class GreetCommand implements CommandHandler<Options> {
 *   async execute(options: Options) {
 *     console.log(`Hello, ${options.name}!`)
 *   }
 * }
 * ```
 */
export interface CommandHandler<TOptions = any> {
  /**
   * Executes the command with the provided options.
   *
   * @param options - The validated command options (validated against the command's schema if provided)
   * @returns A promise or void
   */
  execute(options: TOptions): void | Promise<void>
}
