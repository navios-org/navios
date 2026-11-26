import { skipToken } from '@tanstack/react-query'

import type { BaseEndpointOptions, EndpointHandler } from '@navios/builder'
import type { QueryClient, Updater } from '@tanstack/react-query'

import type { KeyBuilder } from '../endpoint/cache-key.mjs'
import type { KeyedArgs } from '../endpoint/key-by.mjs'
import type { ArgsOf, PartialKeyedInputs } from '../endpoint/types.mjs'

import type { InvalidateFilters, TaggedKey } from './types.mjs'

/**
 * The cache members a query and an infinite query share: the key, typed
 * reads and writes of the cached data, invalidation and the endpoint.
 *
 * @template TKeyBy - The declaration's `keyBy`, `undefined` without one (an
 *   infinite query never has one). With one, the members take only the inputs
 *   that identify the entry.
 */
export type CacheHelpers<Options extends BaseEndpointOptions, TData, TError, TKeyBy = undefined> = {
  /**
   * Cache key for the given args.
   *
   * - no args: prefix of every entry of this endpoint
   * - partial args: prefix of every entry that matches them
   * - full args: the exact key
   */
  key: (args?: PartialKeyedInputs<Options, TKeyBy>) => TaggedKey<TData, TError>

  /** Reads the cached data for these args. */
  getData: (
    queryClient: QueryClient,
    ...args: ArgsOf<KeyedArgs<Options, TKeyBy>>
  ) => TData | undefined

  /** Writes the cached data for these args. */
  setData: (
    queryClient: QueryClient,
    args: KeyedArgs<Options, TKeyBy>,
    updater: Updater<TData | undefined, TData | undefined>,
  ) => TData | undefined

  /**
   * Invalidates entries of this endpoint: all of them without args, the
   * matching ones with partial args. Pass `{ exact: true }` to hit one entry.
   * A shared entry refetches with the shared inputs sent last.
   */
  invalidate: (
    queryClient: QueryClient,
    args?: PartialKeyedInputs<Options, TKeyBy>,
    filters?: InvalidateFilters,
  ) => Promise<void>

  /** The endpoint this query calls. */
  endpoint: EndpointHandler<Options>
}

/** Call arguments as the runtime handles them. */
export type LooseArgs = Record<string, unknown> | undefined

/** TanStack options as the runtime handles them. */
export type LooseOptions = Record<string, unknown> | undefined

function noop() {}

/** Attaches the {@link CacheHelpers} to a query or an infinite query. */
export function attachCacheHelpers<Options extends BaseEndpointOptions>(
  query: Record<string, unknown>,
  keys: KeyBuilder,
  endpoint: EndpointHandler<Options>,
): void {
  query.key = (args?: LooseArgs) => keys.key(args)

  query.getData = (queryClient: QueryClient, args?: LooseArgs) =>
    queryClient.getQueryData(keys.key(args))

  query.setData = (queryClient: QueryClient, args: LooseArgs, updater: unknown) =>
    queryClient.setQueryData(keys.key(args), updater as never)

  query.invalidate = (queryClient: QueryClient, args?: LooseArgs, filters?: LooseOptions) =>
    queryClient.invalidateQueries({ ...filters, queryKey: keys.key(args) })

  query.endpoint = endpoint
}

/** `prefetch` for a `fetch`: resolves with nothing and never rejects. */
export function prefetchFrom<Args>(
  fetch: (queryClient: QueryClient, args?: Args) => Promise<unknown>,
): (queryClient: QueryClient, args?: Args) => Promise<void> {
  return (queryClient, args) => fetch(queryClient, args).then(noop, noop)
}

/**
 * Options of a hook whose args are `skipToken`: the declaration's and the
 * call site's options on a key that is never fetched.
 */
export function skippedOptions(keys: KeyBuilder, defaults: LooseOptions, overrides: LooseOptions) {
  return { ...defaults, ...overrides, queryKey: keys.skipped(), queryFn: skipToken }
}
