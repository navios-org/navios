import type { ClassType, ClassTypeWithInstance } from '@navios/di'

import { Container, getInjectableToken, inject, Injectable } from '@navios/di'

import type { NaviosModule } from '../interfaces/index.mjs'
import type { ModuleMetadata } from '../metadata/index.mjs'

import { Logger } from '../logger/index.mjs'
import { extractModuleMetadata } from '../metadata/index.mjs'

/**
 * Extension definition for dynamically adding to the module tree.
 * Used by plugins to inject controllers or entire modules.
 */
export interface ModuleExtension {
  /**
   * Module class to add. If provided, the module and all its
   * controllers/imports will be processed.
   */
  module?: ClassTypeWithInstance<NaviosModule>

  /**
   * Controllers to add directly without a wrapper module.
   * Will be registered under a synthetic module named after the plugin.
   */
  controllers?: ClassType[]

  /**
   * Name for the synthetic module when using controllers directly.
   * Required if `controllers` is provided without `module`.
   */
  moduleName?: string
}

@Injectable()
export class ModuleLoaderService {
  private logger = inject(Logger, {
    context: ModuleLoaderService.name,
  })
  protected container = inject(Container)
  private modulesMetadata: Map<string, ModuleMetadata> = new Map()
  private loadedModules: Map<string, any> = new Map()
  private initialized = false

  async loadModules(appModule: ClassTypeWithInstance<NaviosModule>) {
    if (this.initialized) {
      return
    }
    await this.traverseModules(appModule)
    this.initialized = true
  }

  /**
   * Extends the module tree with additional modules or controllers.
   *
   * This method is designed to be called by plugins during registration,
   * which happens after initial module loading but before route registration.
   *
   * @param extensions - Array of module extensions to add
   * @throws Error if not initialized (loadModules must be called first)
   *
   * @example
   * ```typescript
   * // In plugin registration
   * const moduleLoader = await context.container.get(ModuleLoaderService)
   * await moduleLoader.extendModules([{
   *   controllers: [OpenApiJsonController, OpenApiYamlController],
   *   moduleName: 'OpenApiBunModule',
   * }])
   * ```
   */
  async extendModules(extensions: ModuleExtension[]): Promise<void> {
    if (!this.initialized) {
      throw new Error(
        'ModuleLoaderService must be initialized before extending. Call loadModules() first.',
      )
    }

    for (const extension of extensions) {
      if (extension.module) {
        // Process a full module with its imports and controllers
        await this.traverseModules(extension.module)
      } else if (extension.controllers && extension.moduleName) {
        // Create synthetic module metadata for loose controllers
        await this.registerControllers(
          extension.controllers,
          extension.moduleName,
        )
      } else if (extension.controllers) {
        throw new Error(
          'moduleName is required when providing controllers without a module',
        )
      }
    }
  }

  /**
   * Registers controllers under a synthetic module.
   * Used when plugins want to add controllers without a full module class.
   */
  private async registerControllers(
    controllers: ClassType[],
    moduleName: string,
  ): Promise<void> {
    if (this.modulesMetadata.has(moduleName)) {
      // Merge controllers into existing module
      const existing = this.modulesMetadata.get(moduleName)!
      for (const controller of controllers) {
        existing.controllers.add(controller)
      }
      this.logger.debug(
        `Extended module ${moduleName} with ${controllers.length} controllers`,
      )
    } else {
      // Create new synthetic module metadata
      const metadata: ModuleMetadata = {
        controllers: new Set(controllers),
        imports: new Set(),
        guards: new Set(),
        overrides: new Set(),
        customAttributes: new Map(),
        customEntries: new Map(),
      }
      this.modulesMetadata.set(moduleName, metadata)

      this.logger.debug(
        `Created module ${moduleName} with ${controllers.length} controllers`,
      )
    }
  }

  private async traverseModules(
    module: ClassTypeWithInstance<NaviosModule>,
    parentMetadata?: ModuleMetadata,
  ) {
    const metadata = extractModuleMetadata(module)
    if (parentMetadata) {
      this.mergeMetadata(metadata, parentMetadata)
    }
    const moduleToken = getInjectableToken(module)
    const moduleName = moduleToken.id
    if (this.modulesMetadata.has(moduleName)) {
      return
    }
    try {
      this.modulesMetadata.set(moduleName, metadata)
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
      this.logger.debug(`Module ${moduleName} loaded`)
      this.loadedModules.set(moduleName, instance)
    } catch (error) {
      this.logger.error(`Error loading module ${moduleName}`, error)
      throw error
    }
  }

  private validateOverrides(
    metadata: ModuleMetadata,
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
            `[Navios] Override ${overrideClass.name} in module ${moduleName} is not registered. ` +
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
              `[Navios] Override ${overrideClass.name} in module ${moduleName} is registered ` +
                `but not found in registry for token ${overrideToken.toString()}.`,
            )
          } else {
            this.logger.warn(
              `[Navios] Override ${overrideClass.name} in module ${moduleName} is not active. ` +
                `Current active service: ${highestPriorityRegistration.target.name} ` +
                `(priority: ${highestPriorityRegistration.priority}). ` +
                `Override priority: ${overrideRegistration.priority}. ` +
                `Override needs higher priority to take effect.`,
            )
          }
        } else {
          this.logger.debug(
            `[Navios] Override ${overrideClass.name} in module ${moduleName} is active ` +
              `(priority: ${highestPriorityRegistration.priority})`,
          )
        }
      } catch (error) {
        this.logger.warn(
          `[Navios] Failed to validate override ${overrideClass.name} in module ${moduleName}: ${error}`,
        )
      }
    }
  }

  private mergeMetadata(
    metadata: ModuleMetadata,
    parentMetadata: ModuleMetadata,
  ): void {
    if (parentMetadata.guards) {
      for (const guard of parentMetadata.guards) {
        metadata.guards.add(guard)
      }
    }
    if (parentMetadata.customAttributes) {
      for (const [key, value] of parentMetadata.customAttributes) {
        if (metadata.customAttributes.has(key)) {
          continue
        }
        metadata.customAttributes.set(key, value)
      }
    }
  }
  getAllModules(): Map<string, ModuleMetadata> {
    return this.modulesMetadata
  }
  dispose() {
    this.modulesMetadata.clear()
    this.loadedModules.clear()
    this.initialized = false
  }
}
