import type { FactoryContext, InjectionToken } from '@navios/di'

import { Factory, inject } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { XmlStreamAdapterToken } from '../tokens/index.mjs'

@Factory({
  token: XmlStreamAdapterToken,
})
export class XmlStreamAdapterFactory {
  private readonly environment = inject(NaviosEnvironment)
  create(ctx: FactoryContext) {
    const service = this.environment.getHttpToken(XmlStreamAdapterToken)
    if (!service) {
      throw new Error('XmlStreamAdapterToken service not found in environment')
    }
    return ctx.inject(service as InjectionToken<any, undefined>)
  }
}
