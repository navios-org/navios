import type { BaseEndpointOptions } from '@navios/builder'

import { INPUT_PARTS, isPlainObject, keyByMarker, keyedPart, normalizeKeyBy } from './key-by.mjs'

import type { AnyKeyBy, InputPart, KeyRule } from './key-by.mjs'

/**
 * Extra segments placed around an endpoint's identity in every cache key.
 */
export type KeyOptions = {
  /** Segments placed before `[method, url]`. */
  keyPrefix?: readonly unknown[]
  /** Segments placed right after `[method, url]`. */
  keySuffix?: readonly unknown[]
}

function withoutUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    if (value[key] !== undefined) out[key] = value[key]
  }
  return out
}

/**
 * Rewrites a value into plain JSON-like data that hashes by content.
 *
 * TanStack Query hashes keys with `JSON.stringify`, which turns
 * `URLSearchParams`, `FormData`, `Map`, `Set`, `File` and `Blob` into `{}` —
 * so two different requests would share one cache entry — and throws on a
 * `bigint`. Each of those is replaced by a tagged plain form instead.
 *
 * A `Date` becomes its ISO string, which is what it hashes as. Left as an
 * object it would match every other `Date` in a partial key, because TanStack
 * compares objects by their own keys and a `Date` has none.
 *
 * A `Blob` has no cheap content identity; it is described by its size and
 * type (plus name and modification time for a `File`).
 */
export function normalizeKeyValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' ? { $bigint: value.toString() } : value
  }
  if (Array.isArray(value)) return value.map(normalizeKeyValue)
  // `null` for an invalid date, as `JSON.stringify` writes it
  if (value instanceof Date) return value.toJSON()
  if (value instanceof URLSearchParams) return { $searchParams: [...value.entries()] }
  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    return { $formData: [...value.entries()].map(([k, v]) => [k, normalizeKeyValue(v)]) }
  }
  if (value instanceof Map) {
    return {
      $map: [...value.entries()].map(([k, v]) => [normalizeKeyValue(k), normalizeKeyValue(v)]),
    }
  }
  if (value instanceof Set) return { $set: [...value].map(normalizeKeyValue) }
  if (typeof File !== 'undefined' && value instanceof File) {
    return {
      $file: {
        name: value.name,
        size: value.size,
        type: value.type,
        lastModified: value.lastModified,
      },
    }
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return { $blob: { size: value.size, type: value.type } }
  }
  if (!isPlainObject(value)) return value
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    if (value[key] !== undefined) out[key] = normalizeKeyValue(value[key])
  }
  return out
}

/**
 * The key form of one input part: URL param values are stringified (so
 * `{ id: 1 }` and `{ id: '1' }` are one entry, as they are one URL) and other
 * values go through {@link normalizeKeyValue}. Returns `undefined` for an
 * empty part.
 */
export function normalizeInputPart(part: InputPart, value: unknown): unknown {
  if (value === undefined || value === null) return undefined
  if (!isPlainObject(value)) return normalizeKeyValue(value)
  const normalized =
    part === 'urlParams'
      ? Object.fromEntries(Object.entries(withoutUndefined(value)).map(([k, v]) => [k, String(v)]))
      : (normalizeKeyValue(value) as Record<string, unknown>)
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function pickInputsBy(
  args: unknown,
  rule: KeyRule | undefined,
): Record<string, unknown> | undefined {
  if (!isPlainObject(args)) return undefined
  const inputs: Record<string, unknown> = {}

  for (const part of INPUT_PARTS) {
    const value = normalizeInputPart(part, keyedPart(args[part], rule?.[part] ?? true))
    if (value !== undefined) inputs[part] = value
  }

  return Object.keys(inputs).length > 0 ? inputs : undefined
}

/**
 * Reduces call arguments to the inputs that identify a request.
 *
 * - Only `urlParams`, `params` and `data` are kept; `signal`, `headers` and
 *   `timeout` never affect the key. With `keyBy`, only the inputs it keeps.
 * - URL param values are stringified, so `{ id: 1 }` and `{ id: '1' }` are
 *   the same entry (they produce the same URL).
 * - Empty parts are dropped, so `{}` and `{ params: {} }` are the same entry.
 * - Non-plain values are normalized with {@link normalizeKeyValue}, so they
 *   are told apart by content.
 *
 * Returns `undefined` when nothing is left.
 */
export function pickInputs(args: unknown, keyBy?: AnyKeyBy): Record<string, unknown> | undefined {
  return pickInputsBy(args, normalizeKeyBy(keyBy))
}

/**
 * Builds cache keys for one endpoint.
 *
 * Shape: `[...keyPrefix, method, urlTemplate, ...keySuffix, 'with-response'?, 'query' | 'infinite', { keyBy }?, inputs?]`
 *
 * The endpoint's identity comes first, then the form of the declaration, and
 * its inputs last, so React Query's prefix matching gives these scopes:
 *
 * - `endpoint` — every entry of this endpoint, whatever its form, and nothing
 *   from another endpoint (the URL template is one segment, so `/users` is not
 *   a prefix of `/users/$userId`). The entries hold data of different shapes.
 * - `key()` — every entry of this form: all of them hold the same type of data.
 * - `key({ urlParams: { userId } })` — every entry for that user, whatever
 *   the query params.
 * - `key(fullArgs)` — exactly one entry.
 *
 * The method is part of the key, so `GET /users` and `POST /users` never
 * collide. Every form has a marker of its own (`'query'` or `'infinite'`,
 * after `'with-response'` for a declaration with `withResponse`), so the key
 * of one form is never a prefix of another's. A `keyBy` that leaves inputs out
 * adds a `{ keyBy }` segment, which keeps its entries apart from other rules.
 */
export function createKeyBuilder(
  config: BaseEndpointOptions,
  options: KeyOptions & { withResponse?: boolean; keyBy?: AnyKeyBy } = {},
  isInfinite = false,
) {
  const rule = normalizeKeyBy(options.keyBy)
  const endpoint: readonly unknown[] = [
    ...(options.keyPrefix ?? []),
    config.method,
    config.url,
    ...(options.keySuffix ?? []),
  ]
  const base: readonly unknown[] = [
    ...endpoint,
    ...(options.withResponse ? ['with-response'] : []),
    isInfinite ? 'infinite' : 'query',
    ...(rule ? [keyByMarker(rule)] : []),
  ]

  return {
    /** Key prefix shared by every entry of this endpoint, whatever its form. */
    endpoint,
    /** Key prefix shared by every entry of this form of the endpoint. */
    base,
    /** How each input part takes part in the key; `undefined` when all of them do. */
    rule,
    /** Key for the given (full or partial) args. */
    key(args?: unknown): readonly unknown[] {
      const inputs = pickInputsBy(args, rule)
      return inputs ? [...base, inputs] : base
    },
    /**
     * Key for invalidation: like `key` with inputs, and the whole endpoint
     * without any.
     */
    scope(args?: unknown): readonly unknown[] {
      const inputs = pickInputsBy(args, rule)
      return inputs ? [...base, inputs] : endpoint
    },
    /** Key used by a hook whose args are `skipToken`. Never fetched. */
    skipped(): readonly unknown[] {
      return [...base, 'skipped']
    },
  }
}

/** What {@link createKeyBuilder} returns. */
export type KeyBuilder = ReturnType<typeof createKeyBuilder>

/**
 * Key shared by every mutation of one endpoint:
 * `[...keyPrefix, method, urlTemplate, ...keySuffix]`.
 */
export function createMutationKey(
  config: BaseEndpointOptions,
  options: KeyOptions = {},
): readonly unknown[] {
  return createKeyBuilder(config, { keyPrefix: options.keyPrefix, keySuffix: options.keySuffix })
    .endpoint
}
