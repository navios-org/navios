import type {
  BaseEndpointOptions,
  ClientRequestArgs,
  EndpointHandler,
  EndpointOptions,
  Simplify,
  StreamHandler,
  UrlHasParams,
  UrlParams,
} from '@navios/builder'
import type { MutationFunctionContext, UseMutationResult } from '@tanstack/react-query'
import type { ZodObject, ZodType } from 'zod/v4'

import type { MutationHelpers } from '../../mutation/types.mjs'
import type { UnwrapMode } from '../../query/types.mjs'

import type { ComputeResult } from './helpers.mjs'

/**
 * Variables shape passed to the mutation hook, derived from the inferred
 * `Options` type alone (URL, query / request / urlParams schemas).
 */
type MutationVariables<Options extends EndpointOptions | BaseEndpointOptions> = Simplify<
  ClientRequestArgs<{
    url: Options['url']
    querySchema: Options['querySchema'] extends ZodObject ? Options['querySchema'] : undefined
    requestSchema: Options['requestSchema'] extends ZodType ? Options['requestSchema'] : undefined
    urlParamsSchema: Options extends EndpointOptions
      ? Options['urlParamsSchema'] extends ZodObject
        ? Options['urlParamsSchema']
        : undefined
      : undefined
  }>
>

/**
 * Surface-specific fields layered on top of `EndpointOptions` for the inline
 * config path. Stripped before forwarding to `api.declareEndpoint`.
 */
interface MutationSurfaceFields<
  Options extends EndpointOptions | BaseEndpointOptions,
  Result,
  UseKey extends boolean,
  Unwrap extends UnwrapMode,
  OnMutateResult,
  Context,
> {
  /**
   * For endpoints declared with `result: 'envelope'`, controls how the
   * envelope is delivered to React Query's mutation channel.
   *
   * - `'none'` (default): the `ResponseEnvelope` is returned as-is.
   * - `'throw-on-error'`: on `envelope.ok === false`, the `envelope.error`
   *   is thrown so React Query's `onError` channel fires.
   *
   * Has no effect for non-envelope endpoints.
   */
  unwrap?: Unwrap
  useContext?: () => Context
  useKey?: UseKey
  meta?: Record<string, unknown>
  onMutate?: (
    variables: MutationVariables<Options>,
    context: Context & MutationFunctionContext,
  ) => OnMutateResult | Promise<OnMutateResult>
  onSuccess?: (
    data: NoInfer<Result>,
    variables: MutationVariables<Options>,
    context: Context &
      MutationFunctionContext & {
        onMutateResult: OnMutateResult | undefined
      },
  ) => void | Promise<void>
  onError?: (
    error: Error,
    variables: MutationVariables<Options>,
    context: Context &
      MutationFunctionContext & {
        onMutateResult: OnMutateResult | undefined
      },
  ) => void | Promise<void>
  onSettled?: (
    data: NoInfer<Result> | undefined,
    error: Error | null,
    variables: MutationVariables<Options>,
    context: Context &
      MutationFunctionContext & {
        onMutateResult: OnMutateResult | undefined
      },
  ) => void | Promise<void>
}

/**
 * Single overloaded mutation surface. The first argument is either:
 *
 * - an inline `EndpointOptions` config (with optional surface fields), or
 * - an existing `EndpointHandler` produced by `api.declareEndpoint`, or
 * - a `StreamHandler` produced by `api.declareStream` (Blob mutations).
 *
 * `Options` is inferred from the literal config via the structural copy
 * `{ [K in keyof Options]: Options[K] }`, which keeps surface-specific fields
 * out of `Options`. Downstream return-type derivations reference `Options`
 * directly so adding a new endpoint field to `EndpointOptions` propagates
 * automatically.
 */
export interface ClientMutationMethods {
  /**
   * Creates a type-safe mutation with automatic type inference, accepting
   * either an inline config or an existing endpoint handler.
   *
   * @example
   * ```ts
   * // Inline config
   * const createUser = client.mutation({
   *   method: 'POST',
   *   url: '/users',
   *   requestSchema: createUserSchema,
   *   responseSchema: userSchema,
   * })
   *
   * // From an existing endpoint
   * const createUserEndpoint = api.declareEndpoint({
   *   method: 'POST',
   *   url: '/users',
   *   requestSchema: createUserSchema,
   *   responseSchema: userSchema,
   * })
   * const createUser2 = client.mutation(createUserEndpoint)
   * ```
   */
  mutation<
    const Options extends EndpointOptions | BaseEndpointOptions,
    const UseKey extends boolean = false,
    const Unwrap extends UnwrapMode = 'none',
    const OnMutateResult = unknown,
    const Context = unknown,
    Result = Options extends EndpointOptions ? ComputeResult<Options, Unwrap> : Blob,
  >(
    input:
      | ({ [K in keyof Options]: Options[K] } & MutationSurfaceFields<
          Options,
          Result,
          UseKey,
          Unwrap,
          OnMutateResult,
          Context
        >)
      | (Options extends EndpointOptions ? EndpointHandler<Options> : StreamHandler<Options>),
    options?: MutationSurfaceFields<Options, Result, UseKey, Unwrap, OnMutateResult, Context>,
  ): ((
    ...args: UseKey extends true
      ? UrlHasParams<Options['url']> extends true
        ? [{ urlParams: UrlParams<Options['url']> }]
        : [{}]
      : []
  ) => UseMutationResult<Result, Error, MutationVariables<Options>, OnMutateResult>) &
    (UseKey extends true ? MutationHelpers<Options['url'], Result> : {}) &
    (Options extends EndpointOptions
      ? { endpoint: EndpointHandler<Options> }
      : { endpoint: StreamHandler<Options> })
}
