import { Factory, inject, InjectableScope } from '@navios/di'

import type { FactoryContext, InjectionToken } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { Request } from '../tokens/index.mjs'

@Factory({
  token: Request,
  scope: InjectableScope.Request,
})
export class RequestFactory {
  private readonly environment = inject(NaviosEnvironment)
  create(ctx: FactoryContext) {
    const service = this.environment.getToken(Request)
    if (!service) {
      throw new Error('RequestToken service not found in environment')
    }
    return ctx.inject(service as InjectionToken<any, undefined>)
  }
}
