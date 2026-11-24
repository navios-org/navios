import type {
  BaseEndpointOptions,
  EndpointHandler,
  InferSchemaInput,
  Schema,
} from '@navios/builder'
import type {
  DataTag,
  InfiniteData,
  InvalidateQueryFilters,
  QueryClient,
  SkipToken,
  Updater,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseQueryOptions,
  UseQueryResult,
  UseSuspenseInfiniteQueryOptions,
  UseSuspenseInfiniteQueryResult,
  UseSuspenseQueryOptions,
  UseSuspenseQueryResult,
} from '@tanstack/react-query'

import type {
  ArgsWith,
  EndpointArgs,
  EndpointData,
  EndpointFailure,
  SurfaceOptions,
  PartialEndpointInputs,
  RequiredKeys,
} from '../common/types.mjs'

/** A cache key tagged with the data and error types stored under it. */
export type TaggedKey<TData, TError> = DataTag<readonly unknown[], TData, TError>

/** `[args | skipToken, ...Rest]`, with `args` optional when nothing is required. */
type HookArgsWith<Options extends BaseEndpointOptions, Rest extends unknown[]> = [
  RequiredKeys<EndpointArgs<Options>>,
] extends [never]
  ? [args?: EndpointArgs<Options> | SkipToken, ...rest: Rest]
  : [args: EndpointArgs<Options> | SkipToken, ...rest: Rest]

/** Filters accepted by `invalidate`, minus the key this library builds. */
export type InvalidateFilters = Omit<InvalidateQueryFilters, 'queryKey'>

// =============================================================================
// Query
// =============================================================================

/**
 * Every TanStack `useQuery` option except the two this library owns.
 */
export type QueryHookOptions<TData, TError, TSelected = TData> = Omit<
  UseQueryOptions<TData, TError, TSelected, TaggedKey<TData, TError>>,
  'queryKey' | 'queryFn'
>

/**
 * Every TanStack `useSuspenseQuery` option except the two this library owns.
 */
export type SuspenseQueryHookOptions<TData, TError, TSelected = TData> = Omit<
  UseSuspenseQueryOptions<TData, TError, TSelected, TaggedKey<TData, TError>>,
  'queryKey' | 'queryFn'
>

/** Options object produced by calling a query; accepted by `useQuery`, `useSuspenseQuery`, `useQueries` and `queryClient.query`. */
export type QueryOptionsResult<TData, TError> = UseSuspenseQueryOptions<
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

// =============================================================================
// Infinite query
// =============================================================================

/** Endpoint options usable for an infinite query: a `querySchema` is required. */
export type InfiniteEndpointOptions = BaseEndpointOptions & { querySchema: Schema }

/**
 * The page param: query params merged over the call's `params` for each page.
 */
export type PageParam<Options extends InfiniteEndpointOptions> = InferSchemaInput<
  Options['querySchema']
>

/** Pagination settings for an infinite query. */
export type InfiniteQuerySettings<
  Options extends InfiniteEndpointOptions,
  TPage = EndpointData<Options>,
  WithResponse extends boolean = boolean,
> = SurfaceOptions<WithResponse> & {
  /**
   * Returns the query params for the next page, or `undefined` / `null` when
   * there are no more pages. The returned object is merged over the call's
   * `params`.
   */
  getNextPageParam: (
    lastPage: TPage,
    allPages: TPage[],
    lastPageParam: PageParam<Options>,
    allPageParams: PageParam<Options>[],
  ) => PageParam<Options> | undefined | null
  getPreviousPageParam?: (
    firstPage: TPage,
    allPages: TPage[],
    firstPageParam: PageParam<Options>,
    allPageParams: PageParam<Options>[],
  ) => PageParam<Options> | undefined | null
  /** Defaults to the call's `params`. */
  initialPageParam?: PageParam<Options>
}

export type InfiniteQueryHookOptions<TPage, TError, TPageParam, TSelected> = Omit<
  UseInfiniteQueryOptions<
    TPage,
    TError,
    TSelected,
    TaggedKey<InfiniteData<TPage, TPageParam>, TError>,
    TPageParam
  >,
  'queryKey' | 'queryFn' | 'getNextPageParam' | 'getPreviousPageParam' | 'initialPageParam'
>

export type SuspenseInfiniteQueryHookOptions<TPage, TError, TPageParam, TSelected> = Omit<
  UseSuspenseInfiniteQueryOptions<
    TPage,
    TError,
    TSelected,
    TaggedKey<InfiniteData<TPage, TPageParam>, TError>,
    TPageParam
  >,
  'queryKey' | 'queryFn' | 'getNextPageParam' | 'getPreviousPageParam' | 'initialPageParam'
>

export type InfiniteQueryOptionsResult<TPage, TError, TPageParam> = UseSuspenseInfiniteQueryOptions<
  TPage,
  TError,
  InfiniteData<TPage, TPageParam>,
  TaggedKey<InfiniteData<TPage, TPageParam>, TError>,
  TPageParam
> & { queryKey: TaggedKey<InfiniteData<TPage, TPageParam>, TError> }

/**
 * An infinite query bound to one endpoint. Same helpers as {@link QueryObject};
 * the cached value is `InfiniteData<Page, PageParam>`.
 */
export type InfiniteQueryObject<
  Options extends InfiniteEndpointOptions,
  TPage = EndpointData<Options>,
  TError = EndpointFailure<Options>,
  TPageParam = PageParam<Options>,
  TData = InfiniteData<TPage, TPageParam>,
> = {
  (
    ...args: ArgsWith<
      Options,
      [options?: InfiniteQueryHookOptions<TPage, TError, TPageParam, TData>]
    >
  ): InfiniteQueryOptionsResult<TPage, TError, TPageParam>

  key: (args?: PartialEndpointInputs<Options>) => TaggedKey<TData, TError>

  use: <TSelected = TData>(
    ...args: HookArgsWith<
      Options,
      [options?: InfiniteQueryHookOptions<TPage, TError, TPageParam, TSelected>]
    >
  ) => UseInfiniteQueryResult<TSelected, TError>

  useSuspense: <TSelected = TData>(
    ...args: ArgsWith<
      Options,
      [options?: SuspenseInfiniteQueryHookOptions<TPage, TError, TPageParam, TSelected>]
    >
  ) => UseSuspenseInfiniteQueryResult<TSelected, TError>

  fetch: (queryClient: QueryClient, ...args: ArgsWith<Options>) => Promise<TData>
  prefetch: (queryClient: QueryClient, ...args: ArgsWith<Options>) => Promise<void>
  ensure: (queryClient: QueryClient, ...args: ArgsWith<Options>) => Promise<TData>
  getData: (queryClient: QueryClient, ...args: ArgsWith<Options>) => TData | undefined
  setData: (
    queryClient: QueryClient,
    args: EndpointArgs<Options>,
    updater: Updater<TData | undefined, TData | undefined>,
  ) => TData | undefined
  invalidate: (
    queryClient: QueryClient,
    args?: PartialEndpointInputs<Options>,
    filters?: InvalidateFilters,
  ) => Promise<void>

  endpoint: EndpointHandler<Options>
}

/** Anything that can produce a cache key: a query or an infinite query. */
export type AnyQueryObject = { key: (args?: any) => readonly unknown[] }
