import type { ClassType, Container } from '@navios/di'

import { runInContext } from '../execution/async-context.mjs'

import type { ExecutionContext, HandlerInfo } from '../execution/execution-context.mjs'
import type { Guard } from '../guards/guard.mjs'
import type { Interceptor } from '../interceptors/interceptor.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A handler's chain with its instances, ready to run. */
export interface ResolvedChain<Ctx extends ExecutionContext = ExecutionContext, Result = unknown> {
  readonly outer: ReadonlyArray<Interceptor<Ctx, Result>>
  readonly guards: ReadonlyArray<{ readonly type: ClassType; readonly guard: Guard<Ctx> }>
  readonly inner: ReadonlyArray<Interceptor<Ctx, Result>>
}

async function resolve(
  container: Pick<Container, 'get'>,
  type: ClassType,
  kind: string,
  method: string,
): Promise<any> {
  const instance = (await container.get(type)) as any
  if (typeof instance?.[method] !== 'function') {
    throw new Error(`[Navios] ${kind} ${type.name} does not implement ${method}()`)
  }
  return instance
}

/**
 * Resolves the classes of a chain that `handlerChain` returned. A transport
 * does this once per handler, while it is set up.
 */
export async function resolveChain<
  Ctx extends ExecutionContext = ExecutionContext,
  Result = unknown,
>(
  container: Pick<Container, 'get'>,
  chain: {
    readonly info: Pick<HandlerInfo, 'guards'>
    readonly outer: readonly ClassType[]
    readonly inner: readonly ClassType[]
  },
): Promise<ResolvedChain<Ctx, Result>> {
  const outer: Interceptor<Ctx, Result>[] = []
  const guards: Array<{ type: ClassType; guard: Guard<Ctx> }> = []
  const inner: Interceptor<Ctx, Result>[] = []
  for (const type of chain.outer) {
    outer.push(await resolve(container, type, 'Interceptor', 'intercept'))
  }
  for (const type of chain.info.guards) {
    guards.push({ type, guard: await resolve(container, type, 'Guard', 'canActivate') })
  }
  for (const type of chain.inner) {
    inner.push(await resolve(container, type, 'Interceptor', 'intercept'))
  }
  return { outer, guards, inner }
}

function intercepted<Ctx extends ExecutionContext, Result>(
  ctx: Ctx,
  interceptors: ReadonlyArray<Interceptor<Ctx, Result>>,
  innermost: () => Result | Promise<Result>,
): () => Promise<Result> {
  let next = async () => innermost()
  for (let i = interceptors.length - 1; i >= 0; i--) {
    const interceptor = interceptors[i]
    const inner = next
    next = async () => interceptor.intercept(ctx, inner)
  }
  return next
}

/**
 * Runs a handler with what applies to it: the outer interceptors, the guards
 * one after another, the inner interceptors, the handler. When a guard refuses,
 * nothing further runs and `onDenied` says what becomes of the execution: what
 * it returns is the result, and what it throws is the failure.
 */
export function runChain<Ctx extends ExecutionContext, Result>(
  ctx: Ctx,
  chain: ResolvedChain<Ctx, Result>,
  handler: () => Result | Promise<Result>,
  onDenied: (guard: ClassType) => Result | Promise<Result>,
): Promise<Result> {
  const guarded = async (): Promise<Result> => {
    for (const { type, guard } of chain.guards) {
      if ((await guard.canActivate(ctx)) !== true) {
        return onDenied(type)
      }
    }
    return intercepted(ctx, chain.inner, handler)()
  }
  return intercepted(ctx, chain.outer, guarded)()
}

/**
 * Runs a handler with what applies to it, as `runChain`, in the async context
 * when the application keeps one, and then finishes its context, whatever the
 * outcome. The context is finished inside the async context, so that
 * `currentContext()` still answers in `onFinish` callbacks.
 */
export function executeChain<Ctx extends ExecutionContext & { finish(): Promise<void> }, Result>(
  host: { readonly asyncContext: boolean },
  ctx: Ctx,
  chain: ResolvedChain<Ctx, Result>,
  handler: () => Result | Promise<Result>,
  onDenied: (guard: ClassType) => Result | Promise<Result>,
): Promise<Result> {
  const execute = async (): Promise<Result> => {
    try {
      return await runChain(ctx, chain, handler, onDenied)
    } finally {
      await ctx.finish()
    }
  }
  return host.asyncContext ? runInContext(ctx, execute) : execute()
}
