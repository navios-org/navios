/**
 * Flattens a type for better IDE display and hover information.
 */
export type Simplify<T> = T extends object
  ? T extends infer O
    ? { [K in keyof O]: O[K] }
    : never
  : T

/**
 * True when `K` is a key of the inferred object type and is not `undefined`.
 * Handles const-generic inference, which omits optional properties that were
 * not provided.
 */
export type HasProperty<T, K extends string> = K extends keyof T
  ? undefined extends T[K]
    ? T[K] extends undefined
      ? false
      : true
    : true
  : false

/**
 * Safely extract a property type, returning never if not present.
 */
export type SafeGet<T, K extends string> = K extends keyof T ? T[K] : never
