import type { ServiceLocator } from './service-locator.mjs'
import type { Injectors } from './utils/index.mjs'

import { getInjectableToken, getInjectors } from './utils/index.mjs'

const values = getInjectors()

export const inject: Injectors['inject'] = values.inject

export const syncInject: Injectors['syncInject'] = values.syncInject

export const wrapSyncInit: Injectors['wrapSyncInit'] = values.wrapSyncInit

export const provideFactoryContext: Injectors['provideFactoryContext'] =
  values.provideFactoryContext

export function dangerouslySetGlobalFactoryContext(
  serviceLocator: ServiceLocator,
) {
  values.provideFactoryContext({
    // @ts-expect-error This is correct type
    inject(
      token:
        | ClassType
        | InjectionToken<any, any>
        | BoundInjectionToken<any, any>
        | FactoryInjectionToken<any, any>,
      args?: unknown,
    ) {
      let injectionToken = token
      if (typeof token === 'function') {
        injectionToken = getInjectableToken(token)
      }
      return serviceLocator.getOrThrowInstance(injectionToken, args)
    },
    locator: serviceLocator,
    addDestroyListener: () => {},
  })
}
