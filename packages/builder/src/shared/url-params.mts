type Lower =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z'
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
type IdentStart = Lower | Uppercase<Lower> | '_'
type IdentChar = IdentStart | Digit

/** Consumes identifier characters from the front of `S`: `[name, rest]`. */
type TakeIdent<S extends string, Acc extends string = ''> = S extends `${infer C}${infer Rest}`
  ? C extends IdentChar
    ? TakeIdent<Rest, `${Acc}${C}`>
    : [Acc, S]
  : [Acc, '']

/**
 * Parses URL path parameters from a URL template string.
 *
 * A parameter is `$` followed by a letter or underscore and then any number
 * of letters, digits or underscores — the same rule `bindUrlParams` applies
 * at runtime. A `$` followed by anything else is literal text.
 *
 * @example
 * ```ts
 * type A = ParsePathParams<'/users/$userId/posts/$postId'> // 'userId' | 'postId'
 * type B = ParsePathParams<'/files/$file_id.json'>         // 'file_id'
 * ```
 */
export type ParsePathParams<T extends string, TAcc = never> = T extends `${string}$${infer After}`
  ? After extends `${infer First}${string}`
    ? First extends IdentStart
      ? TakeIdent<After> extends [infer Name, infer Rest extends string]
        ? ParsePathParams<Rest, TAcc | Name>
        : TAcc
      : ParsePathParams<After, TAcc>
    : TAcc
  : TAcc

/**
 * Checks if a URL template has any path parameters.
 *
 * @example
 * ```ts
 * type HasParams = UrlHasParams<'/users/$userId'> // true
 * type NoParams = UrlHasParams<'/users'>          // false
 * ```
 */
export type UrlHasParams<Url extends string> = ParsePathParams<Url> extends never ? false : true

/**
 * Creates an object type for URL parameters with their expected types.
 *
 * @template Url - The URL template string
 * @template IsServer - If true, params are string only; if false, string | number
 *
 * @example
 * ```ts
 * type Params = UrlParams<'/users/$userId'>
 * // Result: { userId: string | number }
 * ```
 */
export type UrlParams<Url extends string, IsServer extends boolean = false> = {
  [key in ParsePathParams<Url> & string]: IsServer extends true ? string : string | number
}
