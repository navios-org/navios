import { useIsMutating, useMutation } from '@tanstack/react-query'

import type {
  AnyEndpointConfig,
  BaseEndpointConfig,
  ErrorSchemaRecord,
  HttpMethod,
  InferErrorSchemaOutput,
  UrlHasParams,
  UrlParams,
} from '@navios/builder'
import type {
  MutationFunctionContext,
  UseMutationOptions,
  UseMutationResult,
} from '@tanstack/react-query'
import type { z, ZodObject, ZodType } from 'zod/v4'

import type { ProcessResponseFunction } from '../common/types.mjs'

import { createMutationKey } from './key-creator.mjs'

import type { MutationHelpers } from './types.mjs'

/**
 * Helper type for endpoint with config property
 */
type EndpointWithConfig<Config extends AnyEndpointConfig> = ((params: any) => Promise<any>) & {
  config: Config
}

/**
 * Helper type for response input when errorSchema is present
 */
type ResponseInput<
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined,
> = ErrorSchema extends ErrorSchemaRecord
  ? z.output<ResponseSchema> | InferErrorSchemaOutput<ErrorSchema>
  : z.output<ResponseSchema>

/**
 * Options type for makeMutation
 */
type MakeMutationParams<
  Config extends AnyEndpointConfig,
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined,
  TData,
  TVariables,
  TOnMutateResult,
  TContext,
  UseKey extends boolean,
> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  'mutationKey' | 'mutationFn' | 'onMutate' | 'onSuccess' | 'onError' | 'onSettled' | 'scope'
> & {
  processResponse?: ProcessResponseFunction<TData, ResponseInput<ResponseSchema, ErrorSchema>>
  useContext?: () => TContext
  onSuccess?: (
    data: TData,
    variables: TVariables,
    context: TContext & MutationFunctionContext & { onMutateResult: TOnMutateResult | undefined },
  ) => void | Promise<void>
  onError?: (
    err: unknown,
    variables: TVariables,
    context: TContext & MutationFunctionContext & { onMutateResult: TOnMutateResult | undefined },
  ) => void | Promise<void>
  onMutate?: (
    variables: TVariables,
    context: TContext & MutationFunctionContext,
  ) => TOnMutateResult | Promise<TOnMutateResult>
  onSettled?: (
    data: TData | undefined,
    error: Error | null,
    variables: TVariables,
    context: TContext & MutationFunctionContext & { onMutateResult: TOnMutateResult | undefined },
  ) => void | Promise<void>
  useKey?: UseKey
  keyPrefix?: UseKey extends true
    ? UrlHasParams<Config['url']> extends true
      ? string[]
      : never
    : never
  keySuffix?: UseKey extends true
    ? UrlHasParams<Config['url']> extends true
      ? string[]
      : never
    : never
}

/**
 * Creates a mutation hook for a given endpoint.
 *
 * Returns a function that when called returns a TanStack Query mutation result.
 * The returned function also has helper methods attached (mutationKey, useIsMutating).
 *
 * @param endpoint - The navios endpoint to create a mutation hook for
 * @param options - Mutation configuration including processResponse and callbacks
 * @returns A hook function that returns mutation result with attached helpers
 */
// Overload: WITH errorSchema
export function makeMutation<
  Method extends HttpMethod,
  Url extends string,
  QuerySchema extends ZodObject | undefined,
  ResponseSchema extends ZodType,
  RequestSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord,
  TData,
  TOnMutateResult = unknown,
  TContext = unknown,
  UseKey extends boolean = false,
>(
  endpoint: EndpointWithConfig<
    BaseEndpointConfig<Method, Url, QuerySchema, ResponseSchema, RequestSchema, ErrorSchema>
  >,
  options: MakeMutationParams<
    BaseEndpointConfig<Method, Url, QuerySchema, ResponseSchema, RequestSchema, ErrorSchema>,
    ResponseSchema,
    ErrorSchema,
    TData,
    any,
    TOnMutateResult,
    TContext,
    UseKey
  >,
): ((
  keyParams: UseKey extends true
    ? UrlHasParams<Url> extends true
      ? { urlParams: UrlParams<Url> }
      : never
    : never,
) => UseMutationResult<TData, Error, any, TOnMutateResult>) &
  MutationHelpers<Url, TData>

// Overload: WITHOUT errorSchema
export function makeMutation<
  Method extends HttpMethod,
  Url extends string,
  QuerySchema extends ZodObject | undefined,
  ResponseSchema extends ZodType,
  RequestSchema extends ZodType | undefined,
  TData,
  TOnMutateResult = unknown,
  TContext = unknown,
  UseKey extends boolean = false,
>(
  endpoint: EndpointWithConfig<
    BaseEndpointConfig<Method, Url, QuerySchema, ResponseSchema, RequestSchema, undefined>
  >,
  options: MakeMutationParams<
    BaseEndpointConfig<Method, Url, QuerySchema, ResponseSchema, RequestSchema, undefined>,
    ResponseSchema,
    undefined,
    TData,
    any,
    TOnMutateResult,
    TContext,
    UseKey
  >,
): ((
  keyParams: UseKey extends true
    ? UrlHasParams<Url> extends true
      ? { urlParams: UrlParams<Url> }
      : never
    : never,
) => UseMutationResult<TData, Error, any, TOnMutateResult>) &
  MutationHelpers<Url, TData>

// Implementation
export function makeMutation(endpoint: EndpointWithConfig<AnyEndpointConfig>, options: any): any {
  const config = endpoint.config

  const mutationKey = createMutationKey(config, {
    ...options,
    processResponse: options.processResponse ?? ((data: any) => data),
  })
  const result = (keyParams: any): any => {
    const {
      useKey,
      useContext,
      onMutate,
      onError,
      onSuccess,
      onSettled,
      keyPrefix: _keyPrefix,
      keySuffix: _keySuffix,
      processResponse,
      ...rest
    } = options

    const ownContext = useContext?.() ?? {}

    return useMutation({
      ...rest,
      mutationKey: useKey ? mutationKey(keyParams) : undefined,
      scope: useKey
        ? {
            id: JSON.stringify(mutationKey(keyParams)),
          }
        : undefined,
      async mutationFn(params: any) {
        const response = await endpoint(params)

        return processResponse ? processResponse(response) : response
      },
      onSuccess: onSuccess
        ? (data: any, variables: any, onMutateResult: any, context: MutationFunctionContext) => {
            return onSuccess?.(data, variables, {
              ...ownContext,
              ...context,
              onMutateResult,
            })
          }
        : undefined,
      onError: onError
        ? (err: Error, variables: any, onMutateResult: any, context: MutationFunctionContext) => {
            return onError?.(err, variables, {
              onMutateResult,
              ...ownContext,
              ...context,
            })
          }
        : undefined,
      onMutate: onMutate
        ? (variables: any, context: MutationFunctionContext) => {
            return onMutate(variables, {
              ...ownContext,
              ...context,
            })
          }
        : undefined,
      onSettled: onSettled
        ? (
            data: any,
            error: Error | null,
            variables: any,
            onMutateResult: any,
            context: MutationFunctionContext,
          ) => {
            return onSettled(data, error, variables, {
              ...ownContext,
              ...context,
              onMutateResult,
            })
          }
        : undefined,
    })
  }
  result.useIsMutating = (keyParams: any): boolean => {
    if (!options.useKey) {
      throw new Error('useIsMutating can only be used when useKey is set to true')
    }
    const isMutating = useIsMutating({
      mutationKey: mutationKey(keyParams),
    })
    return isMutating > 0
  }
  result.mutationKey = mutationKey

  return result
}
