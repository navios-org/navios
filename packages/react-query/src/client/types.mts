import type {
  BaseEndpointConfig,
  BaseStreamConfig,
  EndpointFunctionArgs,
  HttpMethod,
  UrlHasParams,
  UrlParams,
  Util_FlatObject,
} from '@navios/builder'
import type {
  DataTag,
  InfiniteData,
  QueryClient,
  UseMutationResult,
  UseSuspenseInfiniteQueryOptions,
  UseSuspenseQueryOptions,
} from '@tanstack/react-query'
import type { z, ZodObject, ZodType } from 'zod/v4'

import type { ProcessResponseFunction, Split } from '../common/types.mjs'
import type { MutationArgs, MutationHelpers } from '../mutation/types.mjs'
import type { QueryArgs, QueryHelpers } from '../query/types.mjs'

/**
 * Helper type that attaches the endpoint to query/mutation results.
 */
export type EndpointHelper<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  RequestSchema = unknown,
  ResponseSchema extends z.ZodType = z.ZodType,
  QuerySchema = unknown,
> = {
  endpoint: ((
    params: Util_FlatObject<
      EndpointFunctionArgs<Url, QuerySchema, RequestSchema>
    >,
  ) => Promise<z.output<ResponseSchema>>) & {
    config: BaseEndpointConfig<
      Method,
      Url,
      QuerySchema,
      ResponseSchema,
      RequestSchema
    >
  }
}

// Legacy export for backwards compatibility
/** @deprecated Use EndpointHelper instead */
export type ClientEndpointHelper<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  RequestSchema = unknown,
  ResponseSchema extends z.ZodType = z.ZodType,
  QuerySchema = unknown,
> = EndpointHelper<Method, Url, RequestSchema, ResponseSchema, QuerySchema>

/**
 * Helper type that attaches a stream endpoint to mutation results.
 */
export type StreamHelper<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  RequestSchema = unknown,
  QuerySchema = unknown,
> = {
  endpoint: ((
    params: Util_FlatObject<
      EndpointFunctionArgs<Url, QuerySchema, RequestSchema>
    >,
  ) => Promise<Blob>) & {
    config: BaseStreamConfig<Method, Url, QuerySchema, RequestSchema>
  }
}

/**
 * The main client instance interface.
 * Provides methods for creating queries, infinite queries, and mutations.
 */
export interface ClientInstance {
  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  // Standard query methods (GET, HEAD, OPTIONS) without query schema
  query<
    Method extends 'GET' | 'HEAD' | 'OPTIONS' = 'GET',
    Url extends string = string,
    Response extends ZodType = ZodType,
    Result = z.output<Response>,
  >(config: {
    method: Method
    url: Url
    responseSchema: Response
    processResponse?: (data: z.output<Response>) => Result
  }): ((
    params: Util_FlatObject<QueryArgs<Url, undefined>>,
  ) => UseSuspenseQueryOptions<
    Result,
    Error,
    Result,
    DataTag<Split<Url, '/'>, Result, Error>
  >) &
    QueryHelpers<Url, undefined, Result> &
    EndpointHelper<Method, Url, undefined, Response>

  // Standard query methods (GET, HEAD, OPTIONS) with query schema
  query<
    Method extends 'GET' | 'HEAD' | 'OPTIONS' = 'GET',
    Url extends string = string,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    Result = z.output<Response>,
  >(config: {
    method: Method
    url: Url
    querySchema: QuerySchema
    responseSchema: Response
    processResponse?: (data: z.output<Response>) => Result
  }): ((
    params: Util_FlatObject<QueryArgs<Url, QuerySchema>>,
  ) => UseSuspenseQueryOptions<
    Result,
    Error,
    Result,
    DataTag<Split<Url, '/'>, Result, Error>
  >) &
    QueryHelpers<Url, QuerySchema, Result> &
    EndpointHelper<Method, Url, undefined, Response, QuerySchema>

  // POST query methods (for search endpoints) without query schema
  query<
    Method extends 'POST' = 'POST',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    Response extends ZodType = ZodType,
    Result = z.output<Response>,
  >(config: {
    method: Method
    url: Url
    requestSchema: RequestSchema
    responseSchema: Response
    processResponse?: (data: z.output<Response>) => Result
  }): ((
    params: Util_FlatObject<QueryArgs<Url, undefined, RequestSchema>>,
  ) => UseSuspenseQueryOptions<
    Result,
    Error,
    Result,
    DataTag<Split<Url, '/'>, Result, Error>
  >) &
    QueryHelpers<Url, undefined, Result, false, RequestSchema> &
    EndpointHelper<Method, Url, RequestSchema, Response>

  // POST query methods (for search endpoints) with query schema
  query<
    Method extends 'POST' = 'POST',
    Url extends string = string,
    QuerySchema extends ZodObject = ZodObject,
    RequestSchema extends ZodType = ZodType,
    Response extends ZodType = ZodType,
    Result = z.output<Response>,
  >(config: {
    method: Method
    url: Url
    querySchema: QuerySchema
    requestSchema: RequestSchema
    responseSchema: Response
    processResponse?: (data: z.output<Response>) => Result
  }): ((
    params: Util_FlatObject<QueryArgs<Url, QuerySchema, RequestSchema>>,
  ) => UseSuspenseQueryOptions<
    Result,
    Error,
    Result,
    DataTag<Split<Url, '/'>, Result, Error>
  >) &
    QueryHelpers<Url, QuerySchema, Result, false, RequestSchema> &
    EndpointHelper<Method, Url, RequestSchema, Response, QuerySchema>

  // ============================================================================
  // INFINITE QUERY METHODS
  // ============================================================================

  // Standard infiniteQuery methods (GET, HEAD, OPTIONS)
  infiniteQuery<
    Method extends 'GET' | 'HEAD' | 'OPTIONS' = 'GET',
    Url extends string = string,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    PageResult = z.output<Response>,
    Result = InfiniteData<PageResult>,
  >(config: {
    method: Method
    url: Url
    querySchema: QuerySchema
    responseSchema: Response
    processResponse?: (data: z.output<Response>) => PageResult
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
  }): ((
    params: Util_FlatObject<QueryArgs<Url, QuerySchema>>,
  ) => UseSuspenseInfiniteQueryOptions<
    PageResult,
    Error,
    Result,
    DataTag<Split<Url, '/'>, PageResult, Error>,
    z.output<QuerySchema>
  >) &
    QueryHelpers<Url, QuerySchema, PageResult, true> &
    EndpointHelper<Method, Url, undefined, Response, QuerySchema>

  // POST infiniteQuery methods (for search endpoints)
  infiniteQuery<
    Method extends 'POST' = 'POST',
    Url extends string = string,
    QuerySchema extends ZodObject = ZodObject,
    RequestSchema extends ZodType = ZodType,
    Response extends ZodType = ZodType,
    PageResult = z.output<Response>,
    Result = InfiniteData<PageResult>,
  >(config: {
    method: Method
    url: Url
    querySchema: QuerySchema
    requestSchema: RequestSchema
    responseSchema: Response
    processResponse?: (data: z.output<Response>) => PageResult
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
  }): ((
    params: Util_FlatObject<QueryArgs<Url, QuerySchema, RequestSchema>>,
  ) => UseSuspenseInfiniteQueryOptions<
    PageResult,
    Error,
    Result,
    DataTag<Split<Url, '/'>, PageResult, Error>,
    z.output<QuerySchema>
  >) &
    QueryHelpers<Url, QuerySchema, PageResult, true, RequestSchema> &
    EndpointHelper<Method, Url, RequestSchema, Response, QuerySchema>

  // ============================================================================
  // MUTATION METHODS (POST, PUT, PATCH)
  // ============================================================================

  // With useKey, requestSchema, and querySchema
  mutation<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(config: {
    method: Method
    url: Url
    useKey: UseKey
    requestSchema: RequestSchema
    querySchema: QuerySchema
    responseSchema: Response
    processResponse: ProcessResponseFunction<Result, ReqResult>
    useContext?: () => Context
    onSuccess?: (
      queryClient: QueryClient,
      data: NoInfer<Result>,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context,
    ) => void | Promise<void>
  }): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, QuerySchema>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, RequestSchema, Response, QuerySchema>

  // Without useKey, with requestSchema and querySchema
  mutation<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
  >(config: {
    method: Method
    url: Url
    requestSchema: RequestSchema
    querySchema: QuerySchema
    responseSchema: Response
    processResponse: ProcessResponseFunction<Result, ReqResult>
    useContext?: () => Context
    onSuccess?: (
      queryClient: QueryClient,
      data: NoInfer<Result>,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context,
    ) => void | Promise<void>
  }): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, QuerySchema>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, RequestSchema, Response, QuerySchema>

  // Without useKey, with requestSchema only
  mutation<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
  >(config: {
    method: Method
    url: Url
    requestSchema: RequestSchema
    responseSchema: Response
    processResponse: ProcessResponseFunction<Result, ReqResult>
    useContext?: () => Context
    onSuccess?: (
      queryClient: QueryClient,
      data: NoInfer<Result>,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context,
    ) => void | Promise<void>
  }): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, undefined>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, RequestSchema, Response>

  // With useKey and requestSchema only
  mutation<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(config: {
    method: Method
    url: Url
    useKey: UseKey
    requestSchema: RequestSchema
    responseSchema: Response
    processResponse: ProcessResponseFunction<Result, ReqResult>
    useContext?: () => Context
    onSuccess?: (
      queryClient: QueryClient,
      data: NoInfer<Result>,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context,
    ) => void | Promise<void>
  }): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, undefined>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, RequestSchema, Response>

  // ============================================================================
  // DELETE MUTATION METHODS
  // ============================================================================

  // DELETE with useKey and querySchema
  mutation<
    Method extends 'DELETE' = 'DELETE',
    Url extends string = string,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(config: {
    method: Method
    url: Url
    useKey: UseKey
    querySchema: QuerySchema
    responseSchema: Response
    processResponse: ProcessResponseFunction<Result, ReqResult>
    useContext?: () => Context
    onSuccess?: (
      queryClient: QueryClient,
      data: NoInfer<Result>,
      variables: Util_FlatObject<MutationArgs<Url, undefined, QuerySchema>>,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<MutationArgs<Url, undefined, QuerySchema>>,
      context: Context,
    ) => void | Promise<void>
  }): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, undefined, QuerySchema>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, undefined, Response, QuerySchema>

  // DELETE without useKey, with querySchema
  mutation<
    Method extends 'DELETE' = 'DELETE',
    Url extends string = string,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
  >(config: {
    method: Method
    url: Url
    querySchema: QuerySchema
    responseSchema: Response
    processResponse: ProcessResponseFunction<Result, ReqResult>
    useContext?: () => Context
    onSuccess?: (
      queryClient: QueryClient,
      data: NoInfer<Result>,
      variables: Util_FlatObject<MutationArgs<Url, undefined, QuerySchema>>,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<MutationArgs<Url, undefined, QuerySchema>>,
      context: Context,
    ) => void | Promise<void>
  }): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, undefined, QuerySchema>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, undefined, Response, QuerySchema>

  // DELETE with useKey only (no schemas)
  mutation<
    Method extends 'DELETE' = 'DELETE',
    Url extends string = string,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(config: {
    method: Method
    url: Url
    useKey: UseKey
    responseSchema: Response
    processResponse: ProcessResponseFunction<Result, ReqResult>
    useContext?: () => Context
    onSuccess?: (
      queryClient: QueryClient,
      data: NoInfer<Result>,
      variables: Util_FlatObject<MutationArgs<Url, undefined, undefined>>,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<MutationArgs<Url, undefined, undefined>>,
      context: Context,
    ) => void | Promise<void>
  }): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, undefined, undefined>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, undefined, Response>

  // DELETE without useKey (no schemas)
  mutation<
    Method extends 'DELETE' = 'DELETE',
    Url extends string = string,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
  >(config: {
    method: Method
    url: Url
    responseSchema: Response
    processResponse: ProcessResponseFunction<Result, ReqResult>
    useContext?: () => Context
    onSuccess?: (
      queryClient: QueryClient,
      data: NoInfer<Result>,
      variables: Util_FlatObject<MutationArgs<Url, undefined, undefined>>,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<MutationArgs<Url, undefined, undefined>>,
      context: Context,
    ) => void | Promise<void>
  }): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, undefined, undefined>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, undefined, Response>

  // ============================================================================
  // FROM ENDPOINT METHODS
  // ============================================================================

  queryFromEndpoint<
    Method extends 'GET' | 'HEAD' | 'OPTIONS' = 'GET',
    Url extends string = string,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    Result = z.output<Response>,
  >(
    endpoint: {
      config: BaseEndpointConfig<Method, Url, QuerySchema, Response>
    },
    options?: {
      processResponse?: (data: z.output<Response>) => Result
    },
  ): (
    params: Util_FlatObject<QueryArgs<Url, QuerySchema>>,
  ) => UseSuspenseQueryOptions<
    Result,
    Error,
    Result,
    DataTag<Split<Url, '/'>, Result, Error>
  > &
    QueryHelpers<Url, QuerySchema, Result>

  queryFromEndpoint<
    Method extends 'GET' | 'HEAD' | 'OPTIONS' = 'GET',
    Url extends string = string,
    Response extends ZodType = ZodType,
    Result = z.output<Response>,
  >(
    endpoint: {
      config: BaseEndpointConfig<Method, Url, undefined, Response>
    },
    options?: {
      processResponse?: (data: z.output<Response>) => Result
    },
  ): ((
    params: Util_FlatObject<QueryArgs<Url, undefined>>,
  ) => UseSuspenseQueryOptions<
    Result,
    Error,
    Result,
    DataTag<Split<Url, '/'>, Result, Error>
  >) &
    QueryHelpers<Url, undefined, Result>

  infiniteQueryFromEndpoint<
    Method extends 'GET' | 'HEAD' | 'OPTIONS' = 'GET',
    Url extends string = string,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    PageResult = z.output<Response>,
    Result = InfiniteData<PageResult>,
  >(
    endpoint: {
      config: BaseEndpointConfig<Method, Url, QuerySchema, Response>
    },
    options: {
      processResponse?: (data: z.output<Response>) => PageResult
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
    },
  ): ((
    params: Util_FlatObject<QueryArgs<Url, QuerySchema>>,
  ) => UseSuspenseInfiniteQueryOptions<
    PageResult,
    Error,
    Result,
    DataTag<Split<Url, '/'>, PageResult, Error>,
    z.output<QuerySchema>
  >) &
    QueryHelpers<Url, QuerySchema, PageResult, true>

  // ============================================================================
  // MUTATION FROM ENDPOINT METHODS (POST, PUT, PATCH)
  // ============================================================================

  mutationFromEndpoint<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(
    endpoint: {
      config: BaseEndpointConfig<
        Method,
        Url,
        QuerySchema,
        Response,
        RequestSchema
      >
    },
    mutationOptions: {
      processResponse: ProcessResponseFunction<Result, ReqResult>
      useKey: UseKey
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<
          MutationArgs<Url, RequestSchema, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<
          MutationArgs<Url, RequestSchema, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
    },
  ): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, QuerySchema>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, RequestSchema, Response, QuerySchema>

  mutationFromEndpoint<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(
    endpoint: {
      config: BaseEndpointConfig<
        Method,
        Url,
        undefined,
        Response,
        RequestSchema
      >
    },
    mutationOptions: {
      processResponse: ProcessResponseFunction<Result, ReqResult>
      useKey: UseKey
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
        context: Context,
      ) => void | Promise<void>
    },
  ): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, undefined>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, RequestSchema, Response, undefined>

  mutationFromEndpoint<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
  >(
    endpoint: {
      config: BaseEndpointConfig<
        Method,
        Url,
        QuerySchema,
        Response,
        RequestSchema
      >
    },
    mutationOptions: {
      processResponse: ProcessResponseFunction<Result, ReqResult>
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<
          MutationArgs<Url, RequestSchema, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<
          MutationArgs<Url, RequestSchema, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
    },
  ): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, QuerySchema>
  >) &
    EndpointHelper<Method, Url, RequestSchema, Response, QuerySchema>

  mutationFromEndpoint<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
  >(
    endpoint: {
      config: BaseEndpointConfig<
        Method,
        Url,
        undefined,
        Response,
        RequestSchema
      >
    },
    mutationOptions: {
      processResponse: ProcessResponseFunction<Result, ReqResult>
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
        context: Context,
      ) => void | Promise<void>
    },
  ): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, undefined>
  >) &
    EndpointHelper<Method, Url, RequestSchema, Response, undefined>

  // ============================================================================
  // DELETE MUTATION FROM ENDPOINT METHODS
  // ============================================================================

  mutationFromEndpoint<
    Method extends 'DELETE' = 'DELETE',
    Url extends string = string,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(
    endpoint: {
      config: BaseEndpointConfig<Method, Url, QuerySchema, Response>
    },
    mutationOptions: {
      processResponse: ProcessResponseFunction<Result, ReqResult>
      useKey: UseKey
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<MutationArgs<Url, undefined, QuerySchema>>,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<MutationArgs<Url, undefined, QuerySchema>>,
        context: Context,
      ) => void | Promise<void>
    },
  ): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, undefined, QuerySchema>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, undefined, Response, QuerySchema>

  mutationFromEndpoint<
    Method extends 'DELETE' = 'DELETE',
    Url extends string = string,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(
    endpoint: {
      config: BaseEndpointConfig<Method, Url, undefined, Response>
    },
    mutationOptions: {
      processResponse: ProcessResponseFunction<Result, ReqResult>
      useKey: UseKey
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<MutationArgs<Url, undefined, undefined>>,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<MutationArgs<Url, undefined, undefined>>,
        context: Context,
      ) => void | Promise<void>
    },
  ): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, undefined, undefined>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, undefined, Response, undefined>

  mutationFromEndpoint<
    Method extends 'DELETE' = 'DELETE',
    Url extends string = string,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
  >(
    endpoint: {
      config: BaseEndpointConfig<Method, Url, QuerySchema, Response>
    },
    mutationOptions: {
      processResponse: ProcessResponseFunction<Result, ReqResult>
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<MutationArgs<Url, undefined, QuerySchema>>,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<MutationArgs<Url, undefined, QuerySchema>>,
        context: Context,
      ) => void | Promise<void>
    },
  ): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, undefined, QuerySchema>
  >) &
    EndpointHelper<Method, Url, undefined, Response, QuerySchema>

  mutationFromEndpoint<
    Method extends 'DELETE' = 'DELETE',
    Url extends string = string,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
  >(
    endpoint: {
      config: BaseEndpointConfig<Method, Url, undefined, Response>
    },
    mutationOptions: {
      processResponse: ProcessResponseFunction<Result, ReqResult>
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<MutationArgs<Url, undefined, undefined>>,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<MutationArgs<Url, undefined, undefined>>,
        context: Context,
      ) => void | Promise<void>
    },
  ): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, undefined, undefined>
  >) &
    EndpointHelper<Method, Url, undefined, Response, undefined>

  // ============================================================================
  // MULTIPART MUTATION METHODS
  // ============================================================================

  multipartMutation<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(config: {
    method: Method
    url: Url
    useKey: UseKey
    requestSchema: RequestSchema
    querySchema: QuerySchema
    responseSchema: Response
    processResponse: ProcessResponseFunction<Result, ReqResult>
    useContext?: () => Context
    onSuccess?: (
      queryClient: QueryClient,
      data: NoInfer<Result>,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context,
    ) => void | Promise<void>
  }): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, QuerySchema>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, RequestSchema, Response, QuerySchema>

  multipartMutation<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
  >(config: {
    method: Method
    url: Url
    requestSchema: RequestSchema
    querySchema: QuerySchema
    responseSchema: Response
    processResponse: ProcessResponseFunction<Result, ReqResult>
    useContext?: () => Context
    onSuccess?: (
      queryClient: QueryClient,
      data: NoInfer<Result>,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context,
    ) => void | Promise<void>
  }): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, QuerySchema>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, RequestSchema, Response, QuerySchema>

  multipartMutation<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
  >(config: {
    method: Method
    url: Url
    requestSchema: RequestSchema
    responseSchema: Response
    processResponse: ProcessResponseFunction<Result, ReqResult>
    useContext?: () => Context
    onSuccess?: (
      queryClient: QueryClient,
      data: NoInfer<Result>,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context,
    ) => void | Promise<void>
  }): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, undefined>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, RequestSchema, Response>

  multipartMutation<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(config: {
    method: Method
    url: Url
    useKey: UseKey
    requestSchema: RequestSchema
    responseSchema: Response
    processResponse: ProcessResponseFunction<Result, ReqResult>
    useContext?: () => Context
    onSuccess?: (
      queryClient: QueryClient,
      data: NoInfer<Result>,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context,
    ) => void | Promise<void>
  }): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, undefined>
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, RequestSchema, Response>

  // ============================================================================
  // STREAM MUTATION FROM ENDPOINT METHODS
  // ============================================================================

  // Stream mutation with useKey, requestSchema, and querySchema
  mutationFromEndpoint<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    QuerySchema extends ZodObject = ZodObject,
    Result = Blob,
    Context = unknown,
    UseKey extends true = true,
  >(
    endpoint: {
      config: BaseStreamConfig<Method, Url, QuerySchema, RequestSchema>
    },
    mutationOptions: {
      processResponse?: ProcessResponseFunction<Result, Blob>
      useKey: UseKey
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<
          MutationArgs<Url, RequestSchema, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<
          MutationArgs<Url, RequestSchema, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
    },
  ): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, QuerySchema>
  >) &
    MutationHelpers<Url, Result> &
    StreamHelper<Method, Url, RequestSchema, QuerySchema>

  // Stream mutation without useKey, with requestSchema and querySchema
  mutationFromEndpoint<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    QuerySchema extends ZodObject = ZodObject,
    Result = Blob,
    Context = unknown,
  >(
    endpoint: {
      config: BaseStreamConfig<Method, Url, QuerySchema, RequestSchema>
    },
    mutationOptions?: {
      processResponse?: ProcessResponseFunction<Result, Blob>
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<
          MutationArgs<Url, RequestSchema, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<
          MutationArgs<Url, RequestSchema, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
    },
  ): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, QuerySchema>
  >) &
    StreamHelper<Method, Url, RequestSchema, QuerySchema>

  // Stream mutation with useKey, requestSchema only
  mutationFromEndpoint<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    Result = Blob,
    Context = unknown,
    UseKey extends true = true,
  >(
    endpoint: {
      config: BaseStreamConfig<Method, Url, undefined, RequestSchema>
    },
    mutationOptions: {
      processResponse?: ProcessResponseFunction<Result, Blob>
      useKey: UseKey
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
        context: Context,
      ) => void | Promise<void>
    },
  ): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, undefined>
  >) &
    MutationHelpers<Url, Result> &
    StreamHelper<Method, Url, RequestSchema, undefined>

  // Stream mutation without useKey, with requestSchema only
  mutationFromEndpoint<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    Result = Blob,
    Context = unknown,
  >(
    endpoint: {
      config: BaseStreamConfig<Method, Url, undefined, RequestSchema>
    },
    mutationOptions?: {
      processResponse?: ProcessResponseFunction<Result, Blob>
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<MutationArgs<Url, RequestSchema, undefined>>,
        context: Context,
      ) => void | Promise<void>
    },
  ): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, undefined>
  >) &
    StreamHelper<Method, Url, RequestSchema, undefined>

  // Stream mutation GET methods with useKey and querySchema
  mutationFromEndpoint<
    Method extends 'GET' | 'DELETE' | 'OPTIONS' | 'HEAD' = 'GET',
    Url extends string = string,
    QuerySchema extends ZodObject = ZodObject,
    Result = Blob,
    Context = unknown,
    UseKey extends true = true,
  >(
    endpoint: {
      config: BaseStreamConfig<Method, Url, QuerySchema, undefined>
    },
    mutationOptions: {
      processResponse?: ProcessResponseFunction<Result, Blob>
      useKey: UseKey
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<MutationArgs<Url, undefined, QuerySchema>>,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<MutationArgs<Url, undefined, QuerySchema>>,
        context: Context,
      ) => void | Promise<void>
    },
  ): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, undefined, QuerySchema>
  >) &
    MutationHelpers<Url, Result> &
    StreamHelper<Method, Url, undefined, QuerySchema>

  // Stream mutation GET methods without useKey, with querySchema
  mutationFromEndpoint<
    Method extends 'GET' | 'DELETE' | 'OPTIONS' | 'HEAD' = 'GET',
    Url extends string = string,
    QuerySchema extends ZodObject = ZodObject,
    Result = Blob,
    Context = unknown,
  >(
    endpoint: {
      config: BaseStreamConfig<Method, Url, QuerySchema, undefined>
    },
    mutationOptions?: {
      processResponse?: ProcessResponseFunction<Result, Blob>
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<MutationArgs<Url, undefined, QuerySchema>>,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<MutationArgs<Url, undefined, QuerySchema>>,
        context: Context,
      ) => void | Promise<void>
    },
  ): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, undefined, QuerySchema>
  >) &
    StreamHelper<Method, Url, undefined, QuerySchema>

  // Stream mutation GET methods with useKey only (no schemas)
  mutationFromEndpoint<
    Method extends 'GET' | 'DELETE' | 'OPTIONS' | 'HEAD' = 'GET',
    Url extends string = string,
    Result = Blob,
    Context = unknown,
    UseKey extends true = true,
  >(
    endpoint: {
      config: BaseStreamConfig<Method, Url, undefined, undefined>
    },
    mutationOptions: {
      processResponse?: ProcessResponseFunction<Result, Blob>
      useKey: UseKey
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<MutationArgs<Url, undefined, undefined>>,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<MutationArgs<Url, undefined, undefined>>,
        context: Context,
      ) => void | Promise<void>
    },
  ): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, undefined, undefined>
  >) &
    MutationHelpers<Url, Result> &
    StreamHelper<Method, Url, undefined, undefined>

  // Stream mutation GET methods without useKey (no schemas)
  mutationFromEndpoint<
    Method extends 'GET' | 'DELETE' | 'OPTIONS' | 'HEAD' = 'GET',
    Url extends string = string,
    Result = Blob,
    Context = unknown,
  >(
    endpoint: {
      config: BaseStreamConfig<Method, Url, undefined, undefined>
    },
    mutationOptions?: {
      processResponse?: ProcessResponseFunction<Result, Blob>
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<MutationArgs<Url, undefined, undefined>>,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<MutationArgs<Url, undefined, undefined>>,
        context: Context,
      ) => void | Promise<void>
    },
  ): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, undefined, undefined>
  >) &
    StreamHelper<Method, Url, undefined, undefined>
}
