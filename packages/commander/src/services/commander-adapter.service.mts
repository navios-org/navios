import type { ClassType, ModuleMetadata } from '@navios/core'

import {
  Container,
  inject,
  Injectable,
  InjectionToken,
  Logger,
} from '@navios/core'

import type { AbstractCliAdapterInterface } from '../interfaces/abstract-cli-adapter.interface.mjs'
import type { CommandHandler } from '../interfaces/command-handler.interface.mjs'
import type { CliAdapterOptions } from '../interfaces/environment.interface.mjs'
import type { CommandEntryValue } from '../metadata/command-entry.metadata.mjs'

import { HelpCommand } from '../commands/help.command.mjs'
import { CommanderExecutionContext } from '../interfaces/commander-execution-context.interface.mjs'
import { CommandEntryKey } from '../metadata/command-entry.metadata.mjs'
import {
  extractCommandMetadata,
  hasCommandMetadata,
} from '../metadata/index.mjs'
import { CommandExecutionContext } from '../tokens/index.mjs'
import { CliParserService } from './cli-parser.service.mjs'
import { CommandRegistryService } from './command-registry.service.mjs'

/**
 * CLI adapter service that implements the AbstractCliAdapterInterface.
 * Handles command discovery, registration, parsing, and execution.
 *
 * @public
 */
@Injectable()
export class CommanderAdapterService implements AbstractCliAdapterInterface {
  private container = inject(Container)
  private commandRegistry = inject(CommandRegistryService)
  private cliParser = inject(CliParserService)
  private logger = inject(Logger, { context: 'Commander' })

  private options: CliAdapterOptions = {}
  private isReady = false

  /**
   * Sets up the adapter with the provided options.
   * Called during application initialization.
   */
  async setupAdapter(options: CliAdapterOptions): Promise<void> {
    this.options = options ?? {}
  }

  /**
   * Called after all modules are loaded.
   * Iterates through modules and extracts commands from customEntries.
   */
  async onModulesInit(modules: Map<string, ModuleMetadata>): Promise<void> {
    // Register built-in help command
    this.registerBuiltInCommands()

    for (const [moduleName, metadata] of modules) {
      const commands = metadata.customEntries.get(CommandEntryKey) as
        | CommandEntryValue
        | undefined
      if (!commands) continue

      for (const commandClass of commands) {
        if (!hasCommandMetadata(commandClass)) {
          this.logger.warn(
            `Class ${commandClass.name} in module ${moduleName} ` +
              `is listed in commands but has no @Command decorator. Skipping.`,
          )
          continue
        }

        const commandMetadata = extractCommandMetadata(commandClass)
        this.commandRegistry.register(commandMetadata.path, {
          class: commandClass,
          metadata: commandMetadata,
          moduleName,
        })
      }
    }
  }

  /**
   * Registers built-in commands like help.
   */
  private registerBuiltInCommands(): void {
    const helpMetadata = extractCommandMetadata(HelpCommand)
    this.commandRegistry.register(helpMetadata.path, {
      class: HelpCommand,
      metadata: helpMetadata,
      moduleName: '@navios/commander',
    })
  }

  /**
   * Signals that the adapter is ready to handle commands.
   */
  async ready(): Promise<void> {
    this.isReady = true
  }

  /**
   * Disposes of the adapter and cleans up resources.
   */
  async dispose(): Promise<void> {
    this.commandRegistry.clear()
    this.isReady = false
  }

  /**
   * Run the CLI application with the given arguments.
   * Parses arguments and executes the matching command.
   */
  async run(argv: string[] = process.argv): Promise<void> {
    if (!this.isReady) {
      throw new Error('Adapter not ready. Call app.init() first.')
    }

    try {
      // Preliminary parse to find command
      const preliminaryParse = this.cliParser.parse(argv)

      // Handle --help or -h flags by showing help for the specific command
      if (preliminaryParse.options.help || preliminaryParse.options.h) {
        // If command is 'help', show general help
        // Otherwise show help for the specific command
        if (preliminaryParse.command === 'help') {
          await this.executeCommand('help', {})
        } else {
          await this.executeCommand('help', { command: preliminaryParse.command })
        }
        return
      }

      const command = this.commandRegistry.getByPath(preliminaryParse.command)

      // Re-parse with schema if available
      const parsed = command?.metadata.optionsSchema
        ? this.cliParser.parse(argv, command.metadata.optionsSchema)
        : preliminaryParse

      await this.executeCommand(parsed.command, parsed.options)
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Error: ${error.message}`)
        if (error.message.includes('Command not found')) {
          this.logger.log('')
          await this.executeCommand('help', {})
        }
      }
      throw error
    }
  }

  /**
   * Execute a command programmatically with the provided options.
   */
  async executeCommand(
    path: string,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    const command = this.commandRegistry.getByPath(path)
    if (!command) {
      throw new Error(`[Navios Commander] Command not found: ${path}`)
    }

    const { class: commandClass, metadata } = command

    // Validate options
    let validatedOptions = options
    if (metadata.optionsSchema) {
      validatedOptions = metadata.optionsSchema.parse(options)
    }

    // Create execution context
    const executionContext = new CommanderExecutionContext(
      metadata,
      path,
      validatedOptions,
    )

    // Begin request scope
    const requestId = `cmd-${Date.now()}-${Math.random().toString(36).substring(7)}`
    const scopeContainer = this.container.beginRequest(requestId)
    scopeContainer.addInstance(CommandExecutionContext, executionContext)

    try {
      const commandInstance = await scopeContainer.get<CommandHandler>(
        commandClass as unknown as InjectionToken<CommandHandler>,
      )

      if (!commandInstance.execute) {
        throw new Error(`Command ${path} does not implement execute method`)
      }

      await commandInstance.execute(validatedOptions)
    } finally {
      await scopeContainer.endRequest()
    }
  }

  /**
   * Get all registered command paths and their class references.
   */
  getAllCommands(): Array<{ path: string; class: ClassType }> {
    return this.commandRegistry.getAllAsArray()
  }
}
