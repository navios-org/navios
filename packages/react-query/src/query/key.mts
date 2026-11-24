import type { BaseEndpointOptions } from '@navios/builder'

import type { KeyOptions } from '../common/types.mjs'

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
 * Reduces call arguments to the inputs that identify a request.
 *
 * - Only `urlParams`, `params` and `data` are kept; `signal`, `headers` and
 *   `timeout` never affect the key.
 * - URL param values are stringified, so `{ id: 1 }` and `{ id: '1' }` are
 *   the same entry (they produce the same URL).
 * - Empty parts are dropped, so `{}` and `{ params: {} }` are the same entry.
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
      value = withoutUndefined(value)
      if (key === 'urlParams') {
        value = Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
        )
      }
      if (Object.keys(value as object).length === 0) continue
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
