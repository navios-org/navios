import { Factory, Inject } from '@navios/di'

import type { FactoryContext, Token } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { XmlStreamAdapterToken } from '../tokens/index.mjs'

import type { AbstractHttpHandlerAdapterInterface } from '../interfaces/index.mjs'

@Factory({
  token: XmlStreamAdapterToken,
})
export class XmlStreamAdapterFactory {
  @Inject(NaviosEnvironment) private accessor environment!: NaviosEnvironment
  create(ctx: FactoryContext) {
    const service = this.environment.getToken(XmlStreamAdapterToken)
    if (!service) {
      throw new Error('XmlStreamAdapterToken service not found in environment')
    }
    return ctx.inject<AbstractHttpHandlerAdapterInterface>(service as Token<any, undefined>)
  }
}
