import type { Injectors } from './utils/index.mjs'

import { getInjectors } from './utils/index.mjs'

const values = getInjectors()

export const inject: Injectors['inject'] = values.inject

export const syncInject: Injectors['syncInject'] = values.syncInject

export const wrapSyncInit: Injectors['wrapSyncInit'] = values.wrapSyncInit

export const provideFactoryContext: Injectors['provideFactoryContext'] =
  values.provideFactoryContext
