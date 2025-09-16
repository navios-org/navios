import type { ServiceLocator } from './service-locator.mjs'
import type { Injectors } from './utils/index.mjs'

export interface FactoryContext {
  inject: Injectors['inject']
  locator: ServiceLocator
  addDestroyListener: (listener: () => void) => void
}
