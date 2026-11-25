import type { BaseEndpointOptions } from '@navios/builder'

/**
 * Extra segments placed around an endpoint's identity in every cache key.
 */
export type KeyOptions = {
  /** Segments placed before `[method, url]`. */
  keyPrefix?: readonly unknown[]
  /** Segments placed right after `[method, url]`. */
  keySuffix?: readonly unknown[]
}

const INPUT_KEYS = ['urlParams', 'params', 'data'] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
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
 * A `Blob` has no cheap content identity; it is described by its size and
 * type (plus name and modification time for a `File`).
 */
export function normalizeKeyValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' ? { $bigint: value.toString() } : value
  }
  if (Array.isArray(value)) return value.map(normalizeKeyValue)
  if (value instanceof Date) return value
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
 * Reduces call arguments to the inputs that identify a request.
 *
 * - Only `urlParams`, `params` and `data` are kept; `signal`, `headers` and
 *   `timeout` never affect the key.
 * - URL param values are stringified, so `{ id: 1 }` and `{ id: '1' }` are
 *   the same entry (they produce the same URL).
 * - Empty parts are dropped, so `{}` and `{ params: {} }` are the same entry.
 * - Non-plain values are normalized with {@link normalizeKeyValue}, so they
 *   are told apart by content.
 *
 * Returns `undefined` when nothing is left.
 */
export function pickInputs(args: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(args)) return undefined
  const inputs: Record<string, unknown> = {}

  for (const key of INPUT_KEYS) {
    let value = args[key]
    if (value === undefined || value === null) continue
    if (isPlainObject(value)) {
      if (key === 'urlParams') {
        value = Object.fromEntries(
          Object.entries(withoutUndefined(value)).map(([k, v]) => [k, String(v)]),
        )
      } else {
        value = normalizeKeyValue(value)
      }
      if (Object.keys(value as object).length === 0) continue
    } else {
      value = normalizeKeyValue(value)
    }
    inputs[key] = value
  }

  return Object.keys(inputs).length > 0 ? inputs : undefined
}

/**
 * Builds cache keys for one endpoint.
 *
 * Shape: `[...keyPrefix, method, urlTemplate, ...keySuffix, 'with-response'?, 'infinite'?, inputs?]`
 *
 * The endpoint's identity comes first and its inputs last, so React Query's
 * prefix matching gives three scopes:
 *
 * - `key()` — every entry of this endpoint, and nothing from another
 *   endpoint (the URL template is one segment, so `/users` is not a prefix
 *   of `/users/$userId`).
 * - `key({ urlParams: { userId } })` — every entry for that user, whatever
 *   the query params.
 * - `key(fullArgs)` — exactly one entry.
 *
 * The method is part of the key, so `GET /users` and `POST /users` never
 * collide. Infinite queries carry an `'infinite'` marker and never share an
 * entry with the plain query of the same endpoint.
 */
export function createKeyBuilder(
  config: BaseEndpointOptions,
  options: KeyOptions & { withResponse?: boolean } = {},
  isInfinite = false,
) {
  const base: readonly unknown[] = [
    ...(options.keyPrefix ?? []),
    config.method,
    config.url,
    ...(options.keySuffix ?? []),
    ...(options.withResponse ? ['with-response'] : []),
    ...(isInfinite ? ['infinite'] : []),
  ]

  return {
    /** Key prefix shared by every entry of this endpoint. */
    base,
    /** Key for the given (full or partial) args. */
    key(args?: unknown): readonly unknown[] {
      const inputs = pickInputs(args)
      return inputs ? [...base, inputs] : base
    },
    /** Key used by a hook whose args are `skipToken`. Never fetched. */
    skipped(): readonly unknown[] {
      return [...base, 'skipped']
    },
  }
}

/**
 * Key shared by every mutation of one endpoint:
 * `[...keyPrefix, method, urlTemplate, ...keySuffix]`.
 */
export function createMutationKey(
  config: BaseEndpointOptions,
  options: KeyOptions = {},
): readonly unknown[] {
  return createKeyBuilder(config, { keyPrefix: options.keyPrefix, keySuffix: options.keySuffix })
    .base
}
