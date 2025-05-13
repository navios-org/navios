/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { ServiceLocatorEventBus } from './service-locator-event-bus.mjs'
import type { ServiceLocator } from './service-locator.mjs'
import type { Injectors } from './utils/index.mjs'

export interface FactoryContext {
  inject: Injectors['inject']
  on: ServiceLocatorEventBus['on']
  getDependencies: () => string[]
  invalidate: () => void
  addEffect: (listener: () => void) => void
  getDestroyListeners: () => (() => void)[]
  setTtl: (ttl: number) => void
  getTtl: () => number
  locator: ServiceLocator
}
