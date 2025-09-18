import type { AnyInjectableType, InjectionToken } from '@navios/di'

import { Injectable } from '@navios/di'

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
}
