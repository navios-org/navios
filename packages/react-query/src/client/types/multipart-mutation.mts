import type {
  EndpointOptions,
  ErrorSchemaRecord,
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
 * Variables shape for a multipart mutation, derived from the synthesised
 * `Options` type.
 */
type MultipartVariables<Options extends EndpointOptions> = Simplify<
  RequestArgs<
    Options['url'],
    Options['querySchema'] extends ZodObject ? Options['querySchema'] : undefined,
    Options['requestSchema'] extends ZodType ? Options['requestSchema'] : undefined
  >
>

/**
 * Extended endpoint config for `multipartMutation`. Mirrors
 * `MutationEndpointConfig` but constrains the HTTP method to `'POST' |
 * 'PUT' | 'PATCH'` and treats `requestSchema` as required.
 */
interface MultipartMutationEndpointConfig<
  Method extends 'POST' | 'PUT' | 'PATCH',
  Url extends string,
  QuerySchema extends ZodObject | undefined,
  RequestSchema extends ZodType,
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined,
  ResultModeT extends ResultMode,
  UseKey extends boolean,
  Unwrap extends UnwrapMode,
  TBaseResult,
  Result,
  OnMutateResult,
  Context,
  Variables,
> extends EndpointOptions {
  method: Method
  url: Url
  querySchema?: QuerySchema
  requestSchema: RequestSchema
  responseSchema: ResponseSchema
  errorSchema?: ErrorSchema
  result?: ResultModeT
  useKey?: UseKey
  processResponse?: (data: TBaseResult) => Result | Promise<Result>
  /**
   * For endpoints declared with `result: 'envelope'`, controls how the
   * envelope is delivered to the mutation channel. Has no effect on
   * non-envelope endpoints.
   */
  unwrap?: Unwrap
  useContext?: () => Context
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
 * Multipart mutation method.
 *
 * Collapsed from four near-identical overloads into a single signature whose
 * `UseKey extends boolean` and `QuerySchema extends ZodObject | undefined`
 * generics encode the variants previously split across overloads.
 */
export interface ClientMultipartMutationMethods {
  multipartMutation<
    const Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    const Url extends string = string,
    const RequestSchema extends ZodType = ZodType,
    const QuerySchema extends ZodObject | undefined = undefined,
    const ResponseSchema extends ZodType = ZodType,
    const ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
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
      undefined,
      ResultModeT
    >,
    const TBaseResult = ComputeResult<Options, Unwrap>,
    const Result = TBaseResult,
    const OnMutateResult = unknown,
    const Context = unknown,
    const Variables = MultipartVariables<Options>,
  >(
    config: MultipartMutationEndpointConfig<
      Method,
      Url,
      QuerySchema,
      RequestSchema,
      ResponseSchema,
      ErrorSchema,
      ResultModeT,
      UseKey,
      Unwrap,
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
    (UseKey extends true ? MutationHelpers<Options['url'], Result> : {}) &
    EndpointHelper<Options>
}
