import type { BaseEndpointOptions, EndpointHandler } from '@navios/builder'

import { makeMutation } from '../mutation/make-mutation.mjs'
import { makeInfiniteQuery } from '../query/make-infinite-query.mjs'
import { makeQuery } from '../query/make-query.mjs'

import type { ClientOptions } from '../common/types.mjs'

import type { ClientInstance } from './types.mjs'

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
 * @param options.defaults - `keyPrefix` / `keySuffix` applied to every key
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
  function resolve(input: unknown, options: Record<string, unknown> | undefined) {
    if (isEndpointHandler(input)) {
      return { endpoint: input, surface: { ...defaults, ...options } }
    }
    const { endpointOptions, surface } = splitInline(input as Record<string, unknown>)
    return {
      endpoint: api.declareEndpoint(endpointOptions) as unknown as AnyHandler,
      surface: { ...defaults, ...surface, ...options },
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
