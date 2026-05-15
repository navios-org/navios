import { Factory, Inject } from '@navios/di'

import type { FactoryContext, Token } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { StreamAdapterToken } from '../tokens/index.mjs'

import type { AbstractHttpHandlerAdapterInterface } from '../interfaces/index.mjs'

@Factory({
  token: StreamAdapterToken,
})
export class StreamAdapterFactory {
  @Inject(NaviosEnvironment) private accessor environment!: NaviosEnvironment
  create(ctx: FactoryContext) {
    const service = this.environment.getToken(StreamAdapterToken)
    if (!service) {
      throw new Error('StreamAdapterToken service not found in environment')
    }
    return ctx.inject<AbstractHttpHandlerAdapterInterface>(service as Token<any, undefined>)
  }
}
