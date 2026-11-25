import type { ExecutionContext } from '../execution/execution-context.mjs'

/**
 * Decides whether a handler may run. `Ctx` is the context of the transport
 * the guard is written for; the default works on every transport.
 */
export interface Guard<Ctx extends ExecutionContext = ExecutionContext> {
  canActivate(ctx: Ctx): boolean | Promise<boolean>
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A class that guards are made of. */
export type GuardClass = new (...args: any[]) => Guard<any>
