import type {
  AbstractEndpoint,
  AnyEndpointConfig,
  UrlHasParams,
  UrlParams,
} from '@navios/common'
import type { UseMutationResult } from '@tanstack/react-query'
import type { z } from 'zod'

import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import type { BaseMutationArgs, BaseMutationParams } from './types.mjs'

import { mutationKeyCreator } from './index.mjs'

export function makeMutation<
  Config extends AnyEndpointConfig,
  TData = unknown,
  TVariables extends BaseMutationArgs<Config> = BaseMutationArgs<Config>,
  TResponse = z.output<Config['responseSchema']>,
  TContext = unknown,
  UseKey extends boolean = false,
>(
  endpoint: AbstractEndpoint<Config>,
  options: BaseMutationParams<
    Config,
    TData,
    TVariables,
    TResponse,
    TContext,
    UseKey
  >,
) {
  const config = endpoint.config

  const mutationKey = mutationKeyCreator(config, options)
  const result = (
    keyParams: UseKey extends true
      ? UrlHasParams<Config['url']> extends true
        ? UrlParams<Config['url']>
        : never
      : never,
  ): UseMutationResult<TData, Error, BaseMutationArgs<Config>> => {
    const queryClient = useQueryClient()
    const {
      useKey,
      useContext,
      onError,
      onSuccess,
      keyPrefix,
      keySuffix,
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
