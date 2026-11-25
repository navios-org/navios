import { AttributeFactory, inject, Injectable, Logger } from '@navios/server'

import type { Guard, RequestContext } from '@navios/server'

import { Roles } from './attributes.mjs'

@Injectable()
export class AclGuard implements Guard {
  private readonly logger = inject(Logger, { context: AclGuard.name })

  canActivate(ctx: RequestContext): boolean {
    const required = AttributeFactory.get(Roles, ctx.route)
    this.logger.log(`Required roles: ${required?.roles.join(', ') ?? 'none'}`)
    return true
  }
}
