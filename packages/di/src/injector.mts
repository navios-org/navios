import type { Injectors } from './utils/index.mjs'

import { getInjectors } from './utils/index.mjs'

export const defaultInjectors = getInjectors()

export const asyncInject: Injectors['asyncInject'] =
  defaultInjectors.asyncInject

export const inject: Injectors['inject'] = defaultInjectors.inject

export const wrapSyncInit: Injectors['wrapSyncInit'] =
  defaultInjectors.wrapSyncInit

export const provideFactoryContext: Injectors['provideFactoryContext'] =
  defaultInjectors.provideFactoryContext
