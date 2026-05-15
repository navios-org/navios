import { Factory, Inject, Token } from '@navios/di'

import type { FactoryContext } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { HttpAdapterToken } from '../tokens/index.mjs'

import type { AbstractHttpAdapterInterface } from '../interfaces/index.mjs'

@Factory({
  token: HttpAdapterToken,
})
export class HttpAdapterFactory {
  @Inject(NaviosEnvironment) private accessor environment!: NaviosEnvironment
  create(ctx: FactoryContext) {
    const service = this.environment.getToken(HttpAdapterToken)
    if (!service) {
      throw new Error('HttpAdapterToken service not found in environment')
    }
    return ctx.inject<AbstractHttpAdapterInterface>(service as Token<any, undefined>)
  }
}
