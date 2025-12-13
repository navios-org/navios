import type {
  AnyEndpointConfig,
  NaviosZodRequest,
  UrlHasParams,
  UrlParams,
} from '@navios/builder'
import type { DataTag, QueryClient, UseMutationOptions } from '@tanstack/react-query'
import type { z, ZodObject } from 'zod/v4'

import type { ProcessResponseFunction } from '../common/types.mjs'

/**
 * Arguments for mutation functions based on URL params, request schema, and query schema.
 */
export type MutationArgs<
  Url extends string = string,
  RequestSchema = unknown,
  QuerySchema = unknown,
> = (UrlHasParams<Url> extends true ? { urlParams: UrlParams<Url> } : {}) &
  (RequestSchema extends ZodObject ? { data: z.input<RequestSchema> } : {}) &
  (QuerySchema extends ZodObject ? { params: z.input<QuerySchema> } : {})

/**
 * Helper methods attached to mutation hooks.
 */
export type MutationHelpers<Url extends string, Result = unknown> =
  UrlHasParams<Url> extends true
    ? {
        mutationKey: (params: UrlParams<Url>) => DataTag<[Url], Result, Error>
        useIsMutating: (keyParams: UrlParams<Url>) => boolean
      }
    : {
        mutationKey: () => DataTag<[Url], Result, Error>
        useIsMutating: () => boolean
      }

/**
 * Base parameters for mutation configuration.
 */
export interface MutationParams<
  Config extends AnyEndpointConfig,
  TData = unknown,
  TVariables = NaviosZodRequest<Config>,
  TResponse = z.output<Config['responseSchema']>,
  TContext = unknown,
  UseKey extends boolean = false,
> extends Omit<
    UseMutationOptions<TData, Error, TVariables>,
    'mutationKey' | 'mutationFn' | 'onSuccess' | 'onError' | 'scope'
  > {
  processResponse: ProcessResponseFunction<TData, TResponse>
  /**
   * React hooks that will prepare the context for the mutation onSuccess and onError
   * callbacks. This is useful for when you want to use the context in the callbacks
   */
  useContext?: () => TContext
  onSuccess?: (
    queryClient: QueryClient,
    data: TData,
    variables: TVariables,
    context: TContext,
  ) => void | Promise<void>
  onError?: (
    queryClient: QueryClient,
    err: unknown,
    variables: TVariables,
    context: TContext,
  ) => void | Promise<void>

  /**
   * If true, we will create a mutation key that can be shared across the project.
   */
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

// Legacy type aliases for backwards compatibility
/** @deprecated Use MutationArgs instead */
export type ClientMutationArgs<
  Url extends string = string,
  RequestSchema = unknown,
  QuerySchema = unknown,
> = MutationArgs<Url, RequestSchema, QuerySchema>

/** @deprecated Use MutationParams instead */
export type BaseMutationParams<
  Config extends AnyEndpointConfig,
  TData = unknown,
  TVariables = NaviosZodRequest<Config>,
  TResponse = z.output<Config['responseSchema']>,
  TContext = unknown,
  UseKey extends boolean = false,
> = MutationParams<Config, TData, TVariables, TResponse, TContext, UseKey>

/** @deprecated Use NaviosZodRequest from @navios/builder instead */
export type BaseMutationArgs<Config extends AnyEndpointConfig> =
  NaviosZodRequest<Config>
