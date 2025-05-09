import type { ModuleMetadata } from '../decorators/module.decorator.mjs'
import type {
  ClassType,
  ClassTypeWithInstance,
} from '../service-locator/index.mjs'

import { getModuleMetadata } from '../decorators/module.decorator.mjs'
import { inject, Injectable } from '../service-locator/index.mjs'

export interface ModuleInstance {
  onModuleInit?: () => Promise<void>
}

@Injectable()
export class ModuleLoaderService {
  private modulesMetadata: Map<string, ModuleMetadata> = new Map()
  private loadedModules: Map<string, any> = new Map()
  private initialized = false

  async loadModules(appModule: ClassTypeWithInstance<ModuleInstance>) {
    if (this.initialized) {
      return
    }
    await this.traverseModules(appModule)
    this.initialized = true
  }

  async traverseModules(module: ClassTypeWithInstance<ModuleInstance>) {
    const metadata = getModuleMetadata(module)
    const moduleName = module.name
    if (this.modulesMetadata.has(moduleName)) {
      return
    }
    this.modulesMetadata.set(moduleName, metadata)
    const imports = metadata.imports ?? []
    const loadingPromises = imports.map(async (importedModule) =>
      this.traverseModules(importedModule),
    )
    await Promise.all(loadingPromises)
    const instance = await inject(module)
    if (instance.onModuleInit) {
      await instance.onModuleInit()
    }
    this.loadedModules.set(moduleName, instance)
  }

  getAllModules(): Map<string, ModuleMetadata> {
    return this.modulesMetadata
  }
}
