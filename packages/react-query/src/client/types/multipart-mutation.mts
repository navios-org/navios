import type { ErrorSchemaRecord, Simplify, UrlHasParams, UrlParams } from '@navios/builder'
import type { MutationFunctionContext, UseMutationResult } from '@tanstack/react-query'
import type { ZodObject, ZodType } from 'zod/v4'

import type { MutationArgs, MutationHelpers } from '../../mutation/types.mjs'

import type { ComputeBaseResult, EndpointHelper } from './helpers.mjs'

/**
 * Multipart mutation method overloads for ClientInstance.
 *
 * @template UseDiscriminator - When `true`, errors are returned as union types.
 *   When `false` (default), errors are thrown and not included in TData.
 */
export interface ClientMultipartMutationMethods<UseDiscriminator extends boolean = false> {
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
    TBaseResult = ComputeBaseResult<UseDiscriminator, Response, ErrorSchema>,
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
    processResponse: (data: TBaseResult) => Result | Promise<Result>
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
    TBaseResult = ComputeBaseResult<UseDiscriminator, Response, ErrorSchema>,
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
    processResponse: (data: TBaseResult) => Result | Promise<Result>
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
    TBaseResult = ComputeBaseResult<UseDiscriminator, Response, ErrorSchema>,
    Result = unknown,
    OnMutateResult = unknown,
    Context = unknown,
  >(config: {
    method: Method
    url: Url
    requestSchema: RequestSchema
    responseSchema: Response
    errorSchema?: ErrorSchema
    processResponse: (data: TBaseResult) => Result | Promise<Result>
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
    TBaseResult = ComputeBaseResult<UseDiscriminator, Response, ErrorSchema>,
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
    processResponse: (data: TBaseResult) => Result | Promise<Result>
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
