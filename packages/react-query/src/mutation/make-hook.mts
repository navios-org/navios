import { isResponseEnvelope } from '@navios/builder'
import { useIsMutating, useMutation } from '@tanstack/react-query'

import type { EndpointOptions, HttpMethod, UrlHasParams, UrlParams } from '@navios/builder'
import type {
  MutationFunctionContext,
  UseMutationOptions,
  UseMutationResult,
} from '@tanstack/react-query'
import type { ZodObject, ZodType } from 'zod/v4'

import type { UnwrapMode } from '../query/types.mjs'

import { createMutationKey } from './key-creator.mjs'

import type { MutationHelpers } from './types.mjs'

/**
 * Helper type for endpoint with config property
 */
type EndpointWithConfig<Config extends EndpointOptions> = ((params: any) => Promise<any>) & {
  config: Config
}

/**
 * Options type for makeMutation
 */
type MakeMutationParams<
  Config extends EndpointOptions,
  TData,
  TVariables,
  TOnMutateResult,
  TContext,
  UseKey extends boolean,
> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  'mutationKey' | 'mutationFn' | 'onMutate' | 'onSuccess' | 'onError' | 'onSettled' | 'scope'
> & {
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
  /**
   * For endpoints declared with `result: 'envelope'`, controls how the
   * envelope is delivered to React Query's mutation channel.
   *
   * - `'none'` (default): the `ResponseEnvelope` is returned from
   *   `mutationFn` as-is.
   * - `'throw-on-error'`: on `envelope.ok === false`, the `envelope.error`
   *   is thrown so React Query's `onError` channel fires.
   *
   * Has no effect for non-envelope endpoints.
   */
  unwrap?: UnwrapMode
}

/**
 * Creates a mutation hook for a given endpoint.
 *
 * Returns a function that when called returns a TanStack Query mutation result.
 * The returned function also has helper methods attached (mutationKey, useIsMutating).
 *
 * @param endpoint - The navios endpoint to create a mutation hook for
 * @param options - Mutation configuration including callbacks
 * @returns A hook function that returns mutation result with attached helpers
 */
// Overload: WITH errorSchema
export function makeMutation<
  Method extends HttpMethod,
  Url extends string,
  QuerySchema extends ZodObject | undefined,
  ResponseSchema extends ZodType,
  RequestSchema extends ZodType,
  ErrorSchema extends Record<number, ZodType>,
  TData,
  TOnMutateResult = unknown,
  TContext = unknown,
  UseKey extends boolean = false,
>(
  endpoint: EndpointWithConfig<
    EndpointOptions & {
      method: Method
      url: Url
      querySchema?: QuerySchema
      responseSchema: ResponseSchema
      requestSchema?: RequestSchema
      errorSchema?: ErrorSchema
    }
  >,
  options: MakeMutationParams<
    EndpointOptions & {
      method: Method
      url: Url
      querySchema?: QuerySchema
      responseSchema: ResponseSchema
      requestSchema?: RequestSchema
      errorSchema?: ErrorSchema
    },
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
    EndpointOptions & {
      method: Method
      url: Url
      querySchema?: QuerySchema
      responseSchema: ResponseSchema
      requestSchema?: RequestSchema
    }
  >,
  options: MakeMutationParams<
    EndpointOptions & {
      method: Method
      url: Url
      querySchema?: QuerySchema
      responseSchema: ResponseSchema
      requestSchema?: RequestSchema
    },
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
export function makeMutation(endpoint: EndpointWithConfig<EndpointOptions>, options: any): any {
  const config = endpoint.config

  const mutationKey = createMutationKey(config, options)
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
      unwrap,
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

        if ((unwrap ?? 'none') === 'throw-on-error' && isResponseEnvelope(response)) {
          if (!response.ok) {
            throw response.error
          }
          return response.data
        }

        return response
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
