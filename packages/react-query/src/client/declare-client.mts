import type {
  AbstractEndpoint,
  AnyEndpointConfig,
  HttpMethod,
} from '@navios/builder'
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { z, ZodObject, ZodType } from 'zod/v4'

import type { ClientOptions, ProcessResponseFunction } from '../common/types.mjs'
import type { MutationArgs } from '../mutation/types.mjs'
import type { ClientInstance } from './types.mjs'

import { makeMutation } from '../mutation/make-hook.mjs'
import { makeInfiniteQueryOptions } from '../query/make-infinite-options.mjs'
import { makeQueryOptions } from '../query/make-options.mjs'

/**
 * Configuration for declaring a query endpoint.
 */
export interface QueryConfig<
  Method = HttpMethod,
  Url = string,
  QuerySchema = ZodObject,
  Response extends ZodType = ZodType,
  Result = z.output<Response>,
  RequestSchema = unknown,
> {
  method: Method
  url: Url
  querySchema?: QuerySchema
  responseSchema: Response
  requestSchema?: RequestSchema
  processResponse?: (data: z.output<Response>) => Result
}

/**
 * Configuration for declaring an infinite query endpoint.
 */
export type InfiniteQueryConfig<
  Method = HttpMethod,
  Url = string,
  QuerySchema extends ZodObject = ZodObject,
  Response extends ZodType = ZodType,
  PageResult = z.output<Response>,
  Result = InfiniteData<PageResult>,
  RequestSchema = unknown,
> = {
  method: Method
  url: Url
  querySchema: QuerySchema
  responseSchema: Response
  requestSchema?: RequestSchema
  processResponse?: (data: z.output<Response>) => PageResult
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
  RequestSchema = Method extends 'DELETE' ? never : ZodObject,
  QuerySchema = unknown,
  Response extends ZodType = ZodType,
  ReqResult = z.output<Response>,
  Result = unknown,
  Context = unknown,
  UseKey extends boolean = false,
> {
  method: Method
  url: Url
  querySchema?: QuerySchema
  responseSchema: Response
  requestSchema?: RequestSchema
  processResponse: ProcessResponseFunction<Result, ReqResult>
  useContext?: () => Context
  onSuccess?: (
    queryClient: QueryClient,
    data: NoInfer<Result>,
    variables: MutationArgs<Url, RequestSchema, QuerySchema>,
    context: Context,
  ) => void | Promise<void>
  onError?: (
    queryClient: QueryClient,
    error: Error,
    variables: MutationArgs<Url, RequestSchema, QuerySchema>,
    context: Context,
  ) => void | Promise<void>
  useKey?: UseKey
}

/**
 * Creates a client instance for making type-safe queries and mutations.
 *
 * @param options - Client configuration including the API builder and defaults
 * @returns A client instance with query, infiniteQuery, and mutation methods
 *
 * @example
 * ```typescript
 * const api = createBuilder({ baseUrl: '/api' });
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
export function declareClient<Options extends ClientOptions>({
  api,
  defaults = {},
}: Options): ClientInstance {
  function query(config: QueryConfig) {
    const endpoint = api.declareEndpoint({
      // @ts-expect-error we accept only specific methods
      method: config.method,
      url: config.url,
      querySchema: config.querySchema,
      requestSchema: config.requestSchema,
      responseSchema: config.responseSchema,
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
    endpoint: AbstractEndpoint<AnyEndpointConfig>,
    options?: {
      processResponse?: (
        data: z.output<AnyEndpointConfig['responseSchema']>,
      ) => unknown
    },
  ) {
    return makeQueryOptions(endpoint, {
      ...defaults,
      processResponse: options?.processResponse ?? ((data) => data),
    })
  }

  function infiniteQuery(config: InfiniteQueryConfig) {
    const endpoint = api.declareEndpoint({
      // @ts-expect-error we accept only specific methods
      method: config.method,
      url: config.url,
      querySchema: config.querySchema,
      requestSchema: config.requestSchema,
      responseSchema: config.responseSchema,
    })
    const infiniteQueryOptions = makeInfiniteQueryOptions(endpoint, {
      ...defaults,
      processResponse: config.processResponse ?? ((data) => data),
      getNextPageParam: config.getNextPageParam,
      getPreviousPageParam: config.getPreviousPageParam,
      initialPageParam: config.initialPageParam,
    })

    // @ts-expect-error We attach the endpoint to the infiniteQueryOptions
    infiniteQueryOptions.endpoint = endpoint
    return infiniteQueryOptions
  }

  function infiniteQueryFromEndpoint(
    endpoint: AbstractEndpoint<AnyEndpointConfig>,
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
      // @ts-expect-error We forgot about the DELETE method in original makeMutation
      method: config.method,
      url: config.url,
      querySchema: config.querySchema,
      requestSchema: config.requestSchema,
      responseSchema: config.responseSchema,
    })

    const useMutation = makeMutation(endpoint, {
      processResponse: config.processResponse ?? ((data) => data),
      useContext: config.useContext,
      // @ts-expect-error We forgot about the DELETE method in original makeMutation
      onSuccess: config.onSuccess,
      // @ts-expect-error We forgot about the DELETE method in original makeMutation
      onError: config.onError,
      useKey: config.useKey,
      ...defaults,
    })

    // @ts-expect-error We attach the endpoint to the useMutation
    useMutation.endpoint = endpoint
    return useMutation
  }

  function mutationFromEndpoint(
    endpoint: AbstractEndpoint<AnyEndpointConfig>,
    options: {
      processResponse: ProcessResponseFunction
      useContext?: () => unknown
      onSuccess?: (
        queryClient: QueryClient,
        data: unknown,
        variables: MutationArgs,
        context: unknown,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: MutationArgs,
        context: unknown,
      ) => void | Promise<void>
    },
  ) {
    return makeMutation(endpoint, {
      processResponse: options.processResponse,
      useContext: options.useContext,
      onSuccess: options.onSuccess,
      // @ts-expect-error simplify types here
      onError: options.onError,
      ...defaults,
    })
  }

  function multipartMutation(config: MutationConfig) {
    const endpoint = api.declareMultipart({
      // @ts-expect-error we accept only specific methods
      method: config.method,
      url: config.url,
      querySchema: config.querySchema,
      requestSchema: config.requestSchema,
      responseSchema: config.responseSchema,
    })

    const useMutation = makeMutation(endpoint, {
      processResponse: config.processResponse ?? ((data) => data),
      useContext: config.useContext,
      // @ts-expect-error We forgot about the DELETE method in original makeMutation
      onSuccess: config.onSuccess,
      // @ts-expect-error We forgot about the DELETE method in original makeMutation
      onError: config.onError,
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
