type Visible<T> = unknown extends T
  ? T
  : T extends (...args: any[]) => any
    ? T
    : { [K in keyof T]: T[K] }

/**
 * A `T`, or what can be seen of one from outside: an object without the private
 * and protected members of its class. `T` itself is listed for generic code,
 * where the members of a `T` are not known yet.
 */
export type PublicPart<T> = T | Visible<T>
