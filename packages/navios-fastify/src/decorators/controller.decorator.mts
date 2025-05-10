import type { ClassType } from '../service-locator/injection-token.mjs'

import { getControllerMetadata } from '../metadata/index.mjs'
import { InjectableScope } from '../service-locator/enums/injectable-scope.enum.mjs'
import { Injectable, InjectableType } from '../service-locator/index.mjs'
import { InjectionToken } from '../service-locator/injection-token.mjs'

export function Controller() {
  return function (target: ClassType, context: ClassDecoratorContext) {
    if (context.kind !== 'class') {
      throw new Error(
        '[Navios] @Controller decorator can only be used on classes.',
      )
    }
    const token = InjectionToken.create(target)
    if (context.metadata) {
      getControllerMetadata(target, context)
    }
    return Injectable({
      token,
      type: InjectableType.Class,
      scope: InjectableScope.Instance,
    })(target, context)
  }
}
