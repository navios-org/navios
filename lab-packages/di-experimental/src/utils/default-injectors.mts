import type { Injectors } from './get-injectors.mjs'

import { getInjectors } from './get-injectors.mjs'

export const defaultInjectors = getInjectors()

export const inject: Injectors['inject'] = defaultInjectors.inject
export const optional: Injectors['optional'] = defaultInjectors.optional
export const asyncInject: Injectors['asyncInject'] =
  defaultInjectors.asyncInject
export const wrapSyncInit: Injectors['wrapSyncInit'] =
  defaultInjectors.wrapSyncInit
export const provideFactoryContext: Injectors['provideFactoryContext'] =
  defaultInjectors.provideFactoryContext
