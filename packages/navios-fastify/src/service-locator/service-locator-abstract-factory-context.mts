/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { AnyZodObject, z } from 'zod'

import type { inject } from './inject.mjs'
import type { InjectionToken } from './injection-token.mjs'
import type { ServiceLocatorEventBus } from './service-locator-event-bus.mjs'

export interface ServiceLocatorAbstractFactoryContext {
  inject: typeof inject
  addDependency:
    | ((token: InjectionToken<any, undefined>) => void)
    | (<S extends AnyZodObject>(
        token: InjectionToken<any, S>,
        args: z.input<S>,
      ) => void)
  on: ServiceLocatorEventBus['on']
  getDependencies: () => string[]
  invalidate: () => void
  addEffect: (listener: () => void) => void
  getDestroyListeners: () => (() => void)[]
  setTtl: (ttl: number) => void
  getTtl: () => number
}
