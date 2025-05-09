import type { ClassType } from '../service-locator/injection-token.mjs'

import { InjectableScope } from '../service-locator/enums/injectable-scope.enum.mjs'
import { Injectable, InjectableType } from '../service-locator/index.mjs'
import { InjectionToken } from '../service-locator/injection-token.mjs'

export interface ModuleMetadata {
  controllers?: ClassType[]
  imports?: ClassType[]
}

export const ModuleMetadataKey = Symbol('ModuleMetadataKey')

export function Module(metadata: ModuleMetadata) {
  return (target: ClassType, context: ClassDecoratorContext) => {
    if (context.kind !== 'class') {
      throw new Error('[Navios] @Module decorator can only be used on classes.')
    }
    // Register the module in the service locator
    const token = InjectionToken.create(target)

    if (context.metadata) {
      // @ts-expect-error We add a custom metadata key to the target
      target[ModuleMetadataKey] = {
        controllers: metadata.controllers ?? [],
        imports: metadata.imports ?? [],
      } satisfies ModuleMetadata
    }
    return Injectable({
      token,
      type: InjectableType.Class,
      scope: InjectableScope.Singleton,
    })(target, context)
  }
}

export function getModuleMetadata(target: ClassType): ModuleMetadata {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[ModuleMetadataKey]
  if (!metadata) {
    throw new Error('[Navios] @Module decorator is not used on this class.')
  }
  return metadata
}
