import type { FactoryContext, InjectionToken } from '@navios/di'

import { Factory, inject } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { MultipartAdapterToken } from '../tokens/index.mjs'

@Factory({
  token: MultipartAdapterToken,
})
export class MultipartAdapterFactory {
  private readonly environment = inject(NaviosEnvironment)

  create(ctx: FactoryContext) {
    const service = this.environment.getHttpToken(MultipartAdapterToken)
    if (!service) {
      throw new Error('MultipartAdapterToken service not found in environment')
    }
    return ctx.inject(service as InjectionToken<any, undefined>)
  }
}
