import type { ClassType } from '../service-locator/index.mjs'

import { getModuleMetadata } from '../metadata/index.mjs'
import {
  Injectable,
  InjectableScope,
  InjectionToken,
} from '../service-locator/index.mjs'

export interface ModuleOptions {
  controllers?: ClassType[] | Set<ClassType>
  imports?: ClassType[] | Set<ClassType>
  guards?: ClassType[] | Set<ClassType>
}

export function Module(
  { controllers = [], imports = [], guards = [] }: ModuleOptions = {
    controllers: [],
    imports: [],
    guards: [],
  },
) {
  return (target: ClassType, context: ClassDecoratorContext) => {
    if (context.kind !== 'class') {
      throw new Error('[Navios] @Module decorator can only be used on classes.')
    }
    // Register the module in the service locator
    const token = InjectionToken.create(target)
    const moduleMetadata = getModuleMetadata(target, context)
    for (const controller of controllers) {
      moduleMetadata.controllers.add(controller)
    }
    for (const importedModule of imports) {
      moduleMetadata.imports.add(importedModule)
    }
    for (const guard of Array.from(guards).reverse()) {
      moduleMetadata.guards.add(guard)
    }

    return Injectable({
      token,
      scope: InjectableScope.Singleton,
    })(target, context)
  }
}
