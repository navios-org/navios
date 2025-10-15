import type { ClassTypeWithInstance } from '@navios/di'

import { Container, inject, Injectable } from '@navios/di'

import type { CommandHandler, Module } from '../interfaces/index.mjs'
import type { CliModuleMetadata, CommandMetadata } from '../metadata/index.mjs'

import {
  extractCliModuleMetadata,
  extractCommandMetadata,
} from '../metadata/index.mjs'

export interface CommandWithMetadata {
  class: ClassTypeWithInstance<CommandHandler>
  metadata: CommandMetadata
}

@Injectable()
export class ModuleLoaderService {
  protected container = inject(Container)
  private modulesMetadata: Map<string, CliModuleMetadata> = new Map()
  private loadedModules: Map<string, any> = new Map()
  private commandsMetadata: Map<string, CommandWithMetadata> = new Map()
  private initialized = false

  async loadModules(appModule: ClassTypeWithInstance<Module>) {
    if (this.initialized) {
      return
    }
    await this.traverseModules(appModule)
    this.initialized = true
  }

  private async traverseModules(
    module: ClassTypeWithInstance<Module>,
    parentMetadata?: CliModuleMetadata,
  ) {
    const metadata = extractCliModuleMetadata(module)
    if (parentMetadata) {
      this.mergeMetadata(metadata, parentMetadata)
    }
    const moduleName = module.name
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
    const instance = await this.container.get(module)
    if (instance.onModuleInit) {
      await instance.onModuleInit()
    }
    this.loadedModules.set(moduleName, instance)
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

  getAllModules(): Map<string, CliModuleMetadata> {
    return this.modulesMetadata
  }

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

  dispose() {
    this.modulesMetadata.clear()
    this.loadedModules.clear()
    this.commandsMetadata.clear()
    this.initialized = false
  }
}
