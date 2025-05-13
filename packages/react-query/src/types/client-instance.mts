import type {
  BaseEndpointConfig,
  UrlHasParams,
  UrlParams,
  Util_FlatObject,
} from '@navios/common'
import type {
  DataTag,
  InfiniteData,
  QueryClient,
  UseMutationResult,
  UseSuspenseInfiniteQueryOptions,
  UseSuspenseQueryOptions,
} from '@tanstack/react-query'
import type { AnyZodObject, z, ZodType } from 'zod'

import type { ProcessResponseFunction, Split } from '../types.mjs'
import type { ClientEndpointHelper } from './client-endpoint-helper.mjs'
import type { ClientMutationArgs } from './mutation-args.mjs'
import type { MutationHelpers } from './mutation-helpers.mjs'
import type { ClientQueryArgs } from './query-args.mjs'
import type { QueryHelpers } from './query-helpers.mjs'

export interface ClientInstance {
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
    params: Util_FlatObject<ClientQueryArgs<Url, undefined>>,
  ) => UseSuspenseQueryOptions<
    Result,
    Error,
    Result,
    DataTag<Split<Url, '/'>, Result, Error>
  >) &
    QueryHelpers<Url, undefined, Result> &
    ClientEndpointHelper<Method, Url, undefined, Response>

  query<
    Method extends 'GET' | 'HEAD' | 'OPTIONS' = 'GET',
    Url extends string = string,
    QuerySchema extends AnyZodObject = AnyZodObject,
    Response extends ZodType = ZodType,
    Result = z.output<Response>,
  >(config: {
    method: Method
    url: Url
    querySchema: QuerySchema
    responseSchema: Response
    processResponse?: (data: z.output<Response>) => Result
  }): ((
    params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
  ) => UseSuspenseQueryOptions<
    Result,
    Error,
    Result,
    DataTag<Split<Url, '/'>, Result, Error>
  >) &
    QueryHelpers<Url, QuerySchema, Result> &
    ClientEndpointHelper<Method, Url, undefined, Response, QuerySchema>

  infiniteQuery<
    Method extends 'GET' | 'HEAD' | 'OPTIONS' = 'GET',
    Url extends string = string,
    QuerySchema extends AnyZodObject = AnyZodObject,
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
    params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
  ) => UseSuspenseInfiniteQueryOptions<
    PageResult,
    Error,
    Result,
    PageResult,
    DataTag<Split<Url, '/'>, PageResult, Error>,
    z.output<QuerySchema>
  >) &
    QueryHelpers<Url, QuerySchema, PageResult, true> &
    ClientEndpointHelper<Method, Url, undefined, Response, QuerySchema>

  mutation<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    QuerySchema extends AnyZodObject = AnyZodObject,
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
      variables: Util_FlatObject<
        ClientMutationArgs<Url, RequestSchema, QuerySchema>
      >,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<
        ClientMutationArgs<Url, RequestSchema, QuerySchema>
      >,
      context: Context,
    ) => void | Promise<void>
  }): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, RequestSchema, QuerySchema>
  >) &
    MutationHelpers<Url, Result> &
    ClientEndpointHelper<Method, Url, RequestSchema, Response, QuerySchema>

  mutation<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    QuerySchema extends AnyZodObject = AnyZodObject,
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
      variables: Util_FlatObject<
        ClientMutationArgs<Url, RequestSchema, QuerySchema>
      >,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<
        ClientMutationArgs<Url, RequestSchema, QuerySchema>
      >,
      context: Context,
    ) => void | Promise<void>
  }): (() => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, RequestSchema, QuerySchema>
  >) &
    ClientEndpointHelper<Method, Url, RequestSchema, Response, QuerySchema>

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
      variables: Util_FlatObject<
        ClientMutationArgs<Url, RequestSchema, undefined>
      >,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<
        ClientMutationArgs<Url, RequestSchema, undefined>
      >,
      context: Context,
    ) => void | Promise<void>
  }): (() => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, RequestSchema, undefined>
  >) &
    MutationHelpers<Url, Result> &
    ClientEndpointHelper<Method, Url, RequestSchema, Response>

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
      variables: Util_FlatObject<
        ClientMutationArgs<Url, RequestSchema, undefined>
      >,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<
        ClientMutationArgs<Url, RequestSchema, undefined>
      >,
      context: Context,
    ) => void | Promise<void>
  }): ((
    params: UrlHasParams<Url> extends true ? UrlParams<Url> : {},
  ) => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, RequestSchema, undefined>
  >) &
    MutationHelpers<Url, Result> &
    ClientEndpointHelper<Method, Url, RequestSchema, Response>

  mutation<
    Method extends 'DELETE' = 'DELETE',
    Url extends string = string,
    QuerySchema extends AnyZodObject = AnyZodObject,
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
      variables: Util_FlatObject<
        ClientMutationArgs<Url, undefined, QuerySchema>
      >,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<
        ClientMutationArgs<Url, undefined, QuerySchema>
      >,
      context: Context,
    ) => void | Promise<void>
  }): ((
    params: UrlHasParams<Url> extends true ? UrlParams<Url> : {},
  ) => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, undefined, QuerySchema>
  >) &
    MutationHelpers<Url, Result> &
    ClientEndpointHelper<Method, Url, undefined, Response, QuerySchema>

  mutation<
    Method extends 'DELETE' = 'DELETE',
    Url extends string = string,
    QuerySchema extends AnyZodObject = AnyZodObject,
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
      variables: Util_FlatObject<
        ClientMutationArgs<Url, undefined, QuerySchema>
      >,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<
        ClientMutationArgs<Url, undefined, QuerySchema>
      >,
      context: Context,
    ) => void | Promise<void>
  }): (() => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, undefined, QuerySchema>
  >) &
    ClientEndpointHelper<Method, Url, undefined, Response, QuerySchema>

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
      variables: Util_FlatObject<ClientMutationArgs<Url, undefined, undefined>>,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<ClientMutationArgs<Url, undefined, undefined>>,
      context: Context,
    ) => void | Promise<void>
  }): ((
    params: UrlHasParams<Url> extends true ? UrlParams<Url> : {},
  ) => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, undefined, undefined>
  >) &
    MutationHelpers<Url, Result> &
    ClientEndpointHelper<Method, Url, undefined, Response>

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
      variables: Util_FlatObject<ClientMutationArgs<Url, undefined, undefined>>,
      context: Context,
    ) => void | Promise<void>
    onError?: (
      queryClient: QueryClient,
      error: Error,
      variables: Util_FlatObject<ClientMutationArgs<Url, undefined, undefined>>,
      context: Context,
    ) => void | Promise<void>
  }): (() => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, undefined, undefined>
  >) &
    ClientEndpointHelper<Method, Url, undefined, Response>

  queryFromEndpoint<
    Method extends 'GET' | 'HEAD' | 'OPTIONS' = 'GET',
    Url extends string = string,
    QuerySchema extends AnyZodObject = AnyZodObject,
    Response extends ZodType = ZodType,
    Result = z.output<Response>,
  >(
    endpoint: any & {
      config: BaseEndpointConfig<Method, Url, QuerySchema, Response>
    },
    options?: {
      processResponse?: (data: z.output<Response>) => Result
    },
  ): (
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
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
    endpoint: any & {
      config: BaseEndpointConfig<Method, Url, undefined, Response>
    },
    options?: {
      processResponse?: (data: z.output<Response>) => Result
    },
  ): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
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
    QuerySchema extends AnyZodObject = AnyZodObject,
    Response extends ZodType = ZodType,
    PageResult = z.output<Response>,
    Result = InfiniteData<PageResult>,
  >(
    endpoint: any & {
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
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseSuspenseInfiniteQueryOptions<
    PageResult,
    Error,
    Result,
    PageResult,
    DataTag<Split<Url, '/'>, PageResult, Error>,
    z.output<QuerySchema>
  >) &
    QueryHelpers<Url, QuerySchema, PageResult, true>

  mutationFromEndpoint<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    QuerySchema extends AnyZodObject = AnyZodObject,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(
    endpoint: any & {
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
          ClientMutationArgs<Url, RequestSchema, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<
          ClientMutationArgs<Url, RequestSchema, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
    },
  ): ((
    params: UrlHasParams<Url> extends true ? UrlParams<Url> : {},
  ) => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, RequestSchema, QuerySchema>
  >) &
    MutationHelpers<Url, Result> &
    ClientEndpointHelper<Method, Url, RequestSchema, Response, QuerySchema>

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
    endpoint: any & {
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
        variables: Util_FlatObject<
          ClientMutationArgs<Url, RequestSchema, undefined>
        >,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<
          ClientMutationArgs<Url, RequestSchema, undefined>
        >,
        context: Context,
      ) => void | Promise<void>
    },
  ): ((
    params: UrlHasParams<Url> extends true ? UrlParams<Url> : {},
  ) => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, RequestSchema, undefined>
  >) &
    MutationHelpers<Url, Result> &
    ClientEndpointHelper<Method, Url, RequestSchema, Response, undefined>

  mutationFromEndpoint<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    QuerySchema extends AnyZodObject = AnyZodObject,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
  >(
    endpoint: any & {
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
          ClientMutationArgs<Url, RequestSchema, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<
          ClientMutationArgs<Url, RequestSchema, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
    },
  ): (() => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, RequestSchema, QuerySchema>
  >) &
    ClientEndpointHelper<Method, Url, RequestSchema, Response, QuerySchema>

  mutationFromEndpoint<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
  >(
    endpoint: any & {
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
        variables: Util_FlatObject<
          ClientMutationArgs<Url, RequestSchema, undefined>
        >,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<
          ClientMutationArgs<Url, RequestSchema, undefined>
        >,
        context: Context,
      ) => void | Promise<void>
    },
  ): (() => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, RequestSchema, undefined>
  >) &
    ClientEndpointHelper<Method, Url, RequestSchema, Response, undefined>

  mutationFromEndpoint<
    Method extends 'DELETE' = 'DELETE',
    Url extends string = string,
    QuerySchema extends AnyZodObject = AnyZodObject,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(
    endpoint: any & {
      config: BaseEndpointConfig<Method, Url, QuerySchema, Response>
    },
    mutationOptions: {
      processResponse: ProcessResponseFunction<Result, ReqResult>
      useKey: UseKey
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<
          ClientMutationArgs<Url, undefined, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<
          ClientMutationArgs<Url, undefined, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
    },
  ): ((
    params: UrlHasParams<Url> extends true ? UrlParams<Url> : {},
  ) => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, undefined, QuerySchema>
  >) &
    MutationHelpers<Url, Result> &
    ClientEndpointHelper<Method, Url, undefined, Response, QuerySchema>

  mutationFromEndpoint<
    Method extends 'DELETE' = 'DELETE',
    Url extends string = string,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(
    endpoint: any & {
      config: BaseEndpointConfig<Method, Url, undefined, Response>
    },
    mutationOptions: {
      processResponse: ProcessResponseFunction<Result, ReqResult>
      useKey: UseKey
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<
          ClientMutationArgs<Url, undefined, undefined>
        >,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<
          ClientMutationArgs<Url, undefined, undefined>
        >,
        context: Context,
      ) => void | Promise<void>
    },
  ): ((
    params: UrlHasParams<Url> extends true ? UrlParams<Url> : {},
  ) => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, undefined, undefined>
  >) &
    MutationHelpers<Url, Result> &
    ClientEndpointHelper<Method, Url, undefined, Response, undefined>

  mutationFromEndpoint<
    Method extends 'DELETE' = 'DELETE',
    Url extends string = string,
    QuerySchema extends AnyZodObject = AnyZodObject,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
  >(
    endpoint: any & {
      config: BaseEndpointConfig<Method, Url, QuerySchema, Response>
    },
    mutationOptions: {
      processResponse: ProcessResponseFunction<Result, ReqResult>
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<
          ClientMutationArgs<Url, undefined, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<
          ClientMutationArgs<Url, undefined, QuerySchema>
        >,
        context: Context,
      ) => void | Promise<void>
    },
  ): (() => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, undefined, QuerySchema>
  >) &
    ClientEndpointHelper<Method, Url, undefined, Response, QuerySchema>

  mutationFromEndpoint<
    Method extends 'DELETE' = 'DELETE',
    Url extends string = string,
    Response extends ZodType = ZodType,
    ReqResult = z.output<Response>,
    Result = unknown,
    Context = unknown,
  >(
    endpoint: any & {
      config: BaseEndpointConfig<Method, Url, undefined, Response>
    },
    mutationOptions: {
      processResponse: ProcessResponseFunction<Result, ReqResult>
      useContext?: () => Context
      onSuccess?: (
        queryClient: QueryClient,
        data: NoInfer<Result>,
        variables: Util_FlatObject<
          ClientMutationArgs<Url, undefined, undefined>
        >,
        context: Context,
      ) => void | Promise<void>
      onError?: (
        queryClient: QueryClient,
        error: Error,
        variables: Util_FlatObject<
          ClientMutationArgs<Url, undefined, undefined>
        >,
        context: Context,
      ) => void | Promise<void>
    },
  ): ((
    params: UrlHasParams<Url> extends true ? UrlParams<Url> : {},
  ) => UseMutationResult<
    Result,
    Error,
    ClientMutationArgs<Url, undefined, undefined>
  >) &
    ClientEndpointHelper<Method, Url, undefined, Response, undefined>
}
