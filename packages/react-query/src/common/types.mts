import type { BuilderInstance } from '@navios/builder'

/**
 * Splits a string by a delimiter into a tuple type.
 * Used for parsing URL paths into segments for query keys.
 */
export type Split<S extends string, D extends string> = string extends S
  ? string[]
  : S extends ''
    ? []
    : S extends `${infer T}${D}${infer U}`
      ? [T, ...Split<U, D>]
      : [S]

/**
 * Function type for processing API responses before returning to the caller.
 */
export type ProcessResponseFunction<TData = unknown, TVariables = unknown> = (
  variables: TVariables,
) => Promise<TData> | TData

/**
 * Options for creating a client instance.
 */
export type ClientOptions = {
  api: BuilderInstance
  defaults?: {
    keyPrefix?: string[]
    keySuffix?: string[]
  }
}
