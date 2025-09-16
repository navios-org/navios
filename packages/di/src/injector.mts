import type { ClassType, InjectionTokenType } from './injection-token.mjs'
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
    inject(token: ClassType | InjectionTokenType, args?: unknown) {
      let injectionToken = token
      if (typeof token === 'function') {
        injectionToken = getInjectableToken(token)
      }
      return serviceLocator.getOrThrowInstance(
        injectionToken as InjectionTokenType,
        args,
      )
    },
    locator: serviceLocator,
    addDestroyListener: () => {},
  })
}
