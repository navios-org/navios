import type { ClassType, InjectionToken } from './injection-token.mjs'

import { getServiceLocator } from './injector.mjs'

/**
 * Useful for tests or when you want to override a service
 * with a different implementation.
 */
export function override<T>(token: InjectionToken<T>, target: ClassType) {
  const serviceLocator = getServiceLocator()
  const originalDefinition = serviceLocator['abstractFactories'].get(token)
  serviceLocator.registerAbstractFactory(token, async (ctx, args: any) => {
    const builder = new target()
    return builder.create(ctx, args)
  })

  return () => {
    if (originalDefinition) {
      serviceLocator.registerAbstractFactory(token, originalDefinition)
    }
  }
}
