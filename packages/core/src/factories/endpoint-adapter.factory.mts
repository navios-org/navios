import { Factory, Inject } from '@navios/di'

import type { FactoryContext, Token } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { EndpointAdapterToken } from '../tokens/index.mjs'

import type { AbstractHttpHandlerAdapterInterface } from '../interfaces/index.mjs'

@Factory({
  token: EndpointAdapterToken,
})
export class EndpointAdapterFactory {
  @Inject(NaviosEnvironment) private accessor environment!: NaviosEnvironment

  create(ctx: FactoryContext) {
    const service = this.environment.getToken(EndpointAdapterToken)
    if (!service) {
      throw new Error('EndpointAdapterToken service not found in environment')
    }
    return ctx.inject<AbstractHttpHandlerAdapterInterface>(service as Token<any, undefined>)
  }
}
