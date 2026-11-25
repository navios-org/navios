import type { RequestValueClass } from './request-value.mjs'

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
