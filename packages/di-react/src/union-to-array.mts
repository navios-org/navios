// Utility types for type-safe error messages

export type UnionToArray<T> = UnionToArrayImpl<T, never>
type UnionToArrayImpl<T, L extends any[]> = T extends any
  ? UnionToArrayImpl<Exclude<T, T>, [...L, T]>
  : L

export type Join<T extends any[], Delimiter extends string> = T extends []
  ? ''
  : T extends [infer First extends string | number | symbol]
    ? First extends string | number
      ? `${First}`
      : never
    : T extends [infer First extends string | number | symbol, ...infer Rest extends any[]]
      ? First extends string | number
        ? `${First}${Delimiter}${Join<Rest, Delimiter>}`
        : never
      : ''
