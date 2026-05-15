import { Factory, Inject, InjectableScope } from '@navios/di'

import type { FactoryContext, Token } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { Reply } from '../tokens/index.mjs'

@Factory({
  token: Reply,
  scope: InjectableScope.Request,
})
export class ReplyFactory {
  @Inject(NaviosEnvironment) private accessor environment!: NaviosEnvironment
  create(ctx: FactoryContext) {
    const service = this.environment.getToken(Reply)
    if (!service) {
      throw new Error('ReplyToken service not found in environment')
    }
    return ctx.inject<any>(service as Token<any, undefined>)
  }
}
