import type {
  BaseEndpointOptions,
  ClientRequestArgs,
  InferEndpointError,
  InferEndpointReturn,
  InferSchemaInput,
  Schema,
} from '@navios/builder'
import type {
  InfiniteData,
  QueryClient,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseSuspenseInfiniteQueryOptions,
  UseSuspenseInfiniteQueryResult,
} from '@tanstack/react-query'

import type { SurfaceOptions } from '../endpoint/surface-options.mjs'
import type { ArgsOf } from '../endpoint/types.mjs'

import type { CacheHelpers } from './cache-helpers.mjs'
import type { HookArgsOf, TaggedKey } from './types.mjs'

/** Endpoint options usable for an infinite query: a `querySchema` is required. */
export type InfiniteEndpointOptions = BaseEndpointOptions & { querySchema: Schema }

/**
 * The query params of one page: the call's `params` with the page param merged
 * over them.
 */
export type PageParam<Options extends InfiniteEndpointOptions> = InferSchemaInput<
  Options['querySchema']
>

/**
 * A page param as it is returned and cached: the query params that change from
 * page to page. The rest comes from the call's `params`.
 */
export type PartialPageParam<Options extends InfiniteEndpointOptions> = Partial<PageParam<Options>>

/**
 * Settings of an infinite query: pagination, the key options, `withResponse`
 * and the query's TanStack {@link InfiniteQueryDefaults}.
 */
export type InfiniteQuerySettings<
  Options extends InfiniteEndpointOptions,
  TPage = InferEndpointReturn<Options>,
  WithResponse extends boolean = boolean,
  TError = InferEndpointError<Options>,
> = SurfaceOptions<WithResponse> &
  InfiniteQueryDefaults<TPage, TError, PartialPageParam<Options>> & {
    /**
     * Returns the query params that change for the next page, or `undefined` /
     * `null` when there are no more pages. The returned object is merged over
     * the call's `params`, so it only has to hold what changes.
     *
     * `lastPageParam` and `allPageParams` are the query params the pages were
     * requested with: the page params merged over the call's `params`.
     */
    getNextPageParam: (
      lastPage: TPage,
      allPages: TPage[],
      lastPageParam: PageParam<Options>,
      allPageParams: PageParam<Options>[],
    ) => PartialPageParam<Options> | undefined | null
    /** Like `getNextPageParam`, for the page before the first one. */
    getPreviousPageParam?: (
      firstPage: TPage,
      allPages: TPage[],
      firstPageParam: PageParam<Options>,
      allPageParams: PageParam<Options>[],
    ) => PartialPageParam<Options> | undefined | null
    /** Merged over the call's `params` for the first page. Defaults to those `params`. */
    initialPageParam?: PartialPageParam<Options>
  }

/**
 * TanStack options an infinite query declaration sets for every use of it;
 * options given at a call site win. As for `QueryDefaults`, `select` and
 * initial data are left to the call site.
 */
export type InfiniteQueryDefaults<TPage, TError, TPageParam> = Omit<
  InfiniteQueryHookOptions<TPage, TError, TPageParam, InfiniteData<TPage, TPageParam>>,
  'select' | 'initialData' | 'initialDataUpdatedAt'
>

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
 * the cached value is `InfiniteData<Page, PartialPageParam>`.
 */
export interface InfiniteQueryObject<
  Options extends InfiniteEndpointOptions,
  TPage = InferEndpointReturn<Options>,
  TError = InferEndpointError<Options>,
  TPageParam = PartialPageParam<Options>,
  TData = InfiniteData<TPage, TPageParam>,
> extends CacheHelpers<Options, TData, TError> {
  (
    ...args: ArgsOf<
      ClientRequestArgs<Options>,
      [options?: InfiniteQueryHookOptions<TPage, TError, TPageParam, TData>]
    >
  ): InfiniteQueryOptionsResult<TPage, TError, TPageParam>

  use: <TSelected = TData>(
    ...args: HookArgsOf<
      ClientRequestArgs<Options>,
      [options?: InfiniteQueryHookOptions<TPage, TError, TPageParam, TSelected>]
    >
  ) => UseInfiniteQueryResult<TSelected, TError>

  useSuspense: <TSelected = TData>(
    ...args: ArgsOf<
      ClientRequestArgs<Options>,
      [options?: SuspenseInfiniteQueryHookOptions<TPage, TError, TPageParam, TSelected>]
    >
  ) => UseSuspenseInfiniteQueryResult<TSelected, TError>

  fetch: (queryClient: QueryClient, ...args: ArgsOf<ClientRequestArgs<Options>>) => Promise<TData>
  prefetch: (queryClient: QueryClient, ...args: ArgsOf<ClientRequestArgs<Options>>) => Promise<void>
  ensure: (queryClient: QueryClient, ...args: ArgsOf<ClientRequestArgs<Options>>) => Promise<TData>
}
