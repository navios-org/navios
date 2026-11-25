/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Evaluates to `true` if `T` is `any`. `false` otherwise.
 * (c) https://stackoverflow.com/a/68633327/5290447
 */
type IsAny<T> = unknown extends T ? ([keyof T] extends [never] ? false : true) : false

/** Objects that are values of a configuration, not sections of it. */
type ObjectValue =
  | readonly any[]
  | ((...args: any[]) => any)
  | Date
  | RegExp
  | ReadonlyMap<any, any>
  | ReadonlySet<any>
  | PromiseLike<any>
  | ArrayBufferView

/** `T` if it is a section, which has paths of its own; `never` if it is a value. */
type Section<T> =
  IsAny<T> extends true
    ? never
    : [NonNullable<T>] extends [object]
      ? [NonNullable<T>] extends [ObjectValue]
        ? never
        : NonNullable<T>
      : never

/** Deep enough for a configuration, and an end for a type that contains itself. */
type MaxDepth = 6

type Paths<T, Depth extends unknown[]> = {
  [Key in keyof T & string]-?: Depth['length'] extends MaxDepth
    ? Key
    : Section<T[Key]> extends infer S
      ? [S] extends [never]
        ? Key
        : Key | `${Key}.${Paths<S, [...Depth, Key]>}`
      : never
}[keyof T & string]

/** The keys of a configuration, and those of its sections: `'database.host'`. */
export type Path<T> = Paths<T, []>

type ValueAt<T, P> = P extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
    ? | ValueAt<NonNullable<T[Key]>, Rest>
      // A value in a section that may be missing may be missing as well.
      | (null extends T[Key] ? undefined : Extract<T[Key], undefined>)
    : never
  : P extends keyof T
    ? T[P]
    : never

/** The type of the value at a path. */
export type PathValue<T, P extends Path<T>> = ValueAt<T, P>
