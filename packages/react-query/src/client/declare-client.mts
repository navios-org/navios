import type {
  BaseEndpointOptions,
  EndpointHandler,
  EndpointOptions,
  ErrorSchemaRecord,
  HttpMethod,
  StreamHandler,
} from '@navios/builder'
import type { MutationFunctionContext } from '@tanstack/react-query'
import type { z, ZodObject, ZodType } from 'zod/v4'

import { makeMutation } from '../mutation/make-hook.mjs'
import { makeInfiniteQueryOptions } from '../query/make-infinite-options.mjs'
import { makeQueryOptions } from '../query/make-options.mjs'

import type { ClientOptions } from '../common/types.mjs'
import type { MutationArgs } from '../mutation/types.mjs'
import type { InfiniteUnwrapMode, UnwrapMode } from '../query/types.mjs'

import type { ClientInstance } from './types.mjs'

/**
 * Configuration for declaring a query endpoint.
 */
export interface QueryConfig<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema extends ZodObject | undefined = undefined,
  Response extends ZodType = ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
  RequestSchema extends ZodType | undefined = undefined,
> {
  method: Method
  url: Url
  querySchema?: QuerySchema
  responseSchema: Response
  errorSchema?: ErrorSchema
  requestSchema?: RequestSchema
  unwrap?: UnwrapMode
  result?: 'data' | 'envelope'
  validateResponse?: boolean
  keyPrefix?: string[]
  keySuffix?: string[]
}

/**
 * Configuration for declaring an infinite query endpoint.
 */
export type InfiniteQueryConfig<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema extends ZodObject = ZodObject,
  Response extends ZodType = ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
  PageResult = z.output<Response>,
  RequestSchema extends ZodType | undefined = undefined,
> = {
  method: Method
  url: Url
  querySchema: QuerySchema
  responseSchema: Response
  errorSchema?: ErrorSchema
  requestSchema?: RequestSchema
  unwrap?: InfiniteUnwrapMode
  result?: 'data' | 'envelope'
  validateResponse?: boolean
  keyPrefix?: string[]
  keySuffix?: string[]
  getNextPageParam: (
    lastPage: PageResult,
    allPages: PageResult[],
    lastPageParam: z.infer<QuerySchema> | undefined,
    allPageParams: z.infer<QuerySchema>[] | undefined,
  ) => z.input<QuerySchema> | undefined
  getPreviousPageParam?: (
    firstPage: PageResult,
    allPages: PageResult[],
    lastPageParam: z.infer<QuerySchema> | undefined,
    allPageParams: z.infer<QuerySchema>[] | undefined,
  ) => z.input<QuerySchema>
  initialPageParam?: z.input<QuerySchema>
}

/**
 * Configuration for declaring a mutation endpoint.
 */
export interface MutationConfig<
  Method extends 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  Url extends string = string,
  RequestSchema extends ZodType | undefined = Method extends 'DELETE' ? undefined : ZodType,
  QuerySchema extends ZodObject | undefined = undefined,
  Response extends ZodType = ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
  Result = z.output<Response>,
  TOnMutateResult = unknown,
  Context = unknown,
  UseKey extends boolean = false,
> {
  method: Method
  url: Url
  querySchema?: QuerySchema
  responseSchema: Response
  errorSchema?: ErrorSchema
  requestSchema?: RequestSchema
  unwrap?: UnwrapMode
  result?: 'data' | 'envelope'
  validateResponse?: boolean
  useContext?: () => Context
  onSuccess?: (
    data: Result,
    variables: MutationArgs<Url, RequestSchema, QuerySchema>,
    context: Context & MutationFunctionContext & { onMutateResult: TOnMutateResult | undefined },
  ) => void | Promise<void>
  onError?: (
    err: unknown,
    variables: MutationArgs<Url, RequestSchema, QuerySchema>,
    context: Context & MutationFunctionContext & { onMutateResult: TOnMutateResult | undefined },
  ) => void | Promise<void>
  onMutate?: (
    variables: MutationArgs<Url, RequestSchema, QuerySchema>,
    context: Context & MutationFunctionContext,
  ) => TOnMutateResult | Promise<TOnMutateResult>
  onSettled?: (
    data: Result | undefined,
    error: Error | null,
    variables: MutationArgs<Url, RequestSchema, QuerySchema>,
    context: Context & MutationFunctionContext & { onMutateResult: TOnMutateResult | undefined },
  ) => void | Promise<void>
  useKey?: UseKey
  meta?: Record<string, unknown>
}

/**
 * Type guard: distinguishes an existing endpoint handler from an inline config.
 *
 * Endpoint handlers from `api.declareEndpoint` / `api.declareMultipart` /
 * `api.declareStream` are callable functions with an attached `config`
 * property. Inline configs are plain objects.
 */
function isEndpointHandler(
  input: unknown,
): input is EndpointHandler<EndpointOptions> | StreamHandler<BaseEndpointOptions> {
  return typeof input === 'function' && 'config' in input
}

/**
 * Extract the underlying `EndpointOptions` from an inline config, dropping
 * surface-specific fields (`unwrap`, `keyPrefix`, `keySuffix`, mutation
 * callbacks, `useContext`, `useKey`, `meta`, infinite-query pagination
 * callbacks) which `api.declareEndpoint` does not understand.
 */
function extractEndpointOptions(config: Record<string, unknown>): EndpointOptions {
  return {
    method: config.method,
    url: config.url,
    querySchema: config.querySchema,
    requestSchema: config.requestSchema,
    responseSchema: config.responseSchema,
    errorSchema: config.errorSchema,
    urlParamsSchema: config.urlParamsSchema,
    result: config.result,
    validateResponse: config.validateResponse,
    clientOptions: config.clientOptions,
  } as EndpointOptions
}

/**
 * Creates a client instance for making type-safe queries and mutations.
 *
 * Each surface method (`query`, `infiniteQuery`, `mutation`, `multipart`)
 * accepts either an inline endpoint config or an existing endpoint handler
 * produced by `api.declareEndpoint` / `api.declareMultipart`.
 *
 * @param options - Client configuration including the API builder and defaults
 * @returns A client instance with `query`, `infiniteQuery`, `mutation`, and
 *   `multipart` methods.
 *
 * @example
 * ```typescript
 * const api = builder({});
 * const client = declareClient({ api });
 *
 * // Inline config
 * const getUser = client.query({
 *   method: 'GET',
 *   url: '/users/$id',
 *   responseSchema: UserSchema,
 * });
 *
 * // From an existing endpoint
 * const getUserEndpoint = api.declareEndpoint({
 *   method: 'GET',
 *   url: '/users/$id',
 *   responseSchema: UserSchema,
 * });
 * const getUserFromEndpoint = client.query(getUserEndpoint);
 * ```
 */
export function declareClient({ api, defaults = {} }: ClientOptions): ClientInstance {
  function query(input: any, options: any = {}) {
    let endpoint: EndpointHandler<EndpointOptions>
    let unwrap: UnwrapMode | undefined
    let keyPrefix: string[] | undefined
    let keySuffix: string[] | undefined

    if (isEndpointHandler(input)) {
      endpoint = input as EndpointHandler<EndpointOptions>
      unwrap = options?.unwrap
      keyPrefix = options?.keyPrefix
      keySuffix = options?.keySuffix
    } else {
      endpoint = api.declareEndpoint(extractEndpointOptions(input))
      unwrap = input.unwrap ?? options?.unwrap
      keyPrefix = input.keyPrefix ?? options?.keyPrefix
      keySuffix = input.keySuffix ?? options?.keySuffix
    }

    const queryOptions = makeQueryOptions(endpoint, {
      ...defaults,
      ...(keyPrefix !== undefined ? { keyPrefix } : {}),
      ...(keySuffix !== undefined ? { keySuffix } : {}),
      unwrap,
    })
    // @ts-expect-error We attach the endpoint to the queryOptions
    queryOptions.endpoint = endpoint
    return queryOptions
  }

  function infiniteQuery(input: any, options: any = {}) {
    let endpoint: EndpointHandler<EndpointOptions>
    let unwrap: InfiniteUnwrapMode | undefined
    let keyPrefix: string[] | undefined
    let keySuffix: string[] | undefined
    let getNextPageParam: any
    let getPreviousPageParam: any
    let initialPageParam: any

    if (isEndpointHandler(input)) {
      endpoint = input as EndpointHandler<EndpointOptions>
      unwrap = options?.unwrap
      keyPrefix = options?.keyPrefix
      keySuffix = options?.keySuffix
      getNextPageParam = options.getNextPageParam
      getPreviousPageParam = options?.getPreviousPageParam
      initialPageParam = options?.initialPageParam
    } else {
      endpoint = api.declareEndpoint(extractEndpointOptions(input))
      unwrap = input.unwrap ?? options?.unwrap
      keyPrefix = input.keyPrefix ?? options?.keyPrefix
      keySuffix = input.keySuffix ?? options?.keySuffix
      getNextPageParam = input.getNextPageParam ?? options?.getNextPageParam
      getPreviousPageParam = input.getPreviousPageParam ?? options?.getPreviousPageParam
      initialPageParam = input.initialPageParam ?? options?.initialPageParam
    }

    const infiniteQueryOptions = makeInfiniteQueryOptions(endpoint as any, {
      ...defaults,
      ...(keyPrefix !== undefined ? { keyPrefix } : {}),
      ...(keySuffix !== undefined ? { keySuffix } : {}),
      unwrap,
      getNextPageParam,
      getPreviousPageParam,
      initialPageParam,
    })

    // @ts-expect-error We attach the endpoint to the infiniteQueryOptions
    infiniteQueryOptions.endpoint = endpoint
    return infiniteQueryOptions
  }

  function mutation(input: any, options: any = {}) {
    let endpoint: EndpointHandler<EndpointOptions> | StreamHandler<BaseEndpointOptions>
    let surfaceFields: Record<string, unknown>

    if (isEndpointHandler(input)) {
      endpoint = input
      surfaceFields = options ?? {}
    } else {
      endpoint = api.declareEndpoint(extractEndpointOptions(input))
      surfaceFields = input
    }

    // @ts-expect-error Type inference for errorSchema variants
    const useMutation = makeMutation(endpoint, {
      unwrap: surfaceFields.unwrap,
      useContext: surfaceFields.useContext,
      onMutate: surfaceFields.onMutate,
      onSuccess: surfaceFields.onSuccess,
      onError: surfaceFields.onError,
      onSettled: surfaceFields.onSettled,
      useKey: surfaceFields.useKey,
      meta: surfaceFields.meta,
      ...defaults,
    })

    // @ts-expect-error We attach the endpoint to the useMutation
    useMutation.endpoint = endpoint
    return useMutation
  }

  function multipart(input: any, options: any = {}) {
    let endpoint: EndpointHandler<EndpointOptions>
    let surfaceFields: Record<string, unknown>

    if (isEndpointHandler(input)) {
      endpoint = input as EndpointHandler<EndpointOptions>
      surfaceFields = options ?? {}
    } else {
      endpoint = api.declareMultipart(extractEndpointOptions(input))
      surfaceFields = input
    }

    // @ts-expect-error Type inference for errorSchema variants
    const useMutation = makeMutation(endpoint, {
      unwrap: surfaceFields.unwrap,
      useContext: surfaceFields.useContext,
      onSuccess: surfaceFields.onSuccess,
      onError: surfaceFields.onError,
      onMutate: surfaceFields.onMutate,
      onSettled: surfaceFields.onSettled,
      useKey: surfaceFields.useKey,
      meta: surfaceFields.meta,
      ...defaults,
    })

    // @ts-expect-error We attach the endpoint to the useMutation
    useMutation.endpoint = endpoint
    return useMutation
  }

  return {
    // @ts-expect-error We simplified types here
    query,
    // @ts-expect-error We simplified types here
    infiniteQuery,
    // @ts-expect-error We simplified types here
    mutation,
    // @ts-expect-error We simplified types here
    multipart,
  }
}
