import type {
  AnyEndpointConfig,
  BaseEndpointConfig,
  EndpointOptions,
  ErrorSchemaRecord,
  HttpMethod,
  InferEndpointReturn,
  InferErrorSchemaOutput,
  RequestArgs,
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
 * Compute the response input type based on discriminator and error schema.
 * When UseDiscriminator=true and errorSchema is present, errors are included as a union.
 * When UseDiscriminator=false, only the success type is returned (errors are thrown).
 *
 * @template UseDiscriminator - Whether to include error types in the response union
 * @template ResponseSchema - The success response schema
 * @template ErrorSchema - The error schema record (optional)
 */
type ComputeResponseInput<
  UseDiscriminator extends boolean,
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined,
> = UseDiscriminator extends true
  ? ErrorSchema extends ErrorSchemaRecord
    ? z.output<ResponseSchema> | InferErrorSchemaOutput<ErrorSchema>
    : z.output<ResponseSchema>
  : z.output<ResponseSchema>

/**
 * Helper type to extract the result type from processResponse.
 */
export type QueryResult<
  Options extends EndpointOptions,
  UseDiscriminator extends boolean = false,
> = Options extends {
  processResponse: (data: any) => infer Result
}
  ? Result
  : InferEndpointReturn<Options, UseDiscriminator>

/**
 * Arguments for query functions based on URL params and query schema.
 * Uses RequestArgs from builder for consistency.
 */
export type QueryArgs<
  Url extends string = string,
  QuerySchema extends ZodObject | undefined = undefined,
  RequestSchema extends ZodType | undefined = undefined,
> = RequestArgs<Url, QuerySchema, RequestSchema>

/**
 * Arguments containing only URL params (for invalidateAll operations).
 */
export type QueryUrlParamsArgs<Url extends string = string> =
  UrlHasParams<Url> extends true
    ? { urlParams: UrlParams<Url> }
    : {} | undefined

/**
 * Base parameters for query configuration.
 *
 * @template UseDiscriminator - When `true`, errors are returned as union types in processResponse.
 *   When `false` (default), errors are thrown and not included in the response type.
 */
export type QueryParams<
  Config extends AnyEndpointConfig,
  Res = any,
  UseDiscriminator extends boolean = false,
> = {
  keyPrefix?: string[]
  keySuffix?: string[]
  onFail?: (err: unknown) => void
  processResponse: (
    data: ComputeResponseInput<
      UseDiscriminator,
      Config['responseSchema'],
      Config['errorSchema']
    >,
  ) => Res
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
    params: Simplify<QueryArgs<Url, QuerySchema, RequestSchema>>,
  ) => UseQueryResult<Result, Error>
  useSuspense: (
    params: Simplify<QueryArgs<Url, QuerySchema, RequestSchema>>,
  ) => UseSuspenseQueryResult<Result, Error>
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
 *
 * @template UseDiscriminator - When `true`, errors are returned as union types in processResponse.
 *   When `false` (default), errors are thrown and not included in the response type.
 */
export type InfiniteQueryOptions<
  Config extends BaseEndpointConfig<HttpMethod, string, ZodObject>,
  Res = any,
  UseDiscriminator extends boolean = false,
> = {
  keyPrefix?: string[]
  keySuffix?: string[]
  processResponse: (
    data: ComputeResponseInput<
      UseDiscriminator,
      Config['responseSchema'],
      Config['errorSchema']
    >,
  ) => Res
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
  QuerySchema extends ZodObject = ZodObject,
  RequestSchema extends ZodType | undefined = undefined,
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
