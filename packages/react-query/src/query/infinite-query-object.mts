import type {
  BaseEndpointOptions,
  EndpointHandler,
  InferSchemaInput,
  Schema,
} from '@navios/builder'
import type {
  InfiniteData,
  QueryClient,
  Updater,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseSuspenseInfiniteQueryOptions,
  UseSuspenseInfiniteQueryResult,
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
