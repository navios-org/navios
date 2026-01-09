import type { FactoryContext, InjectionToken } from '@navios/di'

import { Factory, inject } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { StreamAdapterToken } from '../tokens/index.mjs'

@Factory({
  token: StreamAdapterToken,
})
export class StreamAdapterFactory {
  private readonly environment = inject(NaviosEnvironment)
  create(ctx: FactoryContext) {
    const service = this.environment.getToken(StreamAdapterToken)
    if (!service) {
      throw new Error('StreamAdapterToken service not found in environment')
    }
    return ctx.inject(service as InjectionToken<any, undefined>)
  }
}
