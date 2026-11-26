import type { BaseEndpointOptions, InferSchemaInput, Schema } from '@navios/builder'
import type {
  InfiniteData,
  QueryClient,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseSuspenseInfiniteQueryOptions,
  UseSuspenseInfiniteQueryResult,
} from '@tanstack/react-query'

import type { SurfaceOptions } from '../endpoint/surface-options.mjs'
import type { ArgsWith, EndpointData, EndpointFailure } from '../endpoint/types.mjs'

import type { CacheHelpers } from './cache-helpers.mjs'
import type { HookArgsWith, TaggedKey } from './types.mjs'

/** Endpoint options usable for an infinite query: a `querySchema` is required. */
export type InfiniteEndpointOptions = BaseEndpointOptions & { querySchema: Schema }

/**
 * The page param: query params merged over the call's `params` for each page.
 */
export type PageParam<Options extends InfiniteEndpointOptions> = InferSchemaInput<
  Options['querySchema']
>

/**
 * Settings of an infinite query: pagination, the key options, `withResponse`
 * and the query's TanStack {@link InfiniteQueryDefaults}.
 */
export type InfiniteQuerySettings<
  Options extends InfiniteEndpointOptions,
  TPage = EndpointData<Options>,
  WithResponse extends boolean = boolean,
  TError = EndpointFailure<Options>,
> = SurfaceOptions<WithResponse> &
  InfiniteQueryDefaults<TPage, TError, PageParam<Options>> & {
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
 * the cached value is `InfiniteData<Page, PageParam>`.
 */
export interface InfiniteQueryObject<
  Options extends InfiniteEndpointOptions,
  TPage = EndpointData<Options>,
  TError = EndpointFailure<Options>,
  TPageParam = PageParam<Options>,
  TData = InfiniteData<TPage, TPageParam>,
> extends CacheHelpers<Options, TData, TError> {
  (
    ...args: ArgsWith<
      Options,
      [options?: InfiniteQueryHookOptions<TPage, TError, TPageParam, TData>]
    >
  ): InfiniteQueryOptionsResult<TPage, TError, TPageParam>

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
}
