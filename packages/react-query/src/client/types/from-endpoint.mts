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
import type { InfiniteUnwrapMode, QueryHelpers, UnwrapMode } from '../../query/types.mjs'

import type { ComputeResult, EndpointHelper, StreamHelper } from './helpers.mjs'

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
 * For projecting the cached data or the mutation result into a derived shape,
 * callers should use TanStack Query's built-in `select` option on the read-side
 * helpers (`use()` / `useSuspense()`); on the mutation side, transform in
 * `onSuccess` or the caller.
 */
export interface ClientFromEndpointMethods {
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
   * const getUser = client.queryFromEndpoint(getUserEndpoint)
   * ```
   */
  queryFromEndpoint<
    const Config extends EndpointOptions,
    const Unwrap extends UnwrapMode = 'none',
    Result = ComputeResult<Config, Unwrap>,
  >(
    endpoint: { config: Config },
    options?: {
      /**
       * For endpoints declared with `result: 'envelope'`, controls how the
       * envelope is delivered to React Query. Has no effect on non-envelope
       * endpoints.
       */
      unwrap?: Unwrap
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
      Config['querySchema'] extends ZodObject ? Config['querySchema'] : undefined,
      Result,
      false,
      Config['requestSchema'] extends ZodType ? Config['requestSchema'] : undefined
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
    const Unwrap extends InfiniteUnwrapMode = 'none',
    PageResult = ComputeResult<Config, Unwrap>,
  >(
    endpoint: { config: Config },
    options: {
      /**
       * For endpoints declared with `result: 'envelope'`, controls how each
       * page is delivered to React Query. Has no effect on non-envelope
       * endpoints.
       */
      unwrap?: Unwrap
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
    InfiniteData<PageResult>,
    DataTag<Split<Config['url'], '/'>, PageResult, Error>,
    z.output<Config['querySchema']>
  >) &
    QueryHelpers<
      Config['url'],
      Config['querySchema'],
      PageResult,
      true,
      Config['requestSchema'] extends ZodType ? Config['requestSchema'] : undefined
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
   * const createUser = client.mutationFromEndpoint(createUserEndpoint)
   * ```
   */
  mutationFromEndpoint<
    const Config extends EndpointOptions | BaseEndpointOptions,
    const Unwrap extends UnwrapMode = 'none',
    Result = Config extends EndpointOptions ? ComputeResult<Config, Unwrap> : Blob,
    OnMutateResult = unknown,
    Context = unknown,
  >(
    endpoint: { config: Config },
    mutationOptions?: {
      /**
       * For endpoints declared with `result: 'envelope'`, controls how the
       * envelope is delivered to the mutation channel. Has no effect on
       * non-envelope endpoints.
       */
      unwrap?: Unwrap
      useContext?: () => Context
      useKey?: boolean
      onMutate?: (
        variables: Simplify<
          RequestArgs<
            Config['url'],
            Config['querySchema'] extends ZodObject ? Config['querySchema'] : undefined,
            Config['requestSchema'] extends ZodType ? Config['requestSchema'] : undefined,
            Config['urlParamsSchema'] extends ZodObject ? Config['urlParamsSchema'] : undefined
          >
        >,
        context: Context & MutationFunctionContext,
      ) => OnMutateResult | Promise<OnMutateResult>
      onSuccess?: (
        data: NoInfer<Result>,
        variables: Simplify<
          RequestArgs<
            Config['url'],
            Config['querySchema'] extends ZodObject ? Config['querySchema'] : undefined,
            Config['requestSchema'] extends ZodType ? Config['requestSchema'] : undefined,
            Config['urlParamsSchema'] extends ZodObject ? Config['urlParamsSchema'] : undefined
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
            Config['querySchema'] extends ZodObject ? Config['querySchema'] : undefined,
            Config['requestSchema'] extends ZodType ? Config['requestSchema'] : undefined,
            Config['urlParamsSchema'] extends ZodObject ? Config['urlParamsSchema'] : undefined
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
            Config['querySchema'] extends ZodObject ? Config['querySchema'] : undefined,
            Config['requestSchema'] extends ZodType ? Config['requestSchema'] : undefined,
            Config['urlParamsSchema'] extends ZodObject ? Config['urlParamsSchema'] : undefined
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
        Config['querySchema'] extends ZodObject ? Config['querySchema'] : undefined,
        Config['requestSchema'] extends ZodType ? Config['requestSchema'] : undefined,
        Config['urlParamsSchema'] extends ZodObject ? Config['urlParamsSchema'] : undefined
      >
    >,
    OnMutateResult
  >) &
    (ExtractUseKey<typeof mutationOptions> extends true
      ? MutationHelpers<Config['url'], Result>
      : {}) &
    (Config extends EndpointOptions ? EndpointHelper<Config> : StreamHelper<Config>)
}
