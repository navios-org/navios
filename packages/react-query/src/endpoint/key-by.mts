import type { BaseEndpointOptions } from '@navios/builder'

import type { EndpointArgs, RequiredKeys } from './types.mjs'

/** The parts of the call arguments that can identify a cache entry. */
export type InputPart = 'urlParams' | 'params' | 'data'

export const INPUT_PARTS = ['urlParams', 'params', 'data'] as const satisfies readonly InputPart[]

type PartValue<Options extends BaseEndpointOptions, P> = P extends keyof EndpointArgs<Options>
  ? NonNullable<EndpointArgs<Options>[P]>
  : never

/** Field names a field list can name: only a plain-object part has them. */
type FieldsOf<V> = V extends readonly unknown[]
  ? never
  : V extends Record<string, unknown>
    ? Extract<keyof V, string>
    : never

/**
 * Which inputs identify a query's cache entry.
 *
 * - `false`: none of them. The endpoint has one entry.
 * - per part, `true` (the default) keeps it, `false` leaves it out, and a
 *   list of field names keeps only those fields.
 *
 * The inputs left out are **shared** by everyone using the entry. A hook or
 * `fetch` that passes them sends them: the entry refetches with them and every
 * component on it gets the result. A call without them uses the ones sent last.
 *
 * @example
 * ```ts
 * keyBy: { params: false }    // one entry for every search
 * keyBy: { params: ['role'] } // one entry per role; the other params are shared
 * keyBy: false                // one entry for the endpoint
 * ```
 */
export type KeyBy<Options extends BaseEndpointOptions> =
  | false
  | {
      [P in InputPart & keyof EndpointArgs<Options>]?:
        | boolean
        | readonly FieldsOf<PartValue<Options, P>>[]
    }

/** The untyped form of {@link KeyBy}, for code that does not know the endpoint. */
export type AnyKeyBy = boolean | { [P in InputPart]?: boolean | readonly string[] }

// ---------------------------------------------------------------------------
// Types of the call arguments under a `keyBy`
// ---------------------------------------------------------------------------

type Flat<T> = { [K in keyof T]: T[K] } & {}

/** How a part takes part in the key: kept, left out, or a list of the fields kept. */
type ModeOf<K, P> = K extends false ? false : P extends keyof K ? Exclude<K[P], undefined> : true

/** `V` with the fields that are not in `F` made optional. */
type SharedFieldsOptional<V, F> = Flat<
  Omit<V, Exclude<keyof V, F>> & { [Q in Exclude<keyof V, F>]?: V[Q] }
>

/**
 * Whether a call may leave the part out: the part is shared, or the fields
 * that stay in the key are all optional.
 */
type MayOmit<V, M> = M extends false
  ? true
  : M extends readonly (infer F)[]
    ? [RequiredKeys<Pick<V, Extract<F, keyof V>>>] extends [never]
      ? true
      : false
    : false

type SendPart<V, M> = M extends readonly (infer F)[] ? SharedFieldsOptional<V, F> : V
type KeyedPart<V, M> = M extends readonly (infer F)[] ? Pick<V, Extract<F, keyof V>> : V

type OptionalIf<T, Optional extends PropertyKey> = Flat<
  { [P in keyof T as P extends Optional ? never : P]: T[P] } & {
    [P in keyof T as P extends Optional ? P : never]?: T[P]
  }
>

type OmittableParts<Args, K> = {
  [P in keyof Args]: P extends InputPart
    ? MayOmit<NonNullable<Args[P]>, ModeOf<K, P>> extends true
      ? P
      : never
    : never
}[keyof Args]

type LeftOutParts<Args, K> = {
  [P in keyof Args]: P extends InputPart ? (ModeOf<K, P> extends false ? P : never) : never
}[keyof Args]

/**
 * Arguments of a call that may send the shared inputs (`use`, `useSuspense`,
 * `fetch`, `prefetch`, `ensure`): the shared inputs are optional.
 */
export type SendArgs<Options extends BaseEndpointOptions, K> = [K] extends [undefined]
  ? EndpointArgs<Options>
  : OptionalIf<
      {
        [P in keyof EndpointArgs<Options>]: P extends InputPart
          ? SendPart<NonNullable<EndpointArgs<Options>[P]>, ModeOf<K, P>>
          : EndpointArgs<Options>[P]
      },
      OmittableParts<EndpointArgs<Options>, K>
    >

/**
 * Arguments that address the entry itself (the options a call returns,
 * `getData`, `setData`): only the inputs that identify it.
 */
export type KeyedArgs<Options extends BaseEndpointOptions, K> = [K] extends [undefined]
  ? EndpointArgs<Options>
  : OptionalIf<
      {
        [
          P in keyof EndpointArgs<Options> as P extends LeftOutParts<EndpointArgs<Options>, K>
            ? never
            : P
        ]: P extends InputPart
          ? KeyedPart<NonNullable<EndpointArgs<Options>[P]>, ModeOf<K, P>>
          : EndpointArgs<Options>[P]
      },
      OmittableParts<EndpointArgs<Options>, K>
    >

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

/** How each part takes part in the key; field lists are sorted. */
export type KeyRule = { readonly [P in InputPart]: boolean | readonly string[] }

/** The shared inputs of an entry: a whole part, or the shared fields of one. */
export type SharedInputs = { [P in InputPart]?: unknown }

/**
 * Normalizes a `keyBy` option. Returns `undefined` when every input stays in
 * the key, so such a declaration keys exactly like one without the option.
 */
export function normalizeKeyBy(keyBy: AnyKeyBy | undefined): KeyRule | undefined {
  if (keyBy === undefined || keyBy === true) return undefined
  const rule: Record<InputPart, boolean | readonly string[]> = {
    urlParams: true,
    params: true,
    data: true,
  }
  for (const part of INPUT_PARTS) {
    const mode = keyBy === false ? false : keyBy[part]
    if (mode === false) rule[part] = false
    else if (Array.isArray(mode)) rule[part] = [...new Set<string>(mode)].sort()
  }
  return INPUT_PARTS.every((part) => rule[part] === true) ? undefined : rule
}

/**
 * The key segment that marks entries of a declaration with a `keyBy`: the
 * rule as one string, such as `{ keyBy: 'params:false' }` or
 * `{ keyBy: 'params:["role"]' }`, and `{ keyBy: false }` when no input
 * identifies the entry.
 *
 * It keeps them apart from the entries of a declaration of the same endpoint
 * without a `keyBy`, and shows the rule in the devtools. It is a string so
 * that TanStack's partial matching never lets one rule match another (an
 * object or array value would match any rule that extends it).
 */
export function keyByMarker(rule: KeyRule): { keyBy: string | false } {
  if (INPUT_PARTS.every((part) => rule[part] === false)) return { keyBy: false }
  const parts: string[] = []
  for (const part of INPUT_PARTS) {
    const mode = rule[part]
    if (mode !== true) parts.push(`${part}:${JSON.stringify(mode)}`)
  }
  return { keyBy: parts.join(' ') }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)

/** The part of `value` that goes into the key under `mode`. */
export function keyedPart(value: unknown, mode: boolean | readonly string[]): unknown {
  if (mode === false) return undefined
  if (mode === true || !isPlainObject(value)) return value
  const out: Record<string, unknown> = {}
  for (const field of mode) {
    if (hasOwn(value, field)) out[field] = value[field]
  }
  return out
}

/**
 * The shared inputs a call has, or `undefined` when it has none.
 *
 * A call has a shared input when its arguments have the property, even as
 * `undefined`: that is how a shared input is cleared.
 */
export function sharedInputsOf(args: unknown, rule: KeyRule): SharedInputs | undefined {
  if (!isPlainObject(args)) return undefined
  let found: SharedInputs | undefined
  for (const part of INPUT_PARTS) {
    const mode = rule[part]
    if (mode === true) continue
    if (mode === false) {
      if (hasOwn(args, part)) (found ??= {})[part] = args[part]
      continue
    }
    const value = args[part]
    if (!isPlainObject(value)) continue
    for (const field of Object.keys(value)) {
      if (mode.includes(field)) continue
      found ??= {}
      ;((found[part] ??= {}) as Record<string, unknown>)[field] = value[field]
    }
  }
  return found
}

/**
 * Applies the shared inputs a call sent to those of the entry. A part left out
 * with `false` is replaced; with a field list, each field sent is replaced.
 */
export function mergeSharedInputs(
  current: SharedInputs | undefined,
  sent: SharedInputs,
  rule: KeyRule,
): SharedInputs {
  const next: SharedInputs = { ...current }
  for (const part of INPUT_PARTS) {
    if (!hasOwn(sent, part)) continue
    next[part] =
      rule[part] === false
        ? sent[part]
        : { ...(current?.[part] as object | undefined), ...(sent[part] as object) }
  }
  return next
}

/** The call arguments with the entry's shared inputs in place of the call's own. */
export function withSharedInputs(
  args: Record<string, unknown> | undefined,
  inputs: SharedInputs,
  rule: KeyRule,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args }
  for (const part of INPUT_PARTS) {
    const mode = rule[part]
    if (mode === true) continue
    if (mode === false) {
      if (hasOwn(inputs, part)) out[part] = inputs[part]
      else delete out[part]
      continue
    }
    const own = args?.[part]
    if (own !== undefined && !isPlainObject(own)) continue
    const keyed = keyedPart(own, mode) as Record<string, unknown> | undefined
    const shared = inputs[part] as Record<string, unknown> | undefined
    if (own === undefined && shared === undefined) delete out[part]
    else out[part] = { ...keyed, ...shared }
  }
  return out
}
