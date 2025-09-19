import type { AnyInjectableType, InjectionToken } from '@navios/di'

import { Injectable } from '@navios/di'

export interface NaviosEnvironmentOptions {
  // Future options can be added here
  httpTokens?: Map<InjectionToken<any, undefined>, AnyInjectableType>
}

@Injectable()
export class NaviosEnvironment {
  private httpTokens = new Map<
    InjectionToken<any, undefined>,
    AnyInjectableType
  >()

  setupHttpEnvironment(
    tokens: Map<InjectionToken<any, undefined>, AnyInjectableType>,
  ) {
    this.httpTokens = tokens
  }

  getHttpToken(token: InjectionToken<any, undefined>) {
    return this.httpTokens.get(token)
  }

  hasHttpSetup() {
    return this.httpTokens.size > 0
  }
}
