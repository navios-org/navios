import type { ClassType } from '@navios/di'

import { Injectable, InjectableScope, InjectionToken } from '@navios/di'

import { getControllerMetadata } from '../metadata/index.mjs'

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
      scope: InjectableScope.Instance,
    })(target, context)
  }
}
