import type { Injectors } from './utils/index.mjs'

import { globalRegistry } from './registry.mjs'
import { ServiceLocator } from './service-locator.mjs'
import { getInjectors } from './utils/index.mjs'

const globalServiceLocator: ServiceLocator = new ServiceLocator(globalRegistry)

export function getGlobalServiceLocator(): ServiceLocator {
  if (!globalServiceLocator) {
    throw new Error(
      '[ServiceLocator] Service locator is not initialized. Please provide the service locator before using the @Injectable decorator.',
    )
  }
  return globalServiceLocator
}
const values = getInjectors({
  baseLocator: globalServiceLocator,
})

export const inject: Injectors['inject'] = values.inject

export const syncInject: Injectors['syncInject'] = values.syncInject

export const wrapSyncInit: Injectors['wrapSyncInit'] = values.wrapSyncInit

export const provideServiceLocator: Injectors['provideServiceLocator'] =
  values.provideServiceLocator
