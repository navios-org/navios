import type { FactoryContext, InjectionToken } from '@navios/di'

import { Factory, inject, InjectableScope } from '@navios/di'

import { NaviosEnvironment } from '../navios.environment.mjs'
import { Reply } from '../tokens/index.mjs'

@Factory({
  token: Reply,
  scope: InjectableScope.Request,
})
export class ReplyFactory {
  private readonly environment = inject(NaviosEnvironment)
  create(ctx: FactoryContext) {
    const service = this.environment.getHttpToken(Reply)
    if (!service) {
      throw new Error('ReplyToken service not found in environment')
    }
    return ctx.inject(service as InjectionToken<any, undefined>)
  }
}
