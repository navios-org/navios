import type { ClassTypeWithInstance, InjectionToken } from '@navios/di'

import { Container, inject, Injectable } from '@navios/di'

import type { CommandHandler, Module } from './interfaces/index.mjs'

import { CommanderExecutionContext } from './interfaces/index.mjs'
import { CliParserService, ModuleLoaderService } from './services/index.mjs'
import { ExecutionContext } from './tokens/index.mjs'

export interface CommanderApplicationOptions {}

@Injectable()
export class CommanderApplication {
  private moduleLoader = inject(ModuleLoaderService)
  private cliParser = inject(CliParserService)
  protected container = inject(Container)

  private appModule: ClassTypeWithInstance<Module> | null = null
  private options: CommanderApplicationOptions = {}

  isInitialized = false

  async setup(
    appModule: ClassTypeWithInstance<Module>,
    options: CommanderApplicationOptions = {},
  ) {
    this.appModule = appModule
    this.options = options
  }

  getContainer() {
    return this.container
  }

  async init() {
    if (!this.appModule) {
      throw new Error(
        '[Navios Commander] App module is not set. Call setup() first.',
      )
    }
    await this.moduleLoader.loadModules(this.appModule)
    this.isInitialized = true
  }

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
    const requestContext = this.container.beginRequest(requestId)
    requestContext.addInstance(ExecutionContext, executionContext)

    try {
      // Set current request context
      this.container.setCurrentRequestContext(requestId)

      // Get command instance and execute
      const commandInstance = await this.container.get<CommandHandler>(
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
      await this.container.endRequest(requestId)
    }
  }

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
   * Runs the CLI application by parsing process.argv and executing the command
   * @param argv - Command-line arguments (defaults to process.argv)
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

  async dispose() {
    if (this.moduleLoader) {
      this.moduleLoader.dispose()
    }
  }

  async close() {
    await this.dispose()
  }
}
