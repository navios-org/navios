import { registerInjectable } from '@navios/di'

import type { RequestContext } from './request-context.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A singleton that computes a per-request value on first read.
 */
export interface RequestValueProvider<T> {
  resolve(ctx: RequestContext): T
  /** Called when the response has finished, if the value was computed. */
  dispose?(value: Awaited<T>, ctx: RequestContext): void | Promise<void>
}

export type RequestValueClass<T = any> = new () => RequestValueProvider<T>

const requestValueBrand = Symbol.for('navios.server.RequestValue')

/**
 * A class whose `dispose` takes what its `resolve` computes. Inferred for the
 * two separately, `T` would become their union.
 */
type CheckedRequestValue<C extends RequestValueClass> = new () => RequestValueProvider<
  ReturnType<InstanceType<C>['resolve']>
>

/**
 * Registers a class as a request value without decorator syntax.
 */
export function registerRequestValue<C extends RequestValueClass>(
  target: C & CheckedRequestValue<C>,
): C {
  registerInjectable(target)
  Object.defineProperty(target, requestValueBrand, { value: true, enumerable: false })
  return target
}

/**
 * Marks a class as a request value: a singleton whose `resolve(ctx)` computes
 * a value at most once per request, on first `ctx.get(TheClass)`.
 *
 * ```ts
 * @RequestValue()
 * export class CurrentSession {
 *   private readonly auth = inject(AuthService)
 *   resolve(ctx: RequestContext) {
 *     return this.auth.getSession(ctx.headers.toWebHeaders())
 *   }
 * }
 * ```
 */
export function RequestValue() {
  return <C extends RequestValueClass>(
    target: C & CheckedRequestValue<C>,
    context?: ClassDecoratorContext,
  ): C => {
    if (context && context.kind !== 'class') {
      throw new Error('[Navios] @RequestValue can only be used on classes.')
    }
    return registerRequestValue(target)
  }
}

export function isRequestValueClass(value: unknown): value is RequestValueClass {
  return typeof value === 'function' && (value as any)[requestValueBrand] === true
}
