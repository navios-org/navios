import type {
  RequiredRequestEndpoint,
  UrlHasParams,
  UrlParams,
  Util_FlatObject,
} from '@navios/navios-zod'
import type {
  DataTag,
  InfiniteData,
  QueryClient,
  UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
  UseSuspenseInfiniteQueryOptions,
  UseSuspenseInfiniteQueryResult,
  UseSuspenseQueryOptions,
  UseSuspenseQueryResult,
} from '@tanstack/react-query'
import type { HttpMethod } from 'navios'
import type { AnyZodObject, z, ZodType } from 'zod'

import {
  useInfiniteQuery,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query'

import type { ClientOptions } from './types.mjs'
import type { QueryKeyCreatorResult } from './utils/query-key-creator.mjs'

import { makeMutation } from './make-mutation.mjs'
import { makeInfiniteQueryOptions } from './makeInfiniteQueryOptions.mjs'
import { makeQueryOptions } from './makeQueryOptions.mjs'

type Split<S extends string, D extends string> = string extends S
  ? string[]
  : S extends ''
    ? []
    : S extends `${infer T}${D}${infer U}`
      ? [T, ...Split<U, D>]
      : [S]

export type ClientEndpoint<
  Method = HttpMethod,
  Url = string,
  QuerySchema = AnyZodObject,
  Response = ZodType,
> = {
  method: Method
  url: Url
  querySchema?: QuerySchema
  responseSchema: Response
}

export type ClientQueryConfig<
  Method = HttpMethod,
  Url = string,
  QuerySchema = AnyZodObject,
  Response extends ZodType = ZodType,
  Result = z.output<Response>,
> = ClientEndpoint<Method, Url, QuerySchema, Response> & {
  processResponse?: (data: z.output<Response>) => Result
}

export type ClientInfiniteQueryConfig<
  Method = HttpMethod,
  Url = string,
  QuerySchema extends AnyZodObject = AnyZodObject,
  Response extends ZodType = ZodType,
  PageResult = z.output<Response>,
  Result = InfiniteData<PageResult>,
> = Required<ClientEndpoint<Method, Url, QuerySchema, Response>> & {
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

export type ClientMutationDataConfig<
  Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
  Url = string,
  RequestSchema extends AnyZodObject = AnyZodObject,
  QuerySchema = AnyZodObject,
  Response extends ZodType = ZodType,
  Result = z.output<Response>,
  Context = unknown,
  UseKey extends boolean = false,
> = ClientEndpoint<Method, Url, QuerySchema, Response> & {
  requestSchema: RequestSchema
  processResponse?: (data: z.output<Response>) => Result
  useContext?: () => Context
  onSuccess?: (
    queryClient: QueryClient,
    data: Result,
    context: Context,
  ) => void | Promise<void>
  onError?: (
    queryClient: QueryClient,
    error: Error,
    context: Context,
  ) => void | Promise<void>
  useKey?: UseKey
}

export type ClientMutationDeleteConfig<
  Method extends 'DELETE' = 'DELETE',
  Url = string,
  RequestSchema = never,
  QuerySchema = AnyZodObject,
  Response extends ZodType = ZodType,
  Result = z.output<Response>,
  Context = unknown,
  UseKey extends boolean = false,
> = ClientEndpoint<Method, Url, QuerySchema, Response> & {
  processResponse?: (data: z.output<Response>) => Result
  useContext?: () => Context
  onSuccess?: (
    queryClient: QueryClient,
    data: Result,
    context: Context,
  ) => void | Promise<void>
  onError?: (
    queryClient: QueryClient,
    error: Error,
    context: Context,
  ) => void | Promise<void>
  useKey?: UseKey
}

export type ClientQueryArgs<
  Url extends string = string,
  QuerySchema = AnyZodObject,
> = (UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {}) &
  (QuerySchema extends AnyZodObject ? { params: z.input<QuerySchema> } : {})

export type ClientQueryUrlParamsArgs<Url extends string = string> =
  UrlHasParams<Url> extends true
    ? { urlParams: UrlParams<Url> }
    : {} | undefined

export type ClientMutationArgs<
  Url extends string = string,
  RequestSchema extends AnyZodObject | never = AnyZodObject,
  QuerySchema extends AnyZodObject = AnyZodObject,
> = (UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {}) &
  (RequestSchema extends AnyZodObject ? { data: z.input<RequestSchema> } : {}) &
  (QuerySchema extends AnyZodObject ? { params: z.input<QuerySchema> } : {})

export function declareClient<Options extends ClientOptions>({
  api,
  defaults = {},
}: Options) {
  function query<
    Method extends HttpMethod = HttpMethod,
    Url extends string = string,
    QuerySchema extends AnyZodObject | undefined = undefined,
    Response extends ZodType = ZodType,
    Result = z.output<Response>,
  >(
    config: ClientQueryConfig<Method, Url, QuerySchema, Response, Result>,
  ): ((
    params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
  ) => UseSuspenseQueryOptions<
    Result,
    Error,
    Result,
    DataTag<Split<Url, '/'>, Result, Error>
  >) & {
    queryKey: QueryKeyCreatorResult<QuerySchema, Url, Result, false>
    use: (
      params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
    ) => UseQueryResult<Result, Error>
    useSuspense: (
      params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
    ) => UseSuspenseQueryResult<Result, Error>
    invalidate: (
      queryClient: QueryClient,
      params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
    ) => () => Promise<void>
    invalidateAll: (
      queryClient: QueryClient,
      params: Util_FlatObject<ClientQueryUrlParamsArgs<Url>>,
    ) => () => Promise<void>
  } {
    type Config = {
      method: Method
      url: Url
      querySchema?: QuerySchema
      responseSchema: Response
    }
    const endpoint = api.declareEndpoint({
      method: config.method,
      url: config.url,
      querySchema: config.querySchema,
      responseSchema: config.responseSchema,
    }) as RequiredRequestEndpoint<Config> & {
      config: Config
    }

    const queryOptions = makeQueryOptions(endpoint, {
      ...defaults,
      processResponse: config.processResponse ?? ((data) => data),
    })

    // @ts-expect-error We add additional function to the queryOptions
    queryOptions.use = (
      params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
    ) => {
      // @ts-expect-error We simplify types here
      return useQuery(queryOptions(params))
    }

    // @ts-expect-error We add additional function to the queryOptions
    queryOptions.useSuspense = (
      params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
    ) => {
      // @ts-expect-error We simplify types here
      return useSuspenseQuery(queryOptions(params))
    }

    // @ts-expect-error We add additional function to the queryOptions
    queryOptions.invalidate = (
      queryClient: QueryClient,
      params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
    ) => {
      return queryClient.invalidateQueries({
        // @ts-expect-error We simplify types here
        queryKey: queryOptions.queryKey.dataTag(params),
      })
    }

    // @ts-expect-error We add additional function to the queryOptions
    queryOptions.invalidateAll = (
      queryClient: QueryClient,
      params: Util_FlatObject<ClientQueryUrlParamsArgs<Url>>,
    ) => {
      return queryClient.invalidateQueries({
        // @ts-expect-error We simplify types here
        queryKey: queryOptions.queryKey.filterKey(params),
        exact: false,
      })
    }
    // @ts-expect-error We simplify types here
    return queryOptions
  }

  function infiniteQuery<
    Method extends HttpMethod = HttpMethod,
    Url extends string = string,
    QuerySchema extends AnyZodObject = AnyZodObject,
    Response extends ZodType = ZodType,
    PageResult = z.output<Response>,
    Result = InfiniteData<PageResult>,
  >(
    config: ClientInfiniteQueryConfig<
      Method,
      Url,
      QuerySchema,
      Response,
      PageResult
    >,
  ): ((
    params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
  ) => UseSuspenseInfiniteQueryOptions<
    PageResult,
    Error,
    Result,
    PageResult,
    DataTag<Split<Url, '/'>, PageResult, Error>,
    z.output<QuerySchema>
  >) & {
    queryKey: QueryKeyCreatorResult<QuerySchema, Url, PageResult, true>
    use: (
      params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
    ) => UseInfiniteQueryResult<Result, Error>
    useSuspense: (
      params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
    ) => UseSuspenseInfiniteQueryResult<Result, Error>
    invalidate: (
      queryClient: QueryClient,
      params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
    ) => () => Promise<void>
    invalidateAll: (
      queryClient: QueryClient,
      params: Util_FlatObject<ClientQueryUrlParamsArgs<Url>>,
    ) => () => Promise<void>
  } {
    type Config = {
      method: Method
      url: Url
      querySchema: QuerySchema
      responseSchema: Response
    }
    const endpoint = api.declareEndpoint(
      config,
    ) as RequiredRequestEndpoint<Config> & {
      config: Config
    }
    const queryOptions = makeInfiniteQueryOptions(endpoint, {
      ...defaults,
      processResponse: config.processResponse ?? ((data) => data),
      getNextPageParam: config.getNextPageParam,
      getPreviousPageParam: config.getPreviousPageParam,
      initialPageParam: config.initialPageParam,
    })

    // @ts-expect-error We add additional function to the queryOptions
    queryOptions.use = (
      params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
    ) => {
      // @ts-expect-error We simplify types here
      return useInfiniteQuery(queryOptions(params))
    }

    // @ts-expect-error We add additional function to the queryOptions
    queryOptions.useSuspense = (
      params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
    ) => {
      // @ts-expect-error We simplify types here
      return useSuspenseInfiniteQuery(queryOptions(params))
    }

    // @ts-expect-error We add additional function to the queryOptions
    queryOptions.invalidate = (
      queryClient: QueryClient,
      params: Util_FlatObject<ClientQueryArgs<Url, QuerySchema>>,
    ) => {
      return queryClient.invalidateQueries({
        // @ts-expect-error We simplify types here
        queryKey: queryOptions.queryKey.dataTag(params),
      })
    }

    // @ts-expect-error We add additional function to the queryOptions
    queryOptions.invalidateAll = (
      queryClient: QueryClient,
      params: Util_FlatObject<ClientQueryUrlParamsArgs<Url>>,
    ) => {
      return queryClient.invalidateQueries({
        // @ts-expect-error We simplify types here
        queryKey: queryOptions.queryKey.filterKey(params),
        exact: false,
      })
    }
    // @ts-expect-error We simplify types here
    return queryOptions
  }

  function mutation<
    Method extends 'POST' | 'PUT' | 'PATCH' | 'DELETE' =
      | 'POST'
      | 'PUT'
      | 'PATCH'
      | 'DELETE',
    Url extends string = string,
    RequestSchema extends AnyZodObject = AnyZodObject,
    QuerySchema extends AnyZodObject = AnyZodObject,
    Response extends ZodType = ZodType,
    Result = z.output<Response>,
    Context = unknown,
    UseKey extends boolean = false,
  >(
    config: Method extends 'POST' | 'PUT' | 'PATCH'
      ? ClientMutationDataConfig<
          Method,
          Url,
          RequestSchema,
          QuerySchema,
          Response,
          Result,
          Context,
          UseKey
        >
      : Method extends 'DELETE'
        ? ClientMutationDeleteConfig<
            Method,
            Url,
            RequestSchema,
            QuerySchema,
            Response,
            Result,
            Context,
            UseKey
          >
        : never,
  ): UseKey extends true
    ? UrlHasParams<Url> extends true
      ? ((
          keyParams: UrlParams<Url>,
        ) => UseMutationResult<
          Result,
          Error,
          ClientMutationArgs<Url, RequestSchema, QuerySchema>
        >) & {
          mutationKey: (
            params: UrlParams<Url>,
          ) => DataTag<Split<Url, '/'>, Result, Error>
          useIsMutating: (keyParams: UrlParams<Url>) => boolean
        }
      : (() => UseMutationResult<
          Result,
          Error,
          ClientMutationArgs<Url, RequestSchema, QuerySchema>
        >) & {
          mutationKey: (
            params: UrlParams<Url>,
          ) => DataTag<Split<Url, '/'>, Result, Error>
          useIsMutating: () => boolean
        }
    : () => UseMutationResult<
        Result,
        Error,
        ClientMutationArgs<Url, RequestSchema, QuerySchema>
      > {
    const endpoint = api.declareEndpoint({
      method: config.method,
      url: config.url,
      querySchema: config.querySchema,
      // @ts-expect-error We know that the requestSchema is defined when needed
      requestSchema: config.requestSchema,
      responseSchema: config.responseSchema,
    }) as unknown as RequiredRequestEndpoint<{
      method: Method
      url: Url
      querySchema: QuerySchema
      requestSchema: RequestSchema
      responseSchema: Response
    }> & {
      config: {
        method: Method
        url: Url
        querySchema: QuerySchema
        responseSchema: Response
      }
    }

    // @ts-expect-error We forgot about the DELETE method in original makeMutation
    const mutationCall = makeMutation(endpoint, {
      processResponse: config.processResponse ?? ((data) => data),
      useContext: config.useContext,
      onSuccess: config.onSuccess,
      onError: config.onError,
      useKey: config.useKey,
      ...defaults,
    })

    // @ts-expect-error We simplify types here
    return mutationCall
  }

  return {
    query,
    infiniteQuery,
    mutation,
  }
}
