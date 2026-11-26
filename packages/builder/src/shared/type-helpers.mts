/**
 * Flattens a type for better IDE display and hover information.
 */
export type Simplify<T> = T extends object
  ? T extends infer O
    ? { [K in keyof O]: O[K] }
    : never
  : T

/**
 * `{ [Key]: Value }`, with the key optional when `Value` has no required
 * fields or accepts `undefined` — a query schema whose fields are all optional
 * does not force the caller to pass `params: {}`.
 */
export type OptionalIfEmpty<Key extends string, Value> = {} extends Value
  ? { [K in Key]?: Value }
  : undefined extends Value
    ? { [K in Key]?: Value }
    : { [K in Key]: Value }

/** The keys of `T` that are not optional. */
export type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T]
