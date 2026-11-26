import type { BaseEndpointOptions, EndpointHandler } from '@navios/builder'
import type {
  QueryClient,
  UnusedSkipTokenOptions,
  Updater,
  UseQueryOptions,
  UseQueryResult,
  UseSuspenseQueryOptions,
  UseSuspenseQueryResult,
} from '@tanstack/react-query'

import type { SurfaceOptions } from '../endpoint/surface-options.mjs'
import type {
  ArgsWith,
  EndpointArgs,
  EndpointData,
  EndpointFailure,
  PartialEndpointInputs,
} from '../endpoint/types.mjs'

import type { HookArgsWith, InvalidateFilters, TaggedKey } from './types.mjs'

/**
 * Every TanStack `useQuery` option except the two this library owns.
 */
export type QueryHookOptions<TData, TError, TSelected = TData> = Omit<
  UseQueryOptions<TData, TError, TSelected, TaggedKey<TData, TError>>,
  'queryKey' | 'queryFn'
>

/**
 * TanStack options a query declaration sets for every use of the query: its
 * hooks, the options its call returns, and `fetch` / `prefetch` / `ensure`
 * (which use what applies outside a component: `staleTime`, `gcTime`,
 * `retry`, `meta`, ...). Options given at a call site win.
 *
 * `select`, `initialData` and `initialDataUpdatedAt` are left to the call
 * site: `select` would change the query's data type, and initial data
 * belongs to one set of arguments.
 */
export type QueryDefaults<TData, TError> = Omit<
  QueryHookOptions<TData, TError>,
  'select' | 'initialData' | 'initialDataUpdatedAt'
>

/**
 * Options of `client.query` and `makeQuery`: the key options, `withResponse`
 * and the query's TanStack {@link QueryDefaults}.
 */
export type QuerySettings<
  TData,
  TError,
  WithResponse extends boolean = boolean,
> = SurfaceOptions<WithResponse> & QueryDefaults<TData, TError>

/**
 * Every TanStack `useSuspenseQuery` option except the two this library owns.
 */
export type SuspenseQueryHookOptions<TData, TError, TSelected = TData> = Omit<
  UseSuspenseQueryOptions<TData, TError, TSelected, TaggedKey<TData, TError>>,
  'queryKey' | 'queryFn'
>

/**
 * Options object produced by calling a query; accepted by `useQuery`,
 * `useSuspenseQuery`, `useQueries`, `useSuspenseQueries` and
 * `queryClient.query`.
 *
 * It is the type TanStack's own `queryOptions()` returns. That matters for
 * `useQueries`, which reads the error type off `throwOnError` — a property
 * the suspense-only options type does not have.
 */
export type QueryOptionsResult<TData, TError> = UnusedSkipTokenOptions<
  TData,
  TError,
  TData,
  TaggedKey<TData, TError>
> & { queryKey: TaggedKey<TData, TError> }

/**
 * A query bound to one endpoint.
 *
 * Call it to get TanStack query options; use the attached helpers for hooks
 * and typed cache access.
 */
export type QueryObject<
  Options extends BaseEndpointOptions,
  TData = EndpointData<Options>,
  TError = EndpointFailure<Options>,
> = {
  /**
   * Builds TanStack query options for these args. Pass the result to
   * `useQuery`, `useSuspenseQuery`, `useQueries` or `queryClient.query`.
   */
  (
    ...args: ArgsWith<Options, [options?: QueryHookOptions<TData, TError>]>
  ): QueryOptionsResult<TData, TError>

  /**
   * Cache key for the given args.
   *
   * - no args: prefix of every entry of this endpoint
   * - partial args: prefix of every entry that matches them
   * - full args: the exact key
   */
  key: (args?: PartialEndpointInputs<Options>) => TaggedKey<TData, TError>

  /**
   * `useQuery` for this endpoint. Accepts every TanStack option except
   * `queryKey` / `queryFn`. Pass `skipToken` as args to disable the query
   * until its inputs are known.
   */
  use: <TSelected = TData>(
    ...args: HookArgsWith<Options, [options?: QueryHookOptions<TData, TError, TSelected>]>
  ) => UseQueryResult<TSelected, TError>

  /** `useSuspenseQuery` for this endpoint. */
  useSuspense: <TSelected = TData>(
    ...args: ArgsWith<Options, [options?: SuspenseQueryHookOptions<TData, TError, TSelected>]>
  ) => UseSuspenseQueryResult<TSelected, TError>

  /**
   * Fetches through the cache and resolves with the data; rejects with the
   * endpoint's error. Fresh cached data is returned without a request.
   */
  fetch: (queryClient: QueryClient, ...args: ArgsWith<Options>) => Promise<TData>

  /**
   * Like `fetch`, but resolves with nothing and never rejects. For warming
   * the cache in loaders and on hover.
   */
  prefetch: (queryClient: QueryClient, ...args: ArgsWith<Options>) => Promise<void>

  /**
   * Resolves with cached data when there is any, however old, and fetches
   * only when the cache is empty.
   */
  ensure: (queryClient: QueryClient, ...args: ArgsWith<Options>) => Promise<TData>

  /** Reads the cached data for these args. */
  getData: (queryClient: QueryClient, ...args: ArgsWith<Options>) => TData | undefined

  /** Writes the cached data for these args. */
  setData: (
    queryClient: QueryClient,
    args: EndpointArgs<Options>,
    updater: Updater<TData | undefined, TData | undefined>,
  ) => TData | undefined

  /**
   * Invalidates entries of this endpoint: all of them without args, the
   * matching ones with partial args. Pass `{ exact: true }` to hit one entry.
   */
  invalidate: (
    queryClient: QueryClient,
    args?: PartialEndpointInputs<Options>,
    filters?: InvalidateFilters,
  ) => Promise<void>

  /** The endpoint this query calls. */
  endpoint: EndpointHandler<Options>
}
