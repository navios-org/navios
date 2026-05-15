import { Factory, Inject, InjectableScope } from '@navios/di'

import type { FactoryContext, Token } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { Request } from '../tokens/index.mjs'

@Factory({
  token: Request,
  scope: InjectableScope.Request,
})
export class RequestFactory {
  @Inject(NaviosEnvironment) private accessor environment!: NaviosEnvironment
  create(ctx: FactoryContext) {
    const service = this.environment.getToken(Request)
    if (!service) {
      throw new Error('RequestToken service not found in environment')
    }
    return ctx.inject<any>(service as Token<any, undefined>)
  }
}
