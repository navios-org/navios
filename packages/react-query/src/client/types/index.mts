export * from './helpers.mjs'
export * from './query.mjs'
export * from './infinite-query.mjs'
export * from './mutation.mjs'
export * from './multipart-mutation.mjs'
export * from './from-endpoint.mjs'

import type { ClientFromEndpointMethods } from './from-endpoint.mjs'
import type { ClientInfiniteQueryMethods } from './infinite-query.mjs'
import type { ClientMultipartMutationMethods } from './multipart-mutation.mjs'
import type { ClientMutationMethods } from './mutation.mjs'
import type { ClientQueryMethods } from './query.mjs'

/**
 * The main client instance interface.
 * Provides methods for creating queries, infinite queries, and mutations.
 */
export interface ClientInstance
  extends
    ClientQueryMethods,
    ClientInfiniteQueryMethods,
    ClientMutationMethods,
    ClientMultipartMutationMethods,
    ClientFromEndpointMethods {}
