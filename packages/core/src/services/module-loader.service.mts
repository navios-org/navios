import type { ClassTypeWithInstance } from '@navios/di'

import { inject, Injectable, syncInject } from '@navios/di'

import type { NaviosModule } from '../interfaces/index.mjs'
import type { ModuleMetadata } from '../metadata/index.mjs'

import { Logger } from '../logger/index.mjs'
import { extractModuleMetadata } from '../metadata/index.mjs'

@Injectable()
export class ModuleLoaderService {
  private logger = syncInject(Logger, {
    context: ModuleLoaderService.name,
  })
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

  private async traverseModules(
    module: ClassTypeWithInstance<NaviosModule>,
    parentMetadata?: ModuleMetadata,
  ) {
    const metadata = extractModuleMetadata(module)
    if (parentMetadata) {
      this.mergeMetadata(metadata, parentMetadata)
    }
    const moduleName = module.name
    if (this.modulesMetadata.has(moduleName)) {
      return
    }
    this.modulesMetadata.set(moduleName, metadata)
    const imports = metadata.imports ?? new Set()
    const loadingPromises = Array.from(imports).map(async (importedModule) =>
      this.traverseModules(importedModule, metadata),
    )
    await Promise.all(loadingPromises)
    const instance = await inject(module)
    if (instance.onModuleInit) {
      await instance.onModuleInit()
    }
    this.logger.debug(`Module ${moduleName} loaded`)
    this.loadedModules.set(moduleName, instance)
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
