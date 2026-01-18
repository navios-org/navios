import { Factory, inject, InjectionToken } from '@navios/di'

import type { FactoryContext } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { HttpAdapterToken } from '../tokens/index.mjs'

@Factory({
  token: HttpAdapterToken,
})
export class HttpAdapterFactory {
  private readonly environment = inject(NaviosEnvironment)
  create(ctx: FactoryContext) {
    const service = this.environment.getToken(HttpAdapterToken)
    if (!service) {
      throw new Error('HttpAdapterToken service not found in environment')
    }
    return ctx.inject(service as InjectionToken<any, undefined>)
  }
}
