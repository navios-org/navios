import type { AbstractAdapterInterface } from '@navios/core'

/**
 * Interface for CLI adapters.
 * Extends the base adapter interface with CLI-specific methods.
 *
 * @public
 */
export interface AbstractCliAdapterInterface extends AbstractAdapterInterface {
  /**
   * Run the CLI application with the given arguments.
   * Parses arguments and executes the matching command.
   *
   * @param argv - Command-line arguments array (defaults to `process.argv`)
   *
   * @example
   * ```typescript
   * const adapter = app.getAdapter() as AbstractCliAdapterInterface
   * await adapter.run(process.argv)
   * ```
   */
  run(argv?: string[]): Promise<void>

  /**
   * Execute a command programmatically with the provided options.
   *
   * @param path - The command path (e.g., 'greet', 'user:create')
   * @param options - The command options object
   *
   * @example
   * ```typescript
   * await adapter.executeCommand('user:create', {
   *   name: 'John',
   *   email: 'john@example.com',
   * })
   * ```
   */
  executeCommand(path: string, options: Record<string, unknown>): Promise<void>

  /**
   * Get all registered command paths and their class references.
   *
   * @returns Array of objects containing path and class
   *
   * @example
   * ```typescript
   * const commands = adapter.getAllCommands()
   * commands.forEach(({ path }) => console.log(path))
   * ```
   */
  getAllCommands(): Array<{ path: string; class: unknown }>
}
