import type { BaseEndpointOptions, InferEndpointError, InferEndpointReturn } from '@navios/builder'
import type {
  QueryClient,
  UnusedSkipTokenOptions,
  UseQueryOptions,
  UseQueryResult,
  UseSuspenseQueryOptions,
  UseSuspenseQueryResult,
} from '@tanstack/react-query'

import type { AnyKeyBy, KeyedArgs, SendArgs } from '../endpoint/key-by.mjs'
import type { SurfaceOptions } from '../endpoint/surface-options.mjs'
import type { ArgsOf } from '../endpoint/types.mjs'

import type { CacheHelpers } from './cache-helpers.mjs'
import type { HookArgsOf, TaggedKey } from './types.mjs'

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
 * Options of `client.query` and `makeQuery`: the key options, `withResponse`,
 * `keyBy` and the query's TanStack {@link QueryDefaults}.
 *
 * @template TKeyBy - The `keyBy` option; `client.query` and `makeQuery` type it
 *   from the endpoint as `KeyBy<Options>`
 */
export type QuerySettings<
  TData,
  TError,
  WithResponse extends boolean = boolean,
  TKeyBy = AnyKeyBy,
> = SurfaceOptions<WithResponse> &
  QueryDefaults<TData, TError> & {
    /**
     * Which inputs identify a cache entry. Inputs left out are shared by
     * everyone using the entry: a hook or `fetch` that passes them sends them,
     * the entry refetches with them and every component on it gets the
     * result. A call without them uses the ones sent last.
     *
     * - `false`: no input identifies the entry; the endpoint has one entry
     * - `{ params: false }`: the query params are left out (also `urlParams`, `data`)
     * - `{ params: ['role'] }`: only `params.role` identifies the entry
     *
     * @default every input identifies the entry
     *
     * @example
     * ```ts
     * const searchUsers = client.query({
     *   method: 'GET',
     *   url: '/users',
     *   querySchema: z.object({ q: z.string() }),
     *   responseSchema: usersSchema,
     *   keyBy: { params: false },
     * })
     *
     * searchUsers.use({ params: { q } }) // the search box sends `q`
     * searchUsers.use() // anywhere else: the result of the last search
     * ```
     */
    keyBy?: TKeyBy
  }

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
 *
 * @template TKeyBy - The declaration's `keyBy`, `undefined` without one. With
 *   one, the hooks and `fetch` / `prefetch` / `ensure` take the shared inputs
 *   optionally, and the other members take only the inputs that identify the
 *   entry.
 */
export interface QueryObject<
  Options extends BaseEndpointOptions,
  TData = InferEndpointReturn<Options>,
  TError = InferEndpointError<Options>,
  TKeyBy = undefined,
> extends CacheHelpers<Options, TData, TError, TKeyBy> {
  /**
   * Builds TanStack query options for these args. Pass the result to
   * `useQuery`, `useSuspenseQuery`, `useQueries` or `queryClient.query`.
   *
   * With a `keyBy`, it takes only the inputs that identify the entry: options
   * cannot react to a change, so they use the shared inputs sent last.
   */
  (
    ...args: ArgsOf<KeyedArgs<Options, TKeyBy>, [options?: QueryHookOptions<TData, TError>]>
  ): QueryOptionsResult<TData, TError>

  /**
   * `useQuery` for this endpoint. Accepts every TanStack option except
   * `queryKey` / `queryFn`. Pass `skipToken` as args to disable the query
   * until its inputs are known.
   *
   * With a `keyBy`, passing shared inputs sends them: on mount and whenever
   * they change, the entry refetches with them for every component using it.
   * Without them, the hook shows the entry as it is.
   */
  use: <TSelected = TData>(
    ...args: HookArgsOf<
      SendArgs<Options, TKeyBy>,
      [options?: QueryHookOptions<TData, TError, TSelected>]
    >
  ) => UseQueryResult<TSelected, TError>

  /** `useSuspenseQuery` for this endpoint. Sends shared inputs as `use` does. */
  useSuspense: <TSelected = TData>(
    ...args: ArgsOf<
      SendArgs<Options, TKeyBy>,
      [options?: SuspenseQueryHookOptions<TData, TError, TSelected>]
    >
  ) => UseSuspenseQueryResult<TSelected, TError>

  /**
   * Fetches through the cache and resolves with the data; rejects with the
   * endpoint's error. Fresh cached data is returned without a request.
   *
   * With a `keyBy`, shared inputs that differ from those of the cached data
   * are sent and fetched, however fresh the entry is.
   */
  fetch: (queryClient: QueryClient, ...args: ArgsOf<SendArgs<Options, TKeyBy>>) => Promise<TData>

  /**
   * Like `fetch`, but resolves with nothing and never rejects. For warming
   * the cache in loaders and on hover.
   */
  prefetch: (queryClient: QueryClient, ...args: ArgsOf<SendArgs<Options, TKeyBy>>) => Promise<void>

  /**
   * Resolves with cached data when there is any, however old, and fetches
   * only when the cache is empty — or, with a `keyBy`, when the call sends
   * shared inputs other than those of the cached data.
   */
  ensure: (queryClient: QueryClient, ...args: ArgsOf<SendArgs<Options, TKeyBy>>) => Promise<TData>
}
