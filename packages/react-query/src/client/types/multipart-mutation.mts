import type { ErrorSchemaRecord, Simplify, UrlHasParams, UrlParams } from '@navios/builder'
import type { MutationFunctionContext, UseMutationResult } from '@tanstack/react-query'
import type { ZodObject, ZodType } from 'zod/v4'

import type { MutationArgs, MutationHelpers } from '../../mutation/types.mjs'
import type { UnwrapMode } from '../../query/types.mjs'

import type { ComputeResult, EndpointHelper, OptionsFromInline, ResultMode } from './helpers.mjs'

/**
 * Multipart mutation method overloads for ClientInstance.
 */
export interface ClientMultipartMutationMethods {
  // ============================================================================
  // MULTIPART MUTATION METHODS
  // ============================================================================

  multipartMutation<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
    ResultModeT extends ResultMode = undefined,
    Unwrap extends UnwrapMode | undefined = undefined,
    TBaseResult = ComputeResult<
      OptionsFromInline<
        Method,
        Url,
        QuerySchema extends ZodObject ? QuerySchema : undefined,
        RequestSchema,
        Response,
        ErrorSchema,
        undefined,
        ResultModeT
      >,
      Unwrap extends undefined ? 'none' : Unwrap
    >,
    Result = unknown,
    OnMutateResult = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(config: {
    method: Method
    url: Url
    useKey: UseKey
    requestSchema: RequestSchema
    querySchema: QuerySchema
    responseSchema: Response
    errorSchema?: ErrorSchema
    processResponse?: (data: TBaseResult) => Result | Promise<Result>
    /**
     * Selects the wire-level result shape produced by the endpoint.
     *
     * - `'data'` (or omitted, default): legacy throwing surface — success body
     *   is returned, errors throw.
     * - `'envelope'`: surface becomes a `ResponseEnvelope`. Combine with
     *   {@link unwrap} to control how the envelope is exposed to the mutation
     *   channel.
     */
    result?: ResultModeT
    /**
     * For endpoints declared with `result: 'envelope'`, controls how the
     * envelope is delivered to the mutation channel. Has no effect on
     * non-envelope endpoints.
     */
    unwrap?: Unwrap
    useContext?: () => Context
    onMutate?: (
      variables: Simplify<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context & MutationFunctionContext,
    ) => OnMutateResult | Promise<OnMutateResult>
    onSuccess?: (
      data: NoInfer<Result>,
      variables: Simplify<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context &
        MutationFunctionContext & {
          onMutateResult: OnMutateResult | undefined
        },
    ) => void | Promise<void>
    onError?: (
      error: Error,
      variables: Simplify<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context &
        MutationFunctionContext & {
          onMutateResult: OnMutateResult | undefined
        },
    ) => void | Promise<void>
    onSettled?: (
      data: NoInfer<Result> | undefined,
      error: Error | null,
      variables: Simplify<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context &
        MutationFunctionContext & {
          onMutateResult: OnMutateResult | undefined
        },
    ) => void | Promise<void>
  }): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, QuerySchema>,
    OnMutateResult
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, RequestSchema, Response, QuerySchema>

  multipartMutation<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    QuerySchema extends ZodObject = ZodObject,
    Response extends ZodType = ZodType,
    ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
    ResultModeT extends ResultMode = undefined,
    Unwrap extends UnwrapMode | undefined = undefined,
    TBaseResult = ComputeResult<
      OptionsFromInline<
        Method,
        Url,
        QuerySchema extends ZodObject ? QuerySchema : undefined,
        RequestSchema,
        Response,
        ErrorSchema,
        undefined,
        ResultModeT
      >,
      Unwrap extends undefined ? 'none' : Unwrap
    >,
    Result = unknown,
    OnMutateResult = unknown,
    Context = unknown,
  >(config: {
    method: Method
    url: Url
    requestSchema: RequestSchema
    querySchema: QuerySchema
    responseSchema: Response
    errorSchema?: ErrorSchema
    processResponse?: (data: TBaseResult) => Result | Promise<Result>
    /**
     * Selects the wire-level result shape produced by the endpoint.
     *
     * - `'data'` (or omitted, default): legacy throwing surface — success body
     *   is returned, errors throw.
     * - `'envelope'`: surface becomes a `ResponseEnvelope`. Combine with
     *   {@link unwrap} to control how the envelope is exposed to the mutation
     *   channel.
     */
    result?: ResultModeT
    /**
     * For endpoints declared with `result: 'envelope'`, controls how the
     * envelope is delivered to the mutation channel. Has no effect on
     * non-envelope endpoints.
     */
    unwrap?: Unwrap
    useContext?: () => Context
    onMutate?: (
      variables: Simplify<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context & MutationFunctionContext,
    ) => OnMutateResult | Promise<OnMutateResult>
    onSuccess?: (
      data: NoInfer<Result>,
      variables: Simplify<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context &
        MutationFunctionContext & {
          onMutateResult: OnMutateResult | undefined
        },
    ) => void | Promise<void>
    onError?: (
      error: Error,
      variables: Simplify<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context &
        MutationFunctionContext & {
          onMutateResult: OnMutateResult | undefined
        },
    ) => void | Promise<void>
    onSettled?: (
      data: NoInfer<Result> | undefined,
      error: Error | null,
      variables: Simplify<MutationArgs<Url, RequestSchema, QuerySchema>>,
      context: Context &
        MutationFunctionContext & {
          onMutateResult: OnMutateResult | undefined
        },
    ) => void | Promise<void>
  }): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, QuerySchema>,
    OnMutateResult
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, RequestSchema, Response, QuerySchema>

  multipartMutation<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    Response extends ZodType = ZodType,
    ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
    ResultModeT extends ResultMode = undefined,
    Unwrap extends UnwrapMode | undefined = undefined,
    TBaseResult = ComputeResult<
      OptionsFromInline<
        Method,
        Url,
        undefined,
        RequestSchema,
        Response,
        ErrorSchema,
        undefined,
        ResultModeT
      >,
      Unwrap extends undefined ? 'none' : Unwrap
    >,
    Result = unknown,
    OnMutateResult = unknown,
    Context = unknown,
  >(config: {
    method: Method
    url: Url
    requestSchema: RequestSchema
    responseSchema: Response
    errorSchema?: ErrorSchema
    processResponse?: (data: TBaseResult) => Result | Promise<Result>
    /**
     * Selects the wire-level result shape produced by the endpoint.
     *
     * - `'data'` (or omitted, default): legacy throwing surface — success body
     *   is returned, errors throw.
     * - `'envelope'`: surface becomes a `ResponseEnvelope`. Combine with
     *   {@link unwrap} to control how the envelope is exposed to the mutation
     *   channel.
     */
    result?: ResultModeT
    /**
     * For endpoints declared with `result: 'envelope'`, controls how the
     * envelope is delivered to the mutation channel. Has no effect on
     * non-envelope endpoints.
     */
    unwrap?: Unwrap
    useContext?: () => Context
    onMutate?: (
      variables: Simplify<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context & MutationFunctionContext,
    ) => OnMutateResult | Promise<OnMutateResult>
    onSuccess?: (
      data: NoInfer<Result>,
      variables: Simplify<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context &
        MutationFunctionContext & {
          onMutateResult: OnMutateResult | undefined
        },
    ) => void | Promise<void>
    onError?: (
      error: Error,
      variables: Simplify<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context &
        MutationFunctionContext & {
          onMutateResult: OnMutateResult | undefined
        },
    ) => void | Promise<void>
    onSettled?: (
      data: NoInfer<Result> | undefined,
      error: Error | null,
      variables: Simplify<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context &
        MutationFunctionContext & {
          onMutateResult: OnMutateResult | undefined
        },
    ) => void | Promise<void>
  }): (() => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, undefined>,
    OnMutateResult
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, RequestSchema, Response>

  multipartMutation<
    Method extends 'POST' | 'PUT' | 'PATCH' = 'POST' | 'PUT' | 'PATCH',
    Url extends string = string,
    RequestSchema extends ZodType = ZodType,
    Response extends ZodType = ZodType,
    ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
    ResultModeT extends ResultMode = undefined,
    Unwrap extends UnwrapMode | undefined = undefined,
    TBaseResult = ComputeResult<
      OptionsFromInline<
        Method,
        Url,
        undefined,
        RequestSchema,
        Response,
        ErrorSchema,
        undefined,
        ResultModeT
      >,
      Unwrap extends undefined ? 'none' : Unwrap
    >,
    Result = unknown,
    OnMutateResult = unknown,
    Context = unknown,
    UseKey extends true = true,
  >(config: {
    method: Method
    url: Url
    useKey: UseKey
    requestSchema: RequestSchema
    responseSchema: Response
    errorSchema?: ErrorSchema
    processResponse?: (data: TBaseResult) => Result | Promise<Result>
    /**
     * Selects the wire-level result shape produced by the endpoint.
     *
     * - `'data'` (or omitted, default): legacy throwing surface — success body
     *   is returned, errors throw.
     * - `'envelope'`: surface becomes a `ResponseEnvelope`. Combine with
     *   {@link unwrap} to control how the envelope is exposed to the mutation
     *   channel.
     */
    result?: ResultModeT
    /**
     * For endpoints declared with `result: 'envelope'`, controls how the
     * envelope is delivered to the mutation channel. Has no effect on
     * non-envelope endpoints.
     */
    unwrap?: Unwrap
    useContext?: () => Context
    onMutate?: (
      variables: Simplify<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context & MutationFunctionContext,
    ) => OnMutateResult | Promise<OnMutateResult>
    onSuccess?: (
      data: NoInfer<Result>,
      variables: Simplify<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context &
        MutationFunctionContext & {
          onMutateResult: OnMutateResult | undefined
        },
    ) => void | Promise<void>
    onError?: (
      error: Error,
      variables: Simplify<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context &
        MutationFunctionContext & {
          onMutateResult: OnMutateResult | undefined
        },
    ) => void | Promise<void>
    onSettled?: (
      data: NoInfer<Result> | undefined,
      error: Error | null,
      variables: Simplify<MutationArgs<Url, RequestSchema, undefined>>,
      context: Context &
        MutationFunctionContext & {
          onMutateResult: OnMutateResult | undefined
        },
    ) => void | Promise<void>
  }): ((
    params: UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {},
  ) => UseMutationResult<
    Result,
    Error,
    MutationArgs<Url, RequestSchema, undefined>,
    OnMutateResult
  >) &
    MutationHelpers<Url, Result> &
    EndpointHelper<Method, Url, RequestSchema, Response>
}
