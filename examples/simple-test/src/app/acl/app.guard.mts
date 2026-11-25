import { AttributeFactory, inject, Injectable, Logger } from '@navios/server'

import type { Guard, RequestContext } from '@navios/server'

import { Public } from './attributes.mjs'

@Injectable()
export class AppGuard implements Guard {
  private readonly logger = inject(Logger, { context: AppGuard.name })

  canActivate(ctx: RequestContext): boolean {
    const isPublic = AttributeFactory.has(Public, ctx.route)
    this.logger.log(`${ctx.method} ${ctx.path} is ${isPublic ? 'public' : 'protected'}`)
    return true
  }
}
