import type {
  AbstractEndpoint,
  AnyEndpointConfig,
  NaviosZodRequest,
  UrlHasParams,
  UrlParams,
} from '@navios/builder'
import type { UseMutationResult } from '@tanstack/react-query'
import type { z } from 'zod/v4'

import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import type { MutationParams } from './types.mjs'

import { createMutationKey } from './key-creator.mjs'

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
export function makeMutation<
  Config extends AnyEndpointConfig,
  TData = unknown,
  TVariables extends NaviosZodRequest<Config> = NaviosZodRequest<Config>,
  TResponse = z.output<Config['responseSchema']>,
  TContext = unknown,
  UseKey extends boolean = false,
>(
  endpoint: AbstractEndpoint<Config>,
  options: MutationParams<
    Config,
    TData,
    TVariables,
    TResponse,
    TContext,
    UseKey
  >,
) {
  const config = endpoint.config

  const mutationKey = createMutationKey(config, options)
  const result = (
    keyParams: UseKey extends true
      ? UrlHasParams<Config['url']> extends true
        ? UrlParams<Config['url']>
        : never
      : never,
  ): UseMutationResult<TData, Error, NaviosZodRequest<Config>> => {
    const queryClient = useQueryClient()
    const {
      useKey,
      useContext,
      onError,
      onSuccess,
      keyPrefix: _keyPrefix,
      keySuffix: _keySuffix,
      processResponse,
      ...rest
    } = options

    const context = useContext?.() as TContext

    // @ts-expect-error The types match
    return useMutation(
      {
        ...rest,
        mutationKey: useKey
          ? mutationKey({
              urlParams: keyParams,
            })
          : undefined,
        scope: useKey
          ? {
              id: JSON.stringify(
                mutationKey({
                  urlParams: keyParams,
                }),
              ),
            }
          : undefined,
        async mutationFn(params: TVariables) {
          const response = await endpoint(params)

          return processResponse(response) as TData
        },
        onSuccess: onSuccess
          ? (data: TData, variables: TVariables) => {
              return onSuccess?.(queryClient, data, variables, context)
            }
          : undefined,
        onError: onError
          ? (err: Error, variables: TVariables) => {
              return onError?.(queryClient, err, variables, context)
            }
          : undefined,
      },
      queryClient,
    )
  }
  result.useIsMutating = (
    keyParams: UseKey extends true
      ? UrlHasParams<Config['url']> extends true
        ? UrlParams<Config['url']>
        : never
      : never,
  ): boolean => {
    if (!options.useKey) {
      throw new Error(
        'useIsMutating can only be used when useKey is set to true',
      )
    }
    const isMutating = useIsMutating({
      mutationKey: mutationKey({
        urlParams: keyParams,
      }),
    })
    return isMutating > 0
  }
  result.mutationKey = mutationKey

  return result
}
