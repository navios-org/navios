import { Injectable } from '@navios/di'

import type { AnyInjectableType, Token } from '@navios/di'

import { AdapterToken } from './tokens/index.mjs'

export interface NaviosEnvironmentOptions {
  tokens?: Map<Token<any, undefined>, AnyInjectableType>
}

@Injectable()
export class NaviosEnvironment {
  private adapterConfigured = false
  private tokens = new Map<Token<any, undefined>, AnyInjectableType>()

  setupEnvironment(tokens: Map<Token<any, undefined>, AnyInjectableType>) {
    const hasAdapterToken = tokens.has(AdapterToken)
    if (hasAdapterToken && this.adapterConfigured) {
      throw new Error('Adapter already configured. Only one adapter per application.')
    }

    for (const [token, value] of tokens) {
      this.tokens.set(token, value)
    }

    if (hasAdapterToken) {
      this.adapterConfigured = true
    }
  }

  getToken(token: Token<any, undefined>) {
    return this.tokens.get(token)
  }

  hasAdapterSetup() {
    return this.adapterConfigured
  }
}
