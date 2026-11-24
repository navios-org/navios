import { registerInjectable } from '@navios/di'

import type { RequestContext } from './request-context.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A typed slot in the request context. Something sets it (usually a guard),
 * and reading it before that throws.
 *
 * ```ts
 * export const CurrentUser = createContextKey<User>('CurrentUser')
 * ```
 */
export class PlainContextKey<T> {
  declare readonly __type: T
  constructor(public readonly name: string) {}

  toString(): string {
    return this.name
  }
}

export function createContextKey<T>(name: string): PlainContextKey<T> {
  return new PlainContextKey<T>(name)
}

/**
 * A singleton that computes a per-request value on first read.
 */
export interface RequestValueProvider<T> {
  resolve(ctx: RequestContext): T
  /** Called when the response has finished, if the value was computed. */
  dispose?(value: Awaited<T>, ctx: RequestContext): void | Promise<void>
}

export type RequestValueClass<T = any> = new () => RequestValueProvider<T>

const requestValueBrand = Symbol.for('navios.core.RequestValue')

/**
 * Registers a class as a request value without decorator syntax.
 */
export function registerRequestValue<C extends RequestValueClass>(target: C): C {
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
  return <C extends RequestValueClass>(target: C, context?: ClassDecoratorContext): C => {
    if (context && context.kind !== 'class') {
      throw new Error('[Navios] @RequestValue can only be used on classes.')
    }
    return registerRequestValue(target)
  }
}

export function isRequestValueClass(value: unknown): value is RequestValueClass {
  return typeof value === 'function' && (value as any)[requestValueBrand] === true
}

export type ContextKey<T = any> = PlainContextKey<T> | RequestValueClass<T>

/**
 * The type `ctx.get(key)` returns: the key's type, or whatever the request
 * value's `resolve` returns (a promise when `resolve` returns a thenable).
 */
export type ContextValue<K> =
  K extends PlainContextKey<infer T>
    ? T
    : K extends new () => { resolve(ctx: any): infer R }
      ? ResolvedValue<R>
      : never

type ResolvedValue<R> = R extends Promise<any> ? R : R extends PromiseLike<infer T> ? Promise<T> : R
