import type { StandardSchemaV1 } from '../token/schema.mjs'
import type {
  BoundToken,
  ClassType,
  FactoryToken,
  Token,
} from '../token/token.mjs'

// Utility types for string manipulation and union handling
export type Join<TElements, TSeparator extends string> =
  TElements extends Readonly<[infer First, ...infer Rest]>
    ? Rest extends ReadonlyArray<string>
      ? First extends string
        ? `${First}${Rest extends [] ? '' : TSeparator}${Join<Rest, TSeparator>}`
        : never
      : never
    : ''

// credits goes to https://stackoverflow.com/a/50375286
export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never

// Converts union to overloaded function
export type UnionToOvlds<U> = UnionToIntersection<U extends any ? (f: U) => void : never>

export type PopUnion<U> = UnionToOvlds<U> extends (a: infer A) => void ? A : never

export type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true

export type UnionToArray<T, A extends unknown[] = []> =
  IsUnion<T> extends true ? UnionToArray<Exclude<T, PopUnion<T>>, [PopUnion<T>, ...A]> : [T, ...A]

/**
 * Compile-time DX error returned by `container.get(token)` when a
 * schema-bearing token is resolved without its required args.
 *
 * The key list is derived from the schema's Standard Schema input type
 * ({@link StandardSchemaV1.InferInput}). If the keys are not cleanly
 * string-extractable the message degrades to a generic form.
 */
export type TokenArgsRequiredError<S extends StandardSchemaV1> =
  Extract<keyof StandardSchemaV1.InferInput<S>, string> extends never
    ? 'Error: Your token requires args'
    : `Error: Your token requires args: ${Join<
        UnionToArray<Extract<keyof StandardSchemaV1.InferInput<S>, string>>,
        ', '
      >}`

export type InjectRequest = {
  token:
    | Token<any>
    | BoundToken<any, any>
    | FactoryToken<any, any>
    | ClassType
  promise: Promise<any>
  readonly result: any
  readonly error: Error | null
}

// InjectState interface for managing injection state
export interface InjectState {
  currentIndex: number
  isFrozen: boolean
  requests: InjectRequest[]
}
