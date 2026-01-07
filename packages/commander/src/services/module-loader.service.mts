import type { ClassTypeWithInstance, NaviosModule } from '@navios/core'

import {
  Container,
  getInjectableToken,
  inject,
  Injectable,
  Logger,
} from '@navios/core'

import type { CommandHandler } from '../interfaces/index.mjs'
import type { CliModuleMetadata, CommandMetadata } from '../metadata/index.mjs'

import {
  extractCliModuleMetadata,
  extractCommandMetadata,
} from '../metadata/index.mjs'

/**
 * Command class with its associated metadata.
 *
 * @public
 */
export interface CommandWithMetadata {
  /**
   * The command class constructor.
   */
  class: ClassTypeWithInstance<CommandHandler>
  /**
   * The command metadata including path and options schema.
   */
  metadata: CommandMetadata
}

/**
 * Service for loading and managing CLI modules and commands.
 *
 * Handles module traversal, command registration, and metadata collection.
 * This service is used internally by CommanderApplication.
 *
 * @public
 */
@Injectable()
export class CliModuleLoaderService {
  private logger = inject(Logger, {
    context: CliModuleLoaderService.name,
  })
  protected container = inject(Container)
  private modulesMetadata: Map<string, CliModuleMetadata> = new Map()
  private loadedModules: Map<string, any> = new Map()
  private commandsMetadata: Map<string, CommandWithMetadata> = new Map()
  private initialized = false

  /**
   * Loads all modules starting from the root app module.
   *
   * Traverses the module tree, loads imported modules, and collects command metadata.
   *
   * @param appModule - The root CLI module
   */
  async loadModules(appModule: ClassTypeWithInstance<NaviosModule>) {
    if (this.initialized) {
      return
    }
    await this.traverseModules(appModule)
    this.initialized = true
  }

  private async traverseModules(
    module: ClassTypeWithInstance<NaviosModule>,
    parentMetadata?: CliModuleMetadata,
  ) {
    const metadata = extractCliModuleMetadata(module)
    if (parentMetadata) {
      this.mergeMetadata(metadata, parentMetadata)
    }
    const moduleToken = getInjectableToken(module)
    const moduleName = moduleToken.id
    if (this.modulesMetadata.has(moduleName)) {
      return
    }
    this.modulesMetadata.set(moduleName, metadata)

    // Collect command metadata during module loading
    for (const command of metadata.commands) {
      const commandMetadata = extractCommandMetadata(command)
      this.commandsMetadata.set(commandMetadata.path, {
        class: command,
        metadata: commandMetadata,
      })
    }

    const imports = metadata.imports ?? new Set()
    const loadingPromises = Array.from(imports).map(async (importedModule) =>
      this.traverseModules(importedModule, metadata),
    )
    await Promise.all(loadingPromises)
    this.validateOverrides(metadata, moduleName)
    const instance = await this.container.get(module)
    if (instance.onModuleInit) {
      await instance.onModuleInit()
    }
    this.loadedModules.set(moduleName, instance)
  }

  private validateOverrides(
    metadata: CliModuleMetadata,
    moduleName: string,
  ): void {
    if (!metadata.overrides || metadata.overrides.size === 0) {
      return
    }

    const registry = this.container.getRegistry()

    for (const overrideClass of metadata.overrides) {
      try {
        // Get the token for the override class
        const overrideToken = getInjectableToken(overrideClass)

        // Get all registrations for this token (sorted by priority, highest first)
        const allRegistrations = registry.getAll(overrideToken)

        if (allRegistrations.length === 0) {
          this.logger.warn(
            `[Navios Commander] Override ${overrideClass.name} in module ${moduleName} is not registered. ` +
              `Make sure it has @Injectable decorator.`,
          )
          continue
        }

        // Check if the override class has the highest priority
        const highestPriorityRegistration = allRegistrations[0]
        if (highestPriorityRegistration.target !== overrideClass) {
          const overrideRegistration = allRegistrations.find(
            (r) => r.target === overrideClass,
          )

          if (!overrideRegistration) {
            this.logger.warn(
              `[Navios Commander] Override ${overrideClass.name} in module ${moduleName} is registered ` +
                `but not found in registry for token ${overrideToken.toString()}.`,
            )
          } else {
            this.logger.warn(
              `[Navios Commander] Override ${overrideClass.name} in module ${moduleName} is not active. ` +
                `Current active service: ${highestPriorityRegistration.target.name} ` +
                `(priority: ${highestPriorityRegistration.priority}). ` +
                `Override priority: ${overrideRegistration.priority}. ` +
                `Override needs higher priority to take effect.`,
            )
          }
        } else {
          this.logger.debug(
            `[Navios Commander] Override ${overrideClass.name} in module ${moduleName} is active ` +
              `(priority: ${highestPriorityRegistration.priority})`,
          )
        }
      } catch (error) {
        this.logger.warn(
          `[Navios Commander] Failed to validate override ${overrideClass.name} in module ${moduleName}: ${error}`,
        )
      }
    }
  }

  private mergeMetadata(
    metadata: CliModuleMetadata,
    parentMetadata: CliModuleMetadata,
  ): void {
    if (parentMetadata.customAttributes) {
      for (const [key, value] of parentMetadata.customAttributes) {
        if (metadata.customAttributes.has(key)) {
          continue
        }
        metadata.customAttributes.set(key, value)
      }
    }
  }

  /**
   * Gets all loaded module metadata.
   *
   * @returns Map of module names to their metadata
   */
  getAllModules(): Map<string, CliModuleMetadata> {
    return this.modulesMetadata
  }

  /**
   * Gets all command classes indexed by command class name.
   *
   * @returns Map of command class names to command classes
   */
  getAllCommands(): Map<string, ClassTypeWithInstance<any>> {
    const commands = new Map<string, ClassTypeWithInstance<any>>()
    for (const metadata of this.modulesMetadata.values()) {
      for (const command of metadata.commands) {
        commands.set(command.name, command)
      }
    }
    return commands
  }

  /**
   * Get all commands with their metadata, indexed by command path.
   * This is populated during loadModules, so path information is available
   * before parsing CLI argv.
   */
  getAllCommandsWithMetadata(): Map<string, CommandWithMetadata> {
    return this.commandsMetadata
  }

  /**
   * Get a command by its path, with metadata already extracted.
   * Returns undefined if command is not found.
   */
  getCommandByPath(path: string): CommandWithMetadata | undefined {
    return this.commandsMetadata.get(path)
  }

  /**
   * Disposes of all loaded modules and commands, clearing internal state.
   */
  dispose() {
    this.modulesMetadata.clear()
    this.loadedModules.clear()
    this.commandsMetadata.clear()
    this.initialized = false
  }
}
