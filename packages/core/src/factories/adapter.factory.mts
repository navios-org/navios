import type { FactoryContext } from '@navios/di'

import { Factory, inject, InjectionToken } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { AdapterToken } from '../tokens/index.mjs'

@Factory({
  token: AdapterToken,
})
export class AdapterFactory {
  private readonly environment = inject(NaviosEnvironment)
  create(ctx: FactoryContext) {
    const service = this.environment.getToken(AdapterToken)
    if (!service) {
      throw new Error('AdapterToken service not found in environment')
    }
    return ctx.inject(service as InjectionToken<any, undefined>)
  }
}
