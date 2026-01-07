import type {
  AbstractEndpoint,
  AbstractStream,
  AnyEndpointConfig,
  AnyStreamConfig,
  BaseEndpointOptions,
  EndpointHandler,
  EndpointOptions,
  ErrorSchemaRecord,
  HttpMethod,
  StreamHandler,
} from '@navios/builder'
import type {
  InfiniteData,
  MutationFunctionContext,
} from '@tanstack/react-query'
import type { z, ZodObject, ZodType } from 'zod/v4'

import type {
  ClientOptions,
  ProcessResponseFunction,
} from '../common/types.mjs'
import type { MutationArgs } from '../mutation/types.mjs'
import type { ClientInstance } from './types.mjs'
import type { ComputeBaseResult } from './types/helpers.mjs'

import { makeMutation } from '../mutation/make-hook.mjs'
import { makeInfiniteQueryOptions } from '../query/make-infinite-options.mjs'
import { makeQueryOptions } from '../query/make-options.mjs'

/**
 * Configuration for declaring a query endpoint.
 */
export interface QueryConfig<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema extends ZodObject | undefined = undefined,
  Response extends ZodType = ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
  Result = ComputeBaseResult<true, Response, ErrorSchema>,
  RequestSchema extends ZodType | undefined = undefined,
> {
  method: Method
  url: Url
  querySchema?: QuerySchema
  responseSchema: Response
  errorSchema?: ErrorSchema
  requestSchema?: RequestSchema
  processResponse?: (
    data: ComputeBaseResult<true, Response, ErrorSchema>,
  ) => Result
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
  PageResult = ComputeBaseResult<true, Response, ErrorSchema>,
  Result = InfiniteData<PageResult>,
  RequestSchema extends ZodType | undefined = undefined,
> = {
  method: Method
  url: Url
  querySchema: QuerySchema
  responseSchema: Response
  errorSchema?: ErrorSchema
  requestSchema?: RequestSchema
  processResponse?: (
    data: ComputeBaseResult<true, Response, ErrorSchema>,
  ) => PageResult
  select?: (data: InfiniteData<PageResult>) => Result
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
  Method extends 'POST' | 'PUT' | 'PATCH' | 'DELETE' =
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE',
  Url extends string = string,
  RequestSchema extends ZodType | undefined = Method extends 'DELETE'
    ? undefined
    : ZodType,
  QuerySchema extends ZodObject | undefined = undefined,
  Response extends ZodType = ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
  ReqResult = ComputeBaseResult<true, Response, ErrorSchema>,
  Result = unknown,
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
  processResponse: ProcessResponseFunction<Result, ReqResult>
  useContext?: () => Context
  onSuccess?: (
    data: Result,
    variables: MutationArgs<Url, RequestSchema, QuerySchema>,
    context: Context &
      MutationFunctionContext & { onMutateResult: TOnMutateResult | undefined },
  ) => void | Promise<void>
  onError?: (
    err: unknown,
    variables: MutationArgs<Url, RequestSchema, QuerySchema>,
    context: Context &
      MutationFunctionContext & { onMutateResult: TOnMutateResult | undefined },
  ) => void | Promise<void>
  onMutate?: (
    variables: MutationArgs<Url, RequestSchema, QuerySchema>,
    context: Context & MutationFunctionContext,
  ) => TOnMutateResult | Promise<TOnMutateResult>
  onSettled?: (
    data: Result | undefined,
    error: Error | null,
    variables: MutationArgs<Url, RequestSchema, QuerySchema>,
    context: Context &
      MutationFunctionContext & { onMutateResult: TOnMutateResult | undefined },
  ) => void | Promise<void>
  useKey?: UseKey
  meta?: Record<string, unknown>
}

/**
 * Creates a client instance for making type-safe queries and mutations.
 *
 * @template UseDiscriminator - When `true`, errors are returned as union types.
 *   When `false` (default), errors are thrown and not included in TData.
 *
 * @param options - Client configuration including the API builder and defaults
 * @returns A client instance with query, infiniteQuery, and mutation methods
 *
 * @example
 * ```typescript
 * const api = builder({});
 * const client = declareClient({ api });
 *
 * const getUser = client.query({
 *   method: 'GET',
 *   url: '/users/$id',
 *   responseSchema: UserSchema,
 * });
 *
 * // In a component
 * const { data } = useSuspenseQuery(getUser({ urlParams: { id: '123' } }));
 * ```
 */
export function declareClient<UseDiscriminator extends boolean = false>({
  api,
  defaults = {},
}: ClientOptions<UseDiscriminator>): ClientInstance<UseDiscriminator> {
  function query(config: QueryConfig) {
    const endpoint = api.declareEndpoint({
      method: config.method,
      url: config.url,
      querySchema: config.querySchema,
      requestSchema: config.requestSchema,
      responseSchema: config.responseSchema,
      errorSchema: config.errorSchema,
    })

    const queryOptions = makeQueryOptions(endpoint, {
      ...defaults,
      processResponse: config.processResponse ?? ((data) => data),
    })
    // @ts-expect-error We attach the endpoint to the queryOptions
    queryOptions.endpoint = endpoint
    return queryOptions
  }

  function queryFromEndpoint(
    endpoint:
      | AbstractEndpoint<AnyEndpointConfig>
      | EndpointHandler<EndpointOptions, UseDiscriminator>,
    options?: {
      processResponse?: (
        data: z.output<AnyEndpointConfig['responseSchema']>,
      ) => unknown
    },
  ) {
    return makeQueryOptions(endpoint as any, {
      ...defaults,
      processResponse: options?.processResponse ?? ((data) => data),
    })
  }

  function infiniteQuery(config: InfiniteQueryConfig) {
    const endpoint = api.declareEndpoint({
      method: config.method,
      url: config.url,
      querySchema: config.querySchema,
      requestSchema: config.requestSchema,
      responseSchema: config.responseSchema,
      errorSchema: config.errorSchema,
    })
    const infiniteQueryOptions = makeInfiniteQueryOptions(endpoint, {
      ...defaults,
      processResponse: config.processResponse ?? ((data: unknown) => data),
      getNextPageParam: config.getNextPageParam,
      getPreviousPageParam: config.getPreviousPageParam,
      initialPageParam: config.initialPageParam,
    })

    // @ts-expect-error We attach the endpoint to the infiniteQueryOptions
    infiniteQueryOptions.endpoint = endpoint
    return infiniteQueryOptions
  }

  function infiniteQueryFromEndpoint(
    endpoint:
      | AbstractEndpoint<AnyEndpointConfig>
      | EndpointHandler<EndpointOptions, UseDiscriminator>,
    options: {
      processResponse?: (
        data: z.output<AnyEndpointConfig['responseSchema']>,
      ) => unknown
      getNextPageParam: (
        lastPage: z.infer<AnyEndpointConfig['responseSchema']>,
        allPages: z.infer<AnyEndpointConfig['responseSchema']>[],
        lastPageParam: z.infer<AnyEndpointConfig['querySchema']> | undefined,
        allPageParams: z.infer<AnyEndpointConfig['querySchema']>[] | undefined,
      ) => z.input<AnyEndpointConfig['querySchema']> | undefined
      getPreviousPageParam?: (
        firstPage: z.infer<AnyEndpointConfig['responseSchema']>,
        allPages: z.infer<AnyEndpointConfig['responseSchema']>[],
        lastPageParam: z.infer<AnyEndpointConfig['querySchema']> | undefined,
        allPageParams: z.infer<AnyEndpointConfig['querySchema']>[] | undefined,
      ) => z.input<AnyEndpointConfig['querySchema']>
      initialPageParam?: z.input<AnyEndpointConfig['querySchema']>
    },
  ) {
    return makeInfiniteQueryOptions(endpoint, {
      ...defaults,
      processResponse: options?.processResponse ?? ((data) => data),
      getNextPageParam: options.getNextPageParam,
      getPreviousPageParam: options?.getPreviousPageParam,
      initialPageParam: options?.initialPageParam,
    })
  }

  function mutation(config: MutationConfig) {
    const endpoint = api.declareEndpoint({
      method: config.method,
      url: config.url,
      querySchema: config.querySchema,
      requestSchema: config.requestSchema,
      responseSchema: config.responseSchema,
      errorSchema: config.errorSchema,
    })

    // @ts-expect-error Type inference for errorSchema variants
    const useMutation = makeMutation(endpoint, {
      processResponse: config.processResponse ?? ((data: unknown) => data),
      useContext: config.useContext,
      onMutate: config.onMutate,
      onSuccess: config.onSuccess,
      onError: config.onError,
      onSettled: config.onSettled,
      useKey: config.useKey,
      meta: config.meta,
      ...defaults,
    })

    // @ts-expect-error We attach the endpoint to the useMutation
    useMutation.endpoint = endpoint
    return useMutation
  }

  function mutationFromEndpoint(
    endpoint:
      | AbstractEndpoint<AnyEndpointConfig>
      | AbstractStream<AnyStreamConfig>
      | EndpointHandler<EndpointOptions, UseDiscriminator>
      | StreamHandler<BaseEndpointOptions, UseDiscriminator>,
    options?: {
      processResponse?: ProcessResponseFunction
      useContext?: () => unknown
      onMutate?: (
        variables: MutationArgs,
        context: MutationFunctionContext & { [key: string]: unknown },
      ) => unknown | Promise<unknown>
      onSuccess?: (
        data: unknown,
        variables: MutationArgs,
        context: MutationFunctionContext & {
          onMutateResult: unknown | undefined
          [key: string]: unknown
        },
      ) => void | Promise<void>
      onError?: (
        err: unknown,
        variables: MutationArgs,
        context: MutationFunctionContext & {
          onMutateResult: unknown | undefined
          [key: string]: unknown
        },
      ) => void | Promise<void>
      onSettled?: (
        data: unknown | undefined,
        error: Error | null,
        variables: MutationArgs,
        context: MutationFunctionContext & {
          onMutateResult: unknown | undefined
          [key: string]: unknown
        },
      ) => void | Promise<void>
      useKey?: boolean
      meta?: Record<string, unknown>
    },
  ) {
    // @ts-expect-error endpoint types are compatible at runtime
    return makeMutation(endpoint, {
      processResponse: options?.processResponse,
      useContext: options?.useContext,
      onMutate: options?.onMutate,
      onSuccess: options?.onSuccess,
      onError: options?.onError,
      onSettled: options?.onSettled,
      useKey: options?.useKey,
      meta: options?.meta,
      ...defaults,
    })
  }

  function multipartMutation(config: MutationConfig) {
    const endpoint = api.declareMultipart({
      method: config.method,
      url: config.url,
      querySchema: config.querySchema,
      requestSchema: config.requestSchema,
      responseSchema: config.responseSchema,
      errorSchema: config.errorSchema,
    })

    // @ts-expect-error Type inference for errorSchema variants
    const useMutation = makeMutation(endpoint, {
      processResponse: config.processResponse ?? ((data: unknown) => data),
      useContext: config.useContext,
      onSuccess: config.onSuccess,
      onError: config.onError,
      onMutate: config.onMutate,
      onSettled: config.onSettled,
      useKey: config.useKey,
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
    queryFromEndpoint,
    // @ts-expect-error We simplified types here
    infiniteQuery,
    // @ts-expect-error We simplified types here
    infiniteQueryFromEndpoint,
    // @ts-expect-error We simplified types here
    mutation,
    // @ts-expect-error We simplified types here
    mutationFromEndpoint,
    // @ts-expect-error We simplified types here
    multipartMutation,
  }
}
