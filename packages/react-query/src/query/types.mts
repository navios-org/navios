import type {
  ClientRequestArgs,
  EndpointOptions,
  EnvelopeError,
  ErrorSchemaRecord,
  InferEndpointReturn,
  ResponseEnvelope,
  Simplify,
  UrlHasParams,
  UrlParams,
} from '@navios/builder'
import type {
  DataTag,
  InfiniteData,
  QueryClient,
  UseQueryResult,
  UseSuspenseQueryResult,
} from '@tanstack/react-query'
import type { z, ZodObject, ZodType } from 'zod/v4'

import type { Split } from '../common/types.mjs'

/**
 * Controls how `@navios/react-query` handles `result: 'envelope'` endpoints.
 *
 * - `'none'` (default): the `ResponseEnvelope` is stored verbatim as the
 *   cached `data`; React Query's error channel is unused.
 * - `'throw-on-error'`: on `envelope.ok === false` the `envelope.error` is
 *   thrown from the queryFn so React Query's `error` channel fires. On
 *   success, the unwrapped `envelope.data` is cached.
 *
 * Has no effect on non-envelope endpoints.
 */
export type UnwrapMode = 'none' | 'throw-on-error'

/**
 * Like {@link UnwrapMode} but with an extra `'pages'` mode for infinite
 * queries.
 *
 * - `'none'` (default): each entry in `data.pages[i]` is the full
 *   `ResponseEnvelope`.
 * - `'throw-on-error'`: each page's envelope is unwrapped; on
 *   `envelope.ok === false` the `envelope.error` is thrown from the queryFn
 *   so React Query's `error` channel fires and pagination stops.
 * - `'pages'`: recommended mode for infinite queries. Currently behaves
 *   identically to `'throw-on-error'` — success pages are unwrapped to the
 *   `envelope.data` body and errors throw. The separate name leaves room to
 *   diverge later (e.g. surface per-page errors without aborting the page
 *   chain) and signals intent at the call site.
 *
 * Has no effect on non-envelope endpoints.
 */
export type InfiniteUnwrapMode = 'none' | 'throw-on-error' | 'pages'

/**
 * Result type for an envelope-mode endpoint given an `UnwrapMode`.
 *
 * - `'throw-on-error'` → unwrapped success data (envelope.data on the ok branch).
 * - `'none'` (default) → full `ResponseEnvelope` discriminated union.
 */
export type EnvelopeQueryResult<
  Options extends EndpointOptions,
  Unwrap extends UnwrapMode = 'none',
> = Unwrap extends 'throw-on-error'
  ? z.output<Options['responseSchema']>
  : ResponseEnvelope<
      z.output<Options['responseSchema']>,
      EnvelopeError<
        Options['errorSchema'] extends ErrorSchemaRecord ? Options['errorSchema'] : undefined
      >
    >

/**
 * The error type produced by the queryFn for an envelope-mode endpoint when
 * `unwrap: 'throw-on-error'`. Non-envelope endpoints fall back to `Error`.
 */
export type EnvelopeQueryError<Options extends EndpointOptions> = EnvelopeError<
  Options['errorSchema'] extends ErrorSchemaRecord ? Options['errorSchema'] : undefined
>

/**
 * Helper type that resolves the data-channel type for an endpoint.
 *
 * This is the inferred endpoint return type — kept as a named alias so
 * downstream surfaces can reference a single canonical name.
 */
export type QueryResult<Options extends EndpointOptions> = InferEndpointReturn<Options>

/**
 * Arguments for query functions based on URL params and query schema.
 * Uses ClientRequestArgs from builder for consistency.
 */
export type QueryArgs<
  Url extends string = string,
  QuerySchema extends ZodObject | undefined = undefined,
  RequestSchema extends ZodType | undefined = undefined,
> = ClientRequestArgs<{ url: Url; querySchema: QuerySchema; requestSchema: RequestSchema }>

/**
 * Arguments containing only URL params (for invalidateAll operations).
 */
export type QueryUrlParamsArgs<Url extends string = string> =
  UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {} | undefined

/**
 * Base parameters for query configuration.
 */
export type QueryParams<_Options extends EndpointOptions> = {
  keyPrefix?: string[]
  keySuffix?: string[]
}

/**
 * Result type from the query key creator function.
 */
export type QueryKeyCreatorResult<
  QuerySchema = undefined,
  Url extends string = string,
  Result = unknown,
  IsInfinite extends boolean = false,
  HasParams extends UrlHasParams<Url> = UrlHasParams<Url>,
> = {
  template: Split<Url, '/'>
  dataTag: (
    params: (HasParams extends true ? { urlParams: UrlParams<Url> } : {}) &
      (QuerySchema extends ZodObject ? { params: z.input<QuerySchema> } : {}),
  ) => DataTag<Split<Url, '/'>, IsInfinite extends true ? InfiniteData<Result> : Result, Error>
  filterKey: (
    params: HasParams extends true ? { urlParams: UrlParams<Url> } : {},
  ) => DataTag<Split<Url, '/'>, IsInfinite extends true ? InfiniteData<Result> : Result, Error>
  bindToUrl: (
    params: (HasParams extends true ? { urlParams: UrlParams<Url> } : {}) &
      (QuerySchema extends ZodObject ? { params: z.infer<QuerySchema> } : {}),
  ) => string
}

/**
 * Per-call options accepted by `use` / `useSuspense`.
 *
 * Conservative subset of TanStack's query options. Currently only `select`
 * is supported — it transforms the cached `Result` into `TSelected` and
 * narrows the hook's `data` type accordingly. The transform runs after the
 * queryFn (and after any envelope unwrap), letting components pull
 * component-specific projections without redeclaring the query.
 *
 * If a per-call `select` is provided it overrides any construction-time
 * `baseQuery.select`. We may widen this surface (e.g. `enabled`,
 * `staleTime`) later — start conservative.
 */
export type UseQueryCallOptions<Result, TSelected> = {
  select?: (data: Result) => TSelected
}

/**
 * Helper methods attached to query options.
 */
export type QueryHelpers<
  Url extends string,
  QuerySchema extends ZodObject | undefined = undefined,
  Result = undefined,
  IsInfinite extends boolean = false,
  RequestSchema extends ZodType | undefined = undefined,
> = {
  queryKey: QueryKeyCreatorResult<QuerySchema, Url, Result, IsInfinite>
  use: <TSelected = Result>(
    params: Simplify<QueryArgs<Url, QuerySchema, RequestSchema>>,
    opts?: UseQueryCallOptions<Result, TSelected>,
  ) => UseQueryResult<TSelected, Error>
  useSuspense: <TSelected = Result>(
    params: Simplify<QueryArgs<Url, QuerySchema, RequestSchema>>,
    opts?: UseQueryCallOptions<Result, TSelected>,
  ) => UseSuspenseQueryResult<TSelected, Error>
  invalidate: (
    queryClient: QueryClient,
    params: Simplify<QueryArgs<Url, QuerySchema, RequestSchema>>,
  ) => () => Promise<void>
  invalidateAll: (
    queryClient: QueryClient,
    params: Simplify<QueryUrlParamsArgs<Url>>,
  ) => () => Promise<void>
}

/**
 * Options for infinite query configuration.
 */
export type InfiniteQueryOptions<
  Config extends EndpointOptions & {
    querySchema: ZodObject
  },
  Res = z.output<Config['responseSchema']>,
> = {
  keyPrefix?: string[]
  keySuffix?: string[]
  /**
   * For endpoints declared with `result: 'envelope'`, controls how each page
   * is delivered to React Query.
   *
   * - `'none'` (default): each `data.pages[i]` is the full `ResponseEnvelope`.
   * - `'throw-on-error'`: each page's envelope is unwrapped; on
   *   `envelope.ok === false` the `envelope.error` is thrown from the queryFn
   *   so the React Query `error` channel fires and pagination stops.
   * - `'pages'`: recommended for infinite queries. Currently identical to
   *   `'throw-on-error'` at runtime — success pages are unwrapped to
   *   `envelope.data` and errors throw. The separate name signals intent and
   *   leaves room for divergence later.
   *
   * Has no effect on non-envelope endpoints. Note: `getNextPageParam` /
   * `getPreviousPageParam` receive whatever shape this mode produces — the
   * full envelope under `'none'`, the unwrapped body under `'throw-on-error'`
   * / `'pages'`.
   */
  unwrap?: InfiniteUnwrapMode
  getNextPageParam: (
    lastPage: Res,
    allPages: Res[],
    lastPageParam: z.infer<Config['querySchema']> | undefined,
    allPageParams: z.infer<Config['querySchema']>[] | undefined,
  ) => z.input<Config['querySchema']> | z.infer<Config['querySchema']> | undefined
  getPreviousPageParam?: (
    firstPage: Res,
    allPages: Res[],
    lastPageParam: z.infer<Config['querySchema']> | undefined,
    allPageParams: z.infer<Config['querySchema']>[] | undefined,
  ) => z.input<Config['querySchema']>
  initialPageParam?: z.input<Config['querySchema']> | z.infer<Config['querySchema']>
}

// Legacy type aliases for backwards compatibility
/** @deprecated Use QueryArgs instead */
export type ClientQueryArgs<
  Url extends string = string,
  QuerySchema extends ZodObject = ZodObject,
  RequestSchema extends ZodType | undefined = undefined,
> = QueryArgs<Url, QuerySchema, RequestSchema>

/** @deprecated Use QueryUrlParamsArgs instead */
export type ClientQueryUrlParamsArgs<Url extends string = string> = QueryUrlParamsArgs<Url>

/** @deprecated Use QueryParams instead */
export type BaseQueryParams<Options extends EndpointOptions> = QueryParams<Options>

/** @deprecated Use QueryArgs instead */
export type BaseQueryArgs<Options extends EndpointOptions> = (UrlHasParams<
  Options['url']
> extends true
  ? { urlParams: UrlParams<Options['url']> }
  : {}) &
  (Options['querySchema'] extends ZodObject ? { params: z.input<Options['querySchema']> } : {})
