import type {
  EndpointOptions,
  ErrorSchemaRecord,
  HttpMethod,
  RequestArgs,
  Simplify,
  UrlHasParams,
  UrlParams,
} from '@navios/builder'
import type { MutationFunctionContext, UseMutationResult } from '@tanstack/react-query'
import type { ZodObject, ZodType } from 'zod/v4'

import type { MutationHelpers } from '../../mutation/types.mjs'
import type { UnwrapMode } from '../../query/types.mjs'

import type { ComputeResult, EndpointHelper, OptionsFromInline, ResultMode } from './helpers.mjs'

/**
 * Variables shape passed to the mutation hook, derived from the inferred
 * `Options` type alone (URL, query / request / urlParams schemas).
 */
type MutationVariables<Options extends EndpointOptions> = Simplify<
  RequestArgs<
    Options['url'],
    Options['querySchema'] extends ZodObject ? Options['querySchema'] : undefined,
    Options['requestSchema'] extends ZodType ? Options['requestSchema'] : undefined,
    Options['urlParamsSchema'] extends ZodObject ? Options['urlParamsSchema'] : undefined
  >
>

/**
 * Extended endpoint options interface for mutation. Inherits the endpoint
 * fields via the per-field generics for inference, then derives the
 * mutation-specific callback / context shapes from the synthesised
 * `Options` so they automatically pick up future endpoint fields.
 */
interface MutationEndpointConfig<
  Method extends HttpMethod,
  Url extends string,
  QuerySchema extends ZodObject | undefined,
  RequestSchema extends ZodType | undefined,
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined,
  UrlParamsSchema extends ZodObject | undefined,
  ResultModeT extends ResultMode,
  UseKey extends boolean,
  Unwrap extends UnwrapMode,
  Result,
  OnMutateResult,
  Context,
  Variables,
> extends EndpointOptions {
  method: Method
  url: Url
  querySchema?: QuerySchema
  requestSchema?: RequestSchema
  responseSchema: ResponseSchema
  errorSchema?: ErrorSchema
  urlParamsSchema?: UrlParamsSchema
  result?: ResultModeT
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
  onMutate?: (
    variables: Variables,
    context: Context & MutationFunctionContext,
  ) => OnMutateResult | Promise<OnMutateResult>
  onSuccess?: (
    data: NoInfer<Result>,
    variables: Variables,
    context: Context &
      MutationFunctionContext & {
        onMutateResult: OnMutateResult | undefined
      },
  ) => void | Promise<void>
  onError?: (
    error: Error,
    variables: Variables,
    context: Context &
      MutationFunctionContext & {
        onMutateResult: OnMutateResult | undefined
      },
  ) => void | Promise<void>
  onSettled?: (
    data: NoInfer<Result> | undefined,
    error: Error | null,
    variables: Variables,
    context: Context &
      MutationFunctionContext & {
        onMutateResult: OnMutateResult | undefined
      },
  ) => void | Promise<void>
}

/**
 * Mutation method.
 *
 * Uses the same decomposed-generics inference pattern as `query`; the
 * synthesised `Options` is reused everywhere downstream so future endpoint
 * fields propagate automatically.
 */
export interface ClientMutationMethods {
  /**
   * Creates a type-safe mutation with automatic type inference.
   *
   * @example
   * ```ts
   * const createUser = client.mutation({
   *   method: 'POST',
   *   url: '/users',
   *   requestSchema: createUserSchema,
   *   responseSchema: userSchema,
   * })
   *
   * const { mutate } = createUser()
   * mutate({ data: { name: 'John' } })
   * ```
   */
  mutation<
    const Method extends HttpMethod = HttpMethod,
    const Url extends string = string,
    const QuerySchema extends ZodObject | undefined = undefined,
    const RequestSchema extends ZodType | undefined = undefined,
    const ResponseSchema extends ZodType = ZodType,
    const ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
    const UrlParamsSchema extends ZodObject | undefined = undefined,
    const ResultModeT extends ResultMode = undefined,
    const UseKey extends boolean = false,
    const Unwrap extends UnwrapMode = 'none',
    const Options extends EndpointOptions = OptionsFromInline<
      Method,
      Url,
      QuerySchema,
      RequestSchema,
      ResponseSchema,
      ErrorSchema,
      UrlParamsSchema,
      ResultModeT
    >,
    const Result = ComputeResult<Options, Unwrap>,
    const OnMutateResult = unknown,
    const Context = unknown,
    const Variables = MutationVariables<Options>,
  >(
    config: MutationEndpointConfig<
      Method,
      Url,
      QuerySchema,
      RequestSchema,
      ResponseSchema,
      ErrorSchema,
      UrlParamsSchema,
      ResultModeT,
      UseKey,
      Unwrap,
      Result,
      OnMutateResult,
      Context,
      Variables
    >,
  ): ((
    ...args: UseKey extends true
      ? UrlHasParams<Url> extends true
        ? [{ urlParams: UrlParams<Url> }]
        : [{}]
      : []
  ) => UseMutationResult<Result, Error, Variables, OnMutateResult>) &
    (UseKey extends true ? MutationHelpers<Options['url'], Result> : {}) &
    EndpointHelper<Options>
}
