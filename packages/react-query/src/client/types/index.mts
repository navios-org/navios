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
 *
 * @template UseDiscriminator - When `true`, errors are returned as union types.
 *   When `false` (default), errors are thrown and not included in TData.
 */
export interface ClientInstance<UseDiscriminator extends boolean = false>
  extends
    ClientQueryMethods<UseDiscriminator>,
    ClientInfiniteQueryMethods<UseDiscriminator>,
    ClientMutationMethods<UseDiscriminator>,
    ClientMultipartMutationMethods<UseDiscriminator>,
    ClientFromEndpointMethods<UseDiscriminator> {}
