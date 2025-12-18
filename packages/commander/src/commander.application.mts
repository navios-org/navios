import type {
  ClassTypeWithInstance,
  InjectionToken,
  NaviosModule,
} from '@navios/core'

import { Container, inject, Injectable } from '@navios/core'

import type { CommandHandler } from './interfaces/index.mjs'

import { CommanderExecutionContext } from './interfaces/index.mjs'
import { CliModuleLoaderService, CliParserService } from './services/index.mjs'
import { CommandExecutionContext } from './tokens/index.mjs'

/**
 * Configuration options for CommanderApplication.
 *
 * @public
 */
export interface CommanderApplicationOptions {}

/**
 * Main application class for managing CLI command execution.
 *
 * This class handles module loading, command registration, and command execution.
 * It provides both programmatic and CLI-based command execution capabilities.
 *
 * @example
 * ```typescript
 * const app = await CommanderFactory.create(AppModule)
 * await app.init()
 * await app.run(process.argv)
 * ```
 */
@Injectable()
export class CommanderApplication {
  private moduleLoader = inject(CliModuleLoaderService)
  private cliParser = inject(CliParserService)
  protected container = inject(Container)

  private appModule: ClassTypeWithInstance<NaviosModule> | null = null
  private options: CommanderApplicationOptions = {}

  /**
   * Indicates whether the application has been initialized.
   * Set to `true` after `init()` is called successfully.
   */
  isInitialized = false

  /**
   * @internal
   * Sets up the application with the provided module and options.
   * This is called automatically by CommanderFactory.create().
   */
  async setup(
    appModule: ClassTypeWithInstance<NaviosModule>,
    options: CommanderApplicationOptions = {},
  ) {
    this.appModule = appModule
    this.options = options
  }

  /**
   * Gets the dependency injection container used by this application.
   *
   * @returns The Container instance
   *
   * @example
   * ```typescript
   * const container = app.getContainer()
   * const service = await container.get(MyService)
   * ```
   */
  getContainer() {
    return this.container
  }

  /**
   * Initializes the application by loading all modules and registering commands.
   *
   * This method must be called before executing commands or running the CLI.
   * It traverses the module tree, loads all imported modules, and collects command metadata.
   *
   * @throws {Error} If the app module is not set (setup() was not called)
   *
   * @example
   * ```typescript
   * const app = await CommanderFactory.create(AppModule)
   * await app.init() // Must be called before run() or executeCommand()
   * ```
   */
  async init() {
    if (!this.appModule) {
      throw new Error(
        '[Navios Commander] App module is not set. Call setup() first.',
      )
    }
    await this.moduleLoader.loadModules(this.appModule)
    this.isInitialized = true
  }

  /**
   * Executes a command programmatically with the provided options.
   *
   * This method is useful for testing, automation, or programmatic workflows.
   * The options will be validated against the command's Zod schema if one is provided.
   *
   * @param commandPath - The command path (e.g., 'greet', 'user:create')
   * @param options - The command options object (will be validated if schema exists)
   * @throws {Error} If the application is not initialized
   * @throws {Error} If the command is not found
   * @throws {Error} If the command does not implement the execute method
   * @throws {ZodError} If options validation fails
   *
   * @example
   * ```typescript
   * await app.executeCommand('greet', {
   *   name: 'World',
   *   greeting: 'Hi'
   * })
   * ```
   */
  async executeCommand(commandPath: string, options: any = {}) {
    if (!this.isInitialized) {
      throw new Error(
        '[Navios Commander] Application is not initialized. Call init() first.',
      )
    }

    // Use pre-collected command metadata from module loading
    const commandWithMetadata = this.moduleLoader.getCommandByPath(commandPath)

    if (!commandWithMetadata) {
      throw new Error(`[Navios Commander] Command not found: ${commandPath}`)
    }

    const { class: commandClass, metadata } = commandWithMetadata

    // Validate options with zod schema if provided
    let validatedOptions = options
    if (metadata.optionsSchema) {
      validatedOptions = metadata.optionsSchema.parse(options)
    }

    // Create execution context and provide it to the container
    const executionContext = new CommanderExecutionContext(
      metadata,
      commandPath,
      validatedOptions,
    )

    // Generate a unique request ID for this command execution
    const requestId = `cmd-${Date.now()}-${Math.random().toString(36).substring(7)}`

    // Begin request context and add ExecutionContext
    const scopeContainer = this.container.beginRequest(requestId)
    scopeContainer.addInstance(CommandExecutionContext, executionContext)

    try {
      // Get command instance and execute
      const commandInstance = await scopeContainer.get<CommandHandler>(
        commandClass as unknown as InjectionToken<CommandHandler>,
      )

      if (!commandInstance.execute) {
        throw new Error(
          `[Navios Commander] Command ${commandPath} does not implement execute method`,
        )
      }

      await commandInstance.execute(validatedOptions)
    } finally {
      // Clean up request context
      await scopeContainer.endRequest()
    }
  }

  /**
   * Gets all registered commands with their paths and class references.
   *
   * @returns An array of objects containing the command path and class
   *
   * @example
   * ```typescript
   * const commands = app.getAllCommands()
   * commands.forEach(({ path }) => {
   *   console.log(`Available: ${path}`)
   * })
   * ```
   */
  getAllCommands() {
    // Use pre-collected command metadata from module loading
    const commandsMap = this.moduleLoader.getAllCommandsWithMetadata()
    const commandsWithMetadata: Array<{
      path: string
      class: ClassTypeWithInstance<any>
    }> = []

    for (const [, { class: cmd, metadata }] of commandsMap) {
      commandsWithMetadata.push({
        path: metadata.path,
        class: cmd,
      })
    }

    return commandsWithMetadata
  }

  /**
   * Runs the CLI application by parsing command-line arguments and executing the appropriate command.
   *
   * This is the main entry point for CLI usage. It parses `argv`, validates options,
   * and executes the matching command. Supports help command (`help`, `--help`, `-h`)
   * which displays all available commands.
   *
   * @param argv - Command-line arguments array (defaults to `process.argv`)
   * @throws {Error} If the application is not initialized
   * @throws {Error} If no command is provided
   * @throws {Error} If the command is not found
   * @throws {ZodError} If options validation fails
   *
   * @example
   * ```typescript
   * // Parse and execute from process.argv
   * await app.run()
   *
   * // Or provide custom arguments
   * await app.run(['node', 'cli.js', 'greet', '--name', 'World'])
   * ```
   */
  async run(argv: string[] = process.argv) {
    if (!this.isInitialized) {
      throw new Error(
        '[Navios Commander] Application is not initialized. Call init() first.',
      )
    }

    try {
      // First, try to extract the command path to get its schema
      // We need to do a preliminary parse to find the command
      const preliminaryParse = this.cliParser.parse(argv)
      const commandWithMetadata = this.moduleLoader.getCommandByPath(
        preliminaryParse.command,
      )

      // Re-parse with schema if available
      const parsed = commandWithMetadata?.metadata.optionsSchema
        ? this.cliParser.parse(argv, commandWithMetadata.metadata.optionsSchema)
        : preliminaryParse

      // Handle special commands
      if (
        parsed.command === 'help' ||
        parsed.options.help ||
        parsed.options.h
      ) {
        const commands = this.getAllCommands()
        console.log(this.cliParser.formatCommandList(commands))
        return
      }

      // Execute the command
      await this.executeCommand(parsed.command, parsed.options)
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`)

        // Show available commands on error
        if (error.message.includes('Command not found')) {
          console.log(
            '\n' + this.cliParser.formatCommandList(this.getAllCommands()),
          )
        }
      }
      throw error
    }
  }

  /**
   * @internal
   * Disposes of resources used by the application.
   */
  async dispose() {
    if (this.moduleLoader) {
      this.moduleLoader.dispose()
    }
  }

  /**
   * Closes the application and cleans up resources.
   *
   * This should be called when the application is no longer needed to free up resources.
   *
   * @example
   * ```typescript
   * await app.run(process.argv)
   * await app.close()
   * ```
   */
  async close() {
    await this.dispose()
  }
}
