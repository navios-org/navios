/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A typed slot in an execution context. Something sets it (usually a guard),
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

/** A key every transport's context accepts. */
export type ContextKey<T = any> = PlainContextKey<T>

/**
 * The type `ctx.get(key)` returns: a plain key's type, or, for a key that is
 * a class whose instances compute the value with `resolve`, what `resolve`
 * returns (a promise when it returns a thenable). A transport decides whether
 * it accepts such classes as keys.
 */
export type ContextValue<K> =
  K extends PlainContextKey<infer T>
    ? T
    : K extends new () => { resolve(ctx: any): infer R }
      ? ResolvedValue<R>
      : never

type ResolvedValue<R> = R extends Promise<any> ? R : R extends PromiseLike<infer T> ? Promise<T> : R
