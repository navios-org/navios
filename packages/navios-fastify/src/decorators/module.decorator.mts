import type { ClassType } from '../service-locator/injection-token.mjs'

import { getModuleMetadata } from '../metadata/index.mjs'
import { InjectableScope } from '../service-locator/enums/injectable-scope.enum.mjs'
import { Injectable, InjectableType } from '../service-locator/index.mjs'
import { InjectionToken } from '../service-locator/injection-token.mjs'

export interface ModuleOptions {
  controllers?: ClassType[] | Set<ClassType>
  imports?: ClassType[] | Set<ClassType>
  guards?: ClassType[] | Set<ClassType>
}

export function Module(metadata: ModuleOptions) {
  return (target: ClassType, context: ClassDecoratorContext) => {
    if (context.kind !== 'class') {
      throw new Error('[Navios] @Module decorator can only be used on classes.')
    }
    // Register the module in the service locator
    const token = InjectionToken.create(target)
    const moduleMetadata = getModuleMetadata(target, context)
    if (metadata.controllers) {
      for (const controller of metadata.controllers) {
        moduleMetadata.controllers.add(controller)
      }
    }
    if (metadata.imports) {
      for (const importedModule of metadata.imports) {
        moduleMetadata.imports.add(importedModule)
      }
    }
    if (metadata.guards) {
      for (const guard of Array.from(metadata.guards).reverse()) {
        moduleMetadata.guards.add(guard)
      }
    }

    return Injectable({
      token,
      type: InjectableType.Class,
      scope: InjectableScope.Singleton,
    })(target, context)
  }
}
