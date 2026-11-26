import type { BaseEndpointOptions, BuilderInstance, EndpointHandler } from '@navios/builder'

import { makeMutation } from '../mutation/make-mutation.mjs'
import { makeInfiniteQuery } from '../query/make-infinite-query.mjs'
import { makeQuery } from '../query/make-query.mjs'

import type { KeyOptions } from '../endpoint/cache-key.mjs'

import type { ClientInstance } from './client-instance.mjs'

/**
 * Options for creating a client instance.
 */
export type ClientOptions = {
  api: BuilderInstance
  /**
   * Key segments for every query and mutation of this client. They are
   * placed before a declaration's own `keyPrefix` and `keySuffix`, which
   * add to them rather than replace them.
   */
  defaults?: KeyOptions
}

/** Keys of an inline config that belong to the endpoint declaration. */
const ENDPOINT_KEYS = [
  'method',
  'url',
  'querySchema',
  'requestSchema',
  'responseSchema',
  'responses',
  'errorSchema',
  'urlParamsSchema',
  'body',
  'response',
  'headers',
  'timeout',
  'clientOptions',
  'validateResponse',
] as const satisfies readonly (keyof BaseEndpointOptions)[]

type AnyHandler = EndpointHandler<BaseEndpointOptions>

function isEndpointHandler(input: unknown): input is AnyHandler {
  return typeof input === 'function' && 'config' in input
}

/**
 * Splits an inline config into the endpoint declaration and everything else
 * (the surface-specific fields).
 */
function splitInline(config: Record<string, unknown>) {
  const endpointOptions: Record<string, unknown> = {}
  const surface: Record<string, unknown> = {}
  for (const key of Object.keys(config)) {
    if ((ENDPOINT_KEYS as readonly string[]).includes(key)) {
      endpointOptions[key] = config[key]
    } else {
      surface[key] = config[key]
    }
  }
  return { endpointOptions: endpointOptions as never, surface }
}

/**
 * Creates a client for declaring type-safe queries and mutations.
 *
 * @param options.api - The builder whose endpoints the client uses
 * @param options.defaults - `keyPrefix` / `keySuffix` applied to every key, around
 *   the segments a query or mutation declares itself:
 *   `[...defaults.keyPrefix, ...keyPrefix, method, url, ...defaults.keySuffix, ...keySuffix]`
 *
 * @example
 * ```ts
 * const api = builder({ client: httpClient })
 * const client = declareClient({ api })
 *
 * const getUser = client.query({
 *   method: 'GET',
 *   url: '/users/$userId',
 *   responseSchema: userSchema,
 * })
 * ```
 */
export function declareClient({ api, defaults = {} }: ClientOptions): ClientInstance {
  /**
   * The client's `defaults` go around every declaration's own key segments:
   * `[...defaults.keyPrefix, ...keyPrefix]` and `[...defaults.keySuffix, ...keySuffix]`.
   */
  function withDefaults(surface: Record<string, unknown>) {
    const own = surface as KeyOptions
    return {
      ...surface,
      keyPrefix: [...(defaults.keyPrefix ?? []), ...(own.keyPrefix ?? [])],
      keySuffix: [...(defaults.keySuffix ?? []), ...(own.keySuffix ?? [])],
    }
  }

  function resolve(input: unknown, options: Record<string, unknown> | undefined) {
    if (isEndpointHandler(input)) {
      return { endpoint: input, surface: withDefaults({ ...options }) }
    }
    const { endpointOptions, surface } = splitInline(input as Record<string, unknown>)
    return {
      endpoint: api.declareEndpoint(endpointOptions) as unknown as AnyHandler,
      surface: withDefaults({ ...surface, ...options }),
    }
  }

  return {
    query(input: unknown, options?: Record<string, unknown>) {
      const { endpoint, surface } = resolve(input, options)
      return makeQuery(endpoint, surface)
    },
    infiniteQuery(input: unknown, options?: Record<string, unknown>) {
      const { endpoint, surface } = resolve(input, options)
      return makeInfiniteQuery(endpoint as never, surface as never)
    },
    mutation(input: unknown, options?: Record<string, unknown>) {
      const { endpoint, surface } = resolve(input, options)
      return makeMutation(endpoint, surface as never)
    },
  } as unknown as ClientInstance
}
