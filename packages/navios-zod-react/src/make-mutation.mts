import type {
  EndpointConfig,
  EndpointWithDataConfig,
  RequiredRequestEndpoint,
  UrlHasParams,
  UrlParams,
} from '@navios/navios-zod'
import type {
  DataTag,
  UseMutationOptions,
  UseMutationResult,
} from '@tanstack/react-query'
import type { z } from 'zod'

import { useMutation, useQueryClient } from '@tanstack/react-query'

import type {
  BaseMutationArgs,
  BaseMutationParams,
  BaseQueryParams,
  StrictReturnType,
} from './types.mjs'

import { mutationKeyCreator } from './index.mjs'

export function makeMutation<
  Config extends EndpointConfig | EndpointWithDataConfig,
  TData = unknown,
  TVariables extends BaseMutationArgs<Config> = BaseMutationArgs<Config>,
  TResponse = z.output<Config['responseSchema']>,
  UseKey extends boolean = false,
>(
  endpoint: RequiredRequestEndpoint<Config> & { config: Config },
  options: BaseMutationParams<Config, TData, TVariables, TResponse, UseKey>,
): UseKey extends true
  ? UrlHasParams<Config['url']> extends true
    ? ((
        keyParams: UrlParams<Config['url']>,
      ) => UseMutationResult<TData, Error, TVariables>) & {
        mutationKey: (
          params: UrlParams<Config['url']>,
        ) => DataTag<[Config['url']], TData, Error>
      }
    : (() => UseMutationResult<TData, Error, TVariables>) & {
        mutationKey: (
          params: UrlParams<Config['url']>,
        ) => DataTag<[Config['url']], TData, Error>
      }
  : () => UseMutationResult<TData, Error, TVariables> {
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

    // @ts-expect-error The types match
    return useMutation(
      {
        mutationKey: options.useKey
          ? mutationKey({
              urlParams: keyParams,
            })
          : undefined,
        async mutationFn(params: TVariables) {
          const response = await endpoint(params)

          return options.processResponse(response) as TData
        },
        onSuccess: options.onSuccess
          ? (data: TData, variables: TVariables) => {
              return options.onSuccess?.(queryClient, data, variables)
            }
          : undefined,
        onError: options.onError
          ? (err: Error, variables: TVariables) => {
              return options.onError?.(err, variables)
            }
          : undefined,
      },
      queryClient,
    )
  }
  result.mutationKey = mutationKey

  // @ts-expect-error We don't need to pass the urlParams if we don't have to
  return result
}
