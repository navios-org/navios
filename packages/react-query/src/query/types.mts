import type {
  AnyEndpointConfig,
  BaseEndpointConfig,
  HttpMethod,
  UrlHasParams,
  UrlParams,
  Util_FlatObject,
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
 * Arguments for query functions based on URL params and query schema.
 */
export type QueryArgs<
  Url extends string = string,
  QuerySchema = ZodObject,
  RequestSchema = undefined,
> = (UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {}) &
  (QuerySchema extends ZodObject ? { params: z.input<QuerySchema> } : {}) &
  (RequestSchema extends ZodType ? { data: z.input<RequestSchema> } : {})

/**
 * Arguments containing only URL params (for invalidateAll operations).
 */
export type QueryUrlParamsArgs<Url extends string = string> =
  UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {} | undefined

/**
 * Base parameters for query configuration.
 */
export type QueryParams<Config extends AnyEndpointConfig, Res = any> = {
  keyPrefix?: string[]
  keySuffix?: string[]
  onFail?: (err: unknown) => void
  processResponse: (data: z.output<Config['responseSchema']>) => Res
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
  ) => DataTag<
    Split<Url, '/'>,
    IsInfinite extends true ? InfiniteData<Result> : Result,
    Error
  >
  filterKey: (
    params: HasParams extends true ? { urlParams: UrlParams<Url> } : {},
  ) => DataTag<
    Split<Url, '/'>,
    IsInfinite extends true ? InfiniteData<Result> : Result,
    Error
  >
  bindToUrl: (
    params: (HasParams extends true ? { urlParams: UrlParams<Url> } : {}) &
      (QuerySchema extends ZodObject ? { params: z.infer<QuerySchema> } : {}),
  ) => string
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
  use: (
    params: Util_FlatObject<QueryArgs<Url, QuerySchema, RequestSchema>>,
  ) => UseQueryResult<Result, Error>
  useSuspense: (
    params: Util_FlatObject<QueryArgs<Url, QuerySchema, RequestSchema>>,
  ) => UseSuspenseQueryResult<Result, Error>
  invalidate: (
    queryClient: QueryClient,
    params: Util_FlatObject<QueryArgs<Url, QuerySchema, RequestSchema>>,
  ) => () => Promise<void>
  invalidateAll: (
    queryClient: QueryClient,
    params: Util_FlatObject<QueryUrlParamsArgs<Url>>,
  ) => () => Promise<void>
}

/**
 * Options for infinite query configuration.
 */
export type InfiniteQueryOptions<
  Config extends BaseEndpointConfig<HttpMethod, string, ZodObject>,
  Res = any,
> = {
  keyPrefix?: string[]
  keySuffix?: string[]
  processResponse: (data: z.infer<Config['responseSchema']>) => Res
  onFail?: (err: unknown) => void
  getNextPageParam: (
    lastPage: Res,
    allPages: Res[],
    lastPageParam: z.infer<Config['querySchema']> | undefined,
    allPageParams: z.infer<Config['querySchema']>[] | undefined,
  ) =>
    | z.input<Config['querySchema']>
    | z.infer<Config['querySchema']>
    | undefined
  getPreviousPageParam?: (
    firstPage: Res,
    allPages: Res[],
    lastPageParam: z.infer<Config['querySchema']> | undefined,
    allPageParams: z.infer<Config['querySchema']>[] | undefined,
  ) => z.input<Config['querySchema']>
  initialPageParam?:
    | z.input<Config['querySchema']>
    | z.infer<Config['querySchema']>
}

// Legacy type aliases for backwards compatibility
/** @deprecated Use QueryArgs instead */
export type ClientQueryArgs<
  Url extends string = string,
  QuerySchema = ZodObject,
  RequestSchema = undefined,
> = QueryArgs<Url, QuerySchema, RequestSchema>

/** @deprecated Use QueryUrlParamsArgs instead */
export type ClientQueryUrlParamsArgs<Url extends string = string> =
  QueryUrlParamsArgs<Url>

/** @deprecated Use QueryParams instead */
export type BaseQueryParams<
  Config extends AnyEndpointConfig,
  Res = unknown,
> = QueryParams<Config, Res>

/** @deprecated Use QueryArgs instead */
export type BaseQueryArgs<Config extends AnyEndpointConfig> = (UrlHasParams<
  Config['url']
> extends true
  ? { urlParams: UrlParams<Config['url']> }
  : {}) &
  (Config['querySchema'] extends ZodObject
    ? { params: z.input<Config['querySchema']> }
    : {})
