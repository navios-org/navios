import { GuardDeniedError } from '../errors/guard-denied-error.mjs'
import { adopt, isPromise } from '../internal/promises.mjs'

import type { RequestContext } from '../context/request-context.mjs'
import type { HttpGuard as Guard } from '../routing/http-contracts.mjs'

/** Only `true` lets a request through, whatever else a guard may return. */
export function runGuards(
  guards: Guard[],
  from: number,
  ctx: RequestContext,
): void | Promise<void> {
  for (let i = from; i < guards.length; i++) {
    const allowed = adopt(guards[i].canActivate(ctx))
    if (isPromise(allowed)) {
      return allowed.then((value) => {
        if (value !== true) {
          throw new GuardDeniedError(guards[i].constructor.name)
        }
        return runGuards(guards, i + 1, ctx)
      })
    }
    if (allowed !== true) {
      throw new GuardDeniedError(guards[i].constructor.name)
    }
  }
}
