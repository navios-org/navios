import { AttributeFactory, registerInjectable } from '@navios/server'

import type { Guard, RequestContext } from '@navios/server'

import { AllowAnonymous } from './attributes.mjs'
import { requireSession } from './auth-session.mjs'

/**
 * Lets a request through when it has a session and answers 401 otherwise. A route, controller
 * or module with `AllowAnonymous()` is let through without a lookup. Behind the guard, read the
 * session with `requireSession(ctx)`, which reuses the guard's lookup.
 *
 * ```ts
 * @Module({ controllers: [NotesController], guards: [BetterAuthGuard] })
 * export class NotesModule {}
 * ```
 */
export class BetterAuthGuard implements Guard {
  async canActivate(ctx: RequestContext): Promise<boolean> {
    if (AttributeFactory.has(AllowAnonymous, ctx.route)) {
      return true
    }
    await requireSession(ctx)
    return true
  }
}
registerInjectable(BetterAuthGuard)
