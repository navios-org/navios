import type { AnyInjectableType, InjectionToken } from '@navios/di'

import { Injectable } from '@navios/di'

import { AdapterToken } from './tokens/index.mjs'

export interface NaviosEnvironmentOptions {
  tokens?: Map<InjectionToken<any, undefined>, AnyInjectableType>
}

@Injectable()
export class NaviosEnvironment {
  private adapterConfigured = false
  private tokens = new Map<InjectionToken<any, undefined>, AnyInjectableType>()

  setupEnvironment(
    tokens: Map<InjectionToken<any, undefined>, AnyInjectableType>,
  ) {
    const hasAdapterToken = tokens.has(AdapterToken)
    if (hasAdapterToken && this.adapterConfigured) {
      throw new Error(
        'Adapter already configured. Only one adapter per application.',
      )
    }

    for (const [token, value] of tokens) {
      this.tokens.set(token, value)
    }

    if (hasAdapterToken) {
      this.adapterConfigured = true
    }
  }

  getToken(token: InjectionToken<any, undefined>) {
    return this.tokens.get(token)
  }

  hasAdapterSetup() {
    return this.adapterConfigured
  }
}
