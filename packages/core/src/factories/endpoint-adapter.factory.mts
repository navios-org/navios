import { Factory, inject } from '@navios/di'

import type { FactoryContext, InjectionToken } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { EndpointAdapterToken } from '../tokens/index.mjs'

@Factory({
  token: EndpointAdapterToken,
})
export class EndpointAdapterFactory {
  private readonly environment = inject(NaviosEnvironment)

  create(ctx: FactoryContext) {
    const service = this.environment.getToken(EndpointAdapterToken)
    if (!service) {
      throw new Error('EndpointAdapterToken service not found in environment')
    }
    return ctx.inject(service as InjectionToken<any, undefined>)
  }
}
