import type { ExecutionContext } from '../execution/execution-context.mjs'

/**
 * Wraps a handler. `Ctx` is the context of the transport the interceptor is
 * written for and `Result` what that transport's handlers produce; the
 * defaults work on every transport.
 */
export interface Interceptor<Ctx extends ExecutionContext = ExecutionContext, Result = unknown> {
  intercept(ctx: Ctx, next: () => Promise<Result>): Result | Promise<Result>
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A class that interceptors are made of. */
export type InterceptorClass = new (...args: any[]) => Interceptor<any, any>
