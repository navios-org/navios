import type { CommandMetadata } from '../metadata/command.metadata.mjs'

/**
 * Execution context for a command execution.
 *
 * Provides access to command metadata, path, and validated options during command execution.
 * This context is automatically injected and available via the `CommandExecutionContext` token.
 *
 * @example
 * ```typescript
 * import { inject, Injectable } from '@navios/core'
 * import { CommandExecutionContext } from '@navios/commander'
 *
 * @Injectable()
 * class CommandLogger {
 *   private ctx = inject(CommandExecutionContext)
 *
 *   log() {
 *     console.log('Command:', this.ctx.getCommandPath())
 *     console.log('Options:', this.ctx.getOptions())
 *   }
 * }
 * ```
 */
export class CommanderExecutionContext {
  /**
   * @internal
   * Creates a new execution context.
   */
  constructor(
    private readonly command: CommandMetadata,
    private readonly commandPath: string,
    private readonly options: any,
  ) {}

  /**
   * Gets the command metadata.
   *
   * @returns The command metadata including path and options schema
   */
  getCommand(): CommandMetadata {
    return this.command
  }

  /**
   * Gets the command path that was invoked.
   *
   * @returns The command path (e.g., 'greet', 'user:create')
   */
  getCommandPath(): string {
    return this.commandPath
  }

  /**
   * Gets the validated command options.
   *
   * Options are validated against the command's Zod schema if one was provided.
   *
   * @returns The validated options object
   */
  getOptions(): any {
    return this.options
  }
}
