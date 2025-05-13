import { ServiceLocator } from './service-locator.mjs'
import { getInjectors } from './utils/index.mjs'

const globalServiceLocator: ServiceLocator = new ServiceLocator()

export function getGlobalServiceLocator(): ServiceLocator {
  if (!globalServiceLocator) {
    throw new Error(
      '[ServiceLocator] Service locator is not initialized. Please provide the service locator before using the @Injectable decorator.',
    )
  }
  return globalServiceLocator
}
const { inject, syncInject, wrapSyncInit, provideServiceLocator } =
  getInjectors({
    baseLocator: globalServiceLocator,
  })

export { inject, syncInject, wrapSyncInit, provideServiceLocator }
