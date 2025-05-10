import type { CanActivate } from '../interfaces/index.mjs'
import type {
  ClassType,
  ClassTypeWithInstance,
  InjectionToken,
} from '../service-locator/index.mjs'

import {
  getControllerMetadata,
  getEndpointMetadata,
} from '../metadata/index.mjs'

export function UseGuards(
  ...guards: (
    | ClassTypeWithInstance<CanActivate>
    | InjectionToken<CanActivate, undefined>
  )[]
) {
  return function <T extends Function>(
    target: T,
    context: ClassMethodDecoratorContext | ClassDecoratorContext,
  ): T {
    if (context.kind === 'class') {
      const controllerMetadata = getControllerMetadata(
        target as unknown as ClassType,
        context,
      )
      for (const guard of guards.reverse()) {
        controllerMetadata.guards.add(guard)
      }
    } else if (context.kind === 'method') {
      const endpointMetadata = getEndpointMetadata(target, context)
      for (const guard of guards.reverse()) {
        endpointMetadata.guards.add(guard)
      }
    } else {
      throw new Error(
        '[Navios] @UseGuards decorator can only be used on classes or methods.',
      )
    }
    return target
  }
}
