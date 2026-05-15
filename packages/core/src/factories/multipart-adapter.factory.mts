import { Factory, Inject } from '@navios/di'

import type { FactoryContext, Token } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { MultipartAdapterToken } from '../tokens/index.mjs'

import type { AbstractHttpHandlerAdapterInterface } from '../interfaces/index.mjs'

@Factory({
  token: MultipartAdapterToken,
})
export class MultipartAdapterFactory {
  @Inject(NaviosEnvironment) private accessor environment!: NaviosEnvironment

  create(ctx: FactoryContext) {
    const service = this.environment.getToken(MultipartAdapterToken)
    if (!service) {
      throw new Error('MultipartAdapterToken service not found in environment')
    }
    return ctx.inject<AbstractHttpHandlerAdapterInterface>(service as Token<any, undefined>)
  }
}
