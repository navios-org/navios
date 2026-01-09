import type {
  BaseEndpointOptions,
  EndpointOptions,
  InferEndpointParams,
  RequestArgs,
  Simplify,
  UrlHasParams,
  UrlParams,
} from '@navios/builder'
import type {
  DataTag,
  InfiniteData,
  MutationFunctionContext,
  UseMutationResult,
  UseSuspenseInfiniteQueryOptions,
  UseSuspenseQueryOptions,
} from '@tanstack/react-query'
import type { z, ZodObject, ZodType } from 'zod/v4'

import type { Split } from '../../common/types.mjs'
import type { MutationHelpers } from '../../mutation/types.mjs'
import type { QueryHelpers } from '../../query/types.mjs'
import type {
  ComputeBaseResult,
  EndpointHelper,
  StreamHelper,
} from './helpers.mjs'

/**
 * Helper type to extract useKey from mutation options
 */
type ExtractUseKey<Options> = Options extends { useKey: infer U }
  ? U extends true
    ? true
    : false
  : false

/**
 * FromEndpoint methods using const generics pattern (simplified from multiple overloads).
 *
 * @template UseDiscriminator - When `true`, errors are returned as union types.
 *   When `false` (default), errors are thrown and not included in TData.
 */
export interface ClientFromEndpointMethods<
  UseDiscriminator extends boolean = false,
> {
  /**
   * Creates a type-safe query from an existing endpoint with automatic type inference.
   *
   * Uses const generic pattern to infer types from the endpoint configuration.
   *
   * @example
   * ```ts
   * const getUserEndpoint = api.declareEndpoint({
   *   method: 'GET',
   *   url: '/users/$userId',
   *   responseSchema: userSchema,
   * })
   *
   * const getUser = client.queryFromEndpoint(getUserEndpoint, {
   *   processResponse: (data) => data,
   * })
   * ```
   */
  queryFromEndpoint<
    const Config extends EndpointOptions,
    TBaseResult = ComputeBaseResult<
      UseDiscriminator,
      Config['responseSchema'],
      Config['errorSchema']
    >,
    Result = TBaseResult,
  >(
    endpoint: { config: Config },
    options?: {
      processResponse?: (data: TBaseResult) => Result
    },
  ): ((
    params: Simplify<InferEndpointParams<Config>>,
  ) => UseSuspenseQueryOptions<
    Result,
    Error,
    Result,
    DataTag<Split<Config['url'], '/'>, Result, Error>
  >) &
    QueryHelpers<
      Config['url'],
      Config['querySchema'] extends ZodObject
        ? Config['querySchema']
        : undefined,
      Result,
      false,
      Config['requestSchema'] extends ZodType
        ? Config['requestSchema']
        : undefined
    >

  /**
   * Creates a type-safe infinite query from an existing endpoint with automatic type inference.
   *
   * Uses const generic pattern to infer types from the endpoint configuration.
   *
   * @example
   * ```ts
   * const getUsersEndpoint = api.declareEndpoint({
   *   method: 'GET',
   *   url: '/users',
   *   querySchema: z.object({ page: z.number() }),
   *   responseSchema: z.array(userSchema),
   * })
   *
   * const getUsers = client.infiniteQueryFromEndpoint(getUsersEndpoint, {
   *   getNextPageParam: (lastPage, allPages, lastPageParam) => {
   *     return lastPage.length > 0 ? { page: (lastPageParam?.page ?? 0) + 1 } : undefined
   *   },
   * })
   * ```
   */
  infiniteQueryFromEndpoint<
    const Config extends EndpointOptions & {
      querySchema: ZodObject
    },
    TBaseResult = ComputeBaseResult<
      UseDiscriminator,
      Config['responseSchema'],
      Config['errorSchema']
    >,
    PageResult = TBaseResult,
    Result = InfiniteData<PageResult>,
  >(
    endpoint: { config: Config },
    options: {
      processResponse?: (data: TBaseResult) => PageResult
      getNextPageParam: (
        lastPage: PageResult,
        allPages: PageResult[],
        lastPageParam: z.infer<Config['querySchema']> | undefined,
        allPageParams: z.infer<Config['querySchema']>[] | undefined,
      ) => z.input<Config['querySchema']> | undefined
      getPreviousPageParam?: (
        firstPage: PageResult,
        allPages: PageResult[],
        lastPageParam: z.infer<Config['querySchema']> | undefined,
        allPageParams: z.infer<Config['querySchema']>[] | undefined,
      ) => z.input<Config['querySchema']>
    },
  ): ((
    params: Simplify<InferEndpointParams<Config>>,
  ) => UseSuspenseInfiniteQueryOptions<
    PageResult,
    Error,
    Result,
    DataTag<Split<Config['url'], '/'>, PageResult, Error>,
    z.output<Config['querySchema']>
  >) &
    QueryHelpers<
      Config['url'],
      Config['querySchema'],
      PageResult,
      true,
      Config['requestSchema'] extends ZodType
        ? Config['requestSchema']
        : undefined
    >

  /**
   * Creates a type-safe mutation from an existing endpoint with automatic type inference.
   *
   * Uses const generic pattern to infer types from the endpoint configuration.
   * Handles both regular endpoints and stream endpoints.
   *
   * @example
   * ```ts
   * const createUserEndpoint = api.declareEndpoint({
   *   method: 'POST',
   *   url: '/users',
   *   requestSchema: createUserSchema,
   *   responseSchema: userSchema,
   * })
   *
   * const createUser = client.mutationFromEndpoint(createUserEndpoint, {
   *   processResponse: (data) => data,
   * })
   * ```
   */
  mutationFromEndpoint<
    const Config extends EndpointOptions | BaseEndpointOptions,
    TBaseResult = Config extends EndpointOptions
      ? ComputeBaseResult<
          UseDiscriminator,
          Config['responseSchema'],
          Config['errorSchema']
        >
      : Blob,
    Result = Config extends EndpointOptions
      ? ComputeBaseResult<
          UseDiscriminator,
          Config['responseSchema'],
          Config['errorSchema']
        >
      : Blob,
    OnMutateResult = unknown,
    Context = unknown,
  >(
    endpoint: { config: Config },
    mutationOptions?: {
      processResponse?: (data: TBaseResult) => Result | Promise<Result>
      useContext?: () => Context
      useKey?: boolean
      onMutate?: (
        variables: Simplify<
          RequestArgs<
            Config['url'],
            Config['querySchema'] extends ZodObject
              ? Config['querySchema']
              : undefined,
            Config['requestSchema'] extends ZodType
              ? Config['requestSchema']
              : undefined,
            Config['urlParamsSchema'] extends ZodObject
              ? Config['urlParamsSchema']
              : undefined
          >
        >,
        context: Context & MutationFunctionContext,
      ) => OnMutateResult | Promise<OnMutateResult>
      onSuccess?: (
        data: NoInfer<Result>,
        variables: Simplify<
          RequestArgs<
            Config['url'],
            Config['querySchema'] extends ZodObject
              ? Config['querySchema']
              : undefined,
            Config['requestSchema'] extends ZodType
              ? Config['requestSchema']
              : undefined,
            Config['urlParamsSchema'] extends ZodObject
              ? Config['urlParamsSchema']
              : undefined
          >
        >,
        context: Context &
          MutationFunctionContext & {
            onMutateResult: OnMutateResult | undefined
          },
      ) => void | Promise<void>
      onError?: (
        error: Error,
        variables: Simplify<
          RequestArgs<
            Config['url'],
            Config['querySchema'] extends ZodObject
              ? Config['querySchema']
              : undefined,
            Config['requestSchema'] extends ZodType
              ? Config['requestSchema']
              : undefined,
            Config['urlParamsSchema'] extends ZodObject
              ? Config['urlParamsSchema']
              : undefined
          >
        >,
        context: Context &
          MutationFunctionContext & {
            onMutateResult: OnMutateResult | undefined
          },
      ) => void | Promise<void>
      onSettled?: (
        data: NoInfer<Result> | undefined,
        error: Error | null,
        variables: Simplify<
          RequestArgs<
            Config['url'],
            Config['querySchema'] extends ZodObject
              ? Config['querySchema']
              : undefined,
            Config['requestSchema'] extends ZodType
              ? Config['requestSchema']
              : undefined,
            Config['urlParamsSchema'] extends ZodObject
              ? Config['urlParamsSchema']
              : undefined
          >
        >,
        context: Context &
          MutationFunctionContext & {
            onMutateResult: OnMutateResult | undefined
          },
      ) => void | Promise<void>
    },
  ): ((
    ...args: ExtractUseKey<typeof mutationOptions> extends true
      ? UrlHasParams<Config['url']> extends true
        ? [{ urlParams: UrlParams<Config['url']> }]
        : []
      : []
  ) => UseMutationResult<
    Result,
    Error,
    Simplify<
      RequestArgs<
        Config['url'],
        Config['querySchema'] extends ZodObject
          ? Config['querySchema']
          : undefined,
        Config['requestSchema'] extends ZodType
          ? Config['requestSchema']
          : undefined,
        Config['urlParamsSchema'] extends ZodObject
          ? Config['urlParamsSchema']
          : undefined
      >
    >,
    OnMutateResult
  >) &
    (ExtractUseKey<typeof mutationOptions> extends true
      ? MutationHelpers<Config['url'], Result>
      : {}) &
    (Config extends EndpointOptions
      ? EndpointHelper<Config, UseDiscriminator>
      : StreamHelper<Config, UseDiscriminator>)
}
