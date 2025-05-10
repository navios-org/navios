import type { ClassType } from '../service-locator/index.mjs'

import { getControllerMetadata } from '../metadata/index.mjs'
import {
  Injectable,
  InjectableScope,
  InjectableType,
  InjectionToken,
} from '../service-locator/index.mjs'

export interface ControllerOptions {
  guards?: ClassType[] | Set<ClassType>
}
export function Controller({ guards }: ControllerOptions = {}) {
  return function (target: ClassType, context: ClassDecoratorContext) {
    if (context.kind !== 'class') {
      throw new Error(
        '[Navios] @Controller decorator can only be used on classes.',
      )
    }
    const token = InjectionToken.create(target)
    if (context.metadata) {
      const controllerMetadata = getControllerMetadata(target, context)
      if (guards) {
        for (const guard of Array.from(guards).reverse()) {
          controllerMetadata.guards.add(guard)
        }
      }
    }
    return Injectable({
      token,
      type: InjectableType.Class,
      scope: InjectableScope.Instance,
    })(target, context)
  }
}
