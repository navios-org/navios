import type {
  EndpointOptions,
  ErrorSchemaRecord,
  HttpMethod,
  RequestArgs,
  Simplify,
  UrlHasParams,
  UrlParams,
} from '@navios/builder'
import type {
  MutationFunctionContext,
  UseMutationResult,
} from '@tanstack/react-query'
import type { ZodObject, ZodType } from 'zod/v4'

import type { MutationHelpers } from '../../mutation/types.mjs'
import type { ComputeBaseResult, EndpointHelper } from './helpers.mjs'

/**
 * Compute variables type from URL, schemas
 */
type ComputeVariables<
  Url extends string,
  QuerySchema extends ZodObject | undefined,
  RequestSchema extends ZodType | undefined,
  UrlParamsSchema extends ZodObject | undefined,
> = Simplify<RequestArgs<Url, QuerySchema, RequestSchema, UrlParamsSchema>>

/**
 * Extended endpoint options interface for mutation that includes processResponse and callbacks.
 */
interface MutationEndpointConfig<
  _UseDiscriminator extends boolean,
  Method extends HttpMethod,
  Url extends string,
  QuerySchema extends ZodObject | undefined,
  RequestSchema extends ZodType | undefined,
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined,
  UrlParamsSchema extends ZodObject | undefined,
  UseKey extends boolean,
  TBaseResult,
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
  processResponse?: (data: TBaseResult) => Result | Promise<Result>
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
 * Mutation method using decomposed generics pattern for proper processResponse typing.
 *
 * @template UseDiscriminator - When `true`, errors are returned as union types.
 *   When `false` (default), errors are thrown and not included in TData.
 */
export interface ClientMutationMethods<
  UseDiscriminator extends boolean = false,
> {
  /**
   * Creates a type-safe mutation with automatic type inference.
   *
   * Uses decomposed generic pattern to infer types from the configuration object.
   * All schema combinations are handled by a single method.
   *
   * @example
   * ```ts
   * const createUser = client.mutation({
   *   method: 'POST',
   *   url: '/users',
   *   requestSchema: createUserSchema,
   *   responseSchema: userSchema,
   *   processResponse: (data) => data,
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
    const UseKey extends boolean = false,
    const TBaseResult = ComputeBaseResult<
      UseDiscriminator,
      ResponseSchema,
      ErrorSchema
    >,
    const Result = TBaseResult,
    const OnMutateResult = unknown,
    const Context = unknown,
    const Variables = ComputeVariables<
      Url,
      QuerySchema,
      RequestSchema,
      UrlParamsSchema
    >,
    const Options extends EndpointOptions = {
      method: Method
      url: Url
      querySchema: QuerySchema
      requestSchema: RequestSchema
      responseSchema: ResponseSchema
      errorSchema: ErrorSchema
      urlParamsSchema: UrlParamsSchema
    },
  >(
    config: MutationEndpointConfig<
      UseDiscriminator,
      Method,
      Url,
      QuerySchema,
      RequestSchema,
      ResponseSchema,
      ErrorSchema,
      UrlParamsSchema,
      UseKey,
      TBaseResult,
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
    (UseKey extends true ? MutationHelpers<Url, Result> : {}) &
    EndpointHelper<Options, UseDiscriminator>
}
