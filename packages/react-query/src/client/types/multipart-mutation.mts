import type {
  ClientRequestArgs,
  EndpointHandler,
  EndpointOptions,
  Simplify,
  UrlHasParams,
  UrlParams,
} from '@navios/builder'
import type { MutationFunctionContext, UseMutationResult } from '@tanstack/react-query'
import type { ZodObject, ZodType } from 'zod/v4'

import type { MutationHelpers } from '../../mutation/types.mjs'
import type { UnwrapMode } from '../../query/types.mjs'

import type { ComputeResult } from './helpers.mjs'

/**
 * Variables shape for a multipart mutation, derived from the synthesised
 * `Options` type. Multipart endpoints do not support `urlParamsSchema`, so
 * variables are derived from URL params + query / request schemas only.
 */
type MultipartVariables<Options extends EndpointOptions> = Simplify<
  ClientRequestArgs<{
    url: Options['url']
    querySchema: Options['querySchema'] extends ZodObject ? Options['querySchema'] : undefined
    requestSchema: Options['requestSchema'] extends ZodType ? Options['requestSchema'] : undefined
  }>
>

/**
 * Constraint applied to multipart mutations: HTTP method must be a
 * body-bearing verb and `requestSchema` is required.
 */
type MultipartEndpointOptions = EndpointOptions & {
  method: 'POST' | 'PUT' | 'PATCH'
  requestSchema: ZodType
}

/**
 * Surface-specific fields layered on top of `EndpointOptions` for the inline
 * config path. Stripped before forwarding to `api.declareMultipart`.
 */
interface MultipartSurfaceFields<
  Options extends MultipartEndpointOptions,
  UseKey extends boolean,
  Unwrap extends UnwrapMode,
  OnMutateResult,
  Context,
> {
  useKey?: UseKey
  /**
   * For endpoints declared with `result: 'envelope'`, controls how the
   * envelope is delivered to the mutation channel. Has no effect on
   * non-envelope endpoints.
   */
  unwrap?: Unwrap
  useContext?: () => Context
  meta?: Record<string, unknown>
  onMutate?: (
    variables: MultipartVariables<Options>,
    context: Context & MutationFunctionContext,
  ) => OnMutateResult | Promise<OnMutateResult>
  onSuccess?: (
    data: NoInfer<ComputeResult<Options, Unwrap>>,
    variables: MultipartVariables<Options>,
    context: Context &
      MutationFunctionContext & {
        onMutateResult: OnMutateResult | undefined
      },
  ) => void | Promise<void>
  onError?: (
    error: Error,
    variables: MultipartVariables<Options>,
    context: Context &
      MutationFunctionContext & {
        onMutateResult: OnMutateResult | undefined
      },
  ) => void | Promise<void>
  onSettled?: (
    data: NoInfer<ComputeResult<Options, Unwrap>> | undefined,
    error: Error | null,
    variables: MultipartVariables<Options>,
    context: Context &
      MutationFunctionContext & {
        onMutateResult: OnMutateResult | undefined
      },
  ) => void | Promise<void>
}

/**
 * Single overloaded multipart surface (renamed from `multipartMutation` for
 * consistency with the other shorter names). The first argument is either:
 *
 * - an inline `MultipartEndpointOptions` config (with optional surface
 *   fields), or
 * - an existing `EndpointHandler` produced by `api.declareMultipart`.
 *
 * `Options` is inferred from the literal config via the structural copy
 * `{ [K in keyof Options]: Options[K] }`, which keeps surface-specific fields
 * out of `Options`.
 */
export interface ClientMultipartMutationMethods {
  /**
   * Creates a type-safe multipart mutation with automatic type inference,
   * accepting either an inline config or an existing multipart endpoint
   * handler.
   *
   * @example
   * ```ts
   * // Inline config
   * const uploadFile = client.multipart({
   *   method: 'POST',
   *   url: '/files',
   *   requestSchema: z.object({ file: z.instanceof(File) }),
   *   responseSchema: z.object({ fileId: z.string() }),
   * })
   *
   * // From an existing endpoint
   * const uploadEndpoint = api.declareMultipart({
   *   method: 'POST',
   *   url: '/files',
   *   requestSchema: z.object({ file: z.instanceof(File) }),
   *   responseSchema: z.object({ fileId: z.string() }),
   * })
   * const uploadFile2 = client.multipart(uploadEndpoint)
   * ```
   */
  multipart<
    const Options extends MultipartEndpointOptions,
    const UseKey extends boolean = false,
    const Unwrap extends UnwrapMode = 'none',
    const OnMutateResult = unknown,
    const Context = unknown,
  >(
    input:
      | ({ [K in keyof Options]: Options[K] } & MultipartSurfaceFields<
          Options,
          UseKey,
          Unwrap,
          OnMutateResult,
          Context
        >)
      | EndpointHandler<Options>,
    options?: MultipartSurfaceFields<Options, UseKey, Unwrap, OnMutateResult, Context>,
  ): ((
    ...args: UseKey extends true
      ? UrlHasParams<Options['url']> extends true
        ? [{ urlParams: UrlParams<Options['url']> }]
        : [{}]
      : []
  ) => UseMutationResult<
    ComputeResult<Options, Unwrap>,
    Error,
    MultipartVariables<Options>,
    OnMutateResult
  >) &
    (UseKey extends true ? MutationHelpers<Options['url'], ComputeResult<Options, Unwrap>> : {}) & {
      endpoint: EndpointHandler<Options>
    }
}
