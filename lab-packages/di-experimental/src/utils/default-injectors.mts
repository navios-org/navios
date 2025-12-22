import type { Injectors } from './get-injectors.mjs'

import { getInjectors } from './get-injectors.mjs'

export const defaultInjectors = /* #__PURE__ */ getInjectors()

export const inject: Injectors['inject'] =
  /* #__PURE__ */ defaultInjectors.inject
export const optional: Injectors['optional'] =
  /* #__PURE__ */ defaultInjectors.optional
export const asyncInject: Injectors['asyncInject'] =
  /* #__PURE__ */ defaultInjectors.asyncInject
export const wrapSyncInit: Injectors['wrapSyncInit'] =
  /* #__PURE__ */ defaultInjectors.wrapSyncInit
export const provideFactoryContext: Injectors['provideFactoryContext'] =
  /* #__PURE__ */ defaultInjectors.provideFactoryContext
