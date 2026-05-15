import { Factory, Inject, Token } from '@navios/di'

import type { FactoryContext } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { AdapterToken } from '../tokens/index.mjs'

import type { AbstractAdapterInterface } from '../interfaces/index.mjs'

@Factory({
  token: AdapterToken,
})
export class AdapterFactory {
  @Inject(NaviosEnvironment) private accessor environment!: NaviosEnvironment
  create(ctx: FactoryContext) {
    const service = this.environment.getToken(AdapterToken)
    if (!service) {
      throw new Error('AdapterToken service not found in environment')
    }
    return ctx.inject<AbstractAdapterInterface>(service as Token<any, undefined>)
  }
}
