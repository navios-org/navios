import type { RequestContext } from '../context/request-context.mjs'

export interface Guard {
  canActivate(ctx: RequestContext): boolean | Promise<boolean>
}
