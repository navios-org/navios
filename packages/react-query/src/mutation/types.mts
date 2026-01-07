import type {
  AnyEndpointConfig,
  ErrorSchemaRecord,
  InferErrorSchemaOutput,
  RequestArgs,
  UrlHasParams,
  UrlParams,
} from '@navios/builder'
import type {
  DataTag,
  MutationFunctionContext,
  UseMutationOptions,
} from '@tanstack/react-query'
import type { z, ZodObject, ZodType } from 'zod/v4'

import type { ProcessResponseFunction } from '../common/types.mjs'

/**
 * Compute the response input type based on discriminator and error schema.
 * When UseDiscriminator=true and errorSchema is present, errors are included as a union.
 * When UseDiscriminator=false, only the success type is returned (errors are thrown).
 *
 * @template UseDiscriminator - Whether to include error types in the response union
 * @template ResponseSchema - The success response schema
 * @template ErrorSchema - The error schema record (optional)
 */
type ComputeResponseInput<
  UseDiscriminator extends boolean,
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined,
> = UseDiscriminator extends true
  ? ErrorSchema extends ErrorSchemaRecord
    ? z.output<ResponseSchema> | InferErrorSchemaOutput<ErrorSchema>
    : z.output<ResponseSchema>
  : z.output<ResponseSchema>

/**
 * Arguments for mutation functions based on URL params, request schema, and query schema.
 * Uses RequestArgs from builder for consistency.
 */
export type MutationArgs<
  Url extends string = string,
  RequestSchema extends ZodType | undefined = undefined,
  QuerySchema extends ZodObject | undefined = undefined,
> = RequestArgs<Url, QuerySchema, RequestSchema>

/**
 * Helper methods attached to mutation hooks.
 *
 * @template Url - The URL template string
 * @template Result - The mutation result type
 */
export type MutationHelpers<Url extends string, Result = unknown> =
  UrlHasParams<Url> extends true
    ? {
        /**
         * Generates a mutation key for the given URL parameters.
         * Useful for tracking mutations or invalidating related queries.
         */
        mutationKey: (params: {
          urlParams: UrlParams<Url>
        }) => DataTag<[Url], Result, Error>
        /**
         * Returns true if a mutation with the given URL parameters is currently in progress.
         * Requires `useKey: true` to be set when creating the mutation.
         */
        useIsMutating: (keyParams: { urlParams: UrlParams<Url> }) => boolean
      }
    : {
        /**
         * Generates a mutation key.
         * Useful for tracking mutations or invalidating related queries.
         */
        mutationKey: () => DataTag<[Url], Result, Error>
        /**
         * Returns true if a mutation is currently in progress.
         * Requires `useKey: true` to be set when creating the mutation.
         */
        useIsMutating: () => boolean
      }

/**
 * Base parameters for mutation configuration.
 *
 * @template UseDiscriminator - When `true`, errors are returned as union types in processResponse.
 *   When `false` (default), errors are thrown and not included in TResponse.
 */
export interface MutationParams<
  Config extends AnyEndpointConfig,
  TData = unknown,
  TVariables = RequestArgs<
    Config['url'],
    Config['querySchema'],
    Config['requestSchema'],
    Config['urlParamsSchema']
  >,
  _TResponse = ComputeResponseInput<false, Config['responseSchema'], Config['errorSchema']>,
  TOnMutateResult = unknown,
  TContext = unknown,
  UseKey extends boolean = false,
  UseDiscriminator extends boolean = false,
  TError = UseDiscriminator extends true
    ? Error
    : Config['errorSchema'] extends ErrorSchemaRecord
      ? InferErrorSchemaOutput<Config['errorSchema']> | Error
      : Error,
> extends Omit<
  UseMutationOptions<
    TData,
    // When UseDiscriminator is false and errorSchema exists, errors are thrown, so Error is correct.
    // When UseDiscriminator is true, errors are part of the response union, but network/other errors still throw Error.
    TError,
    TVariables
  >,
  | 'mutationKey'
  | 'mutationFn'
  | 'onMutate'
  | 'onSuccess'
  | 'onError'
  | 'onSettled'
  | 'scope'
> {
  processResponse?: ProcessResponseFunction<
    TData,
    ComputeResponseInput<UseDiscriminator, Config['responseSchema'], Config['errorSchema']>
  >
  /**
   * React hooks that will prepare the context for the mutation onSuccess and onError
   * callbacks. This is useful for when you want to use the context in the callbacks
   */
  useContext?: () => TContext
  onSuccess?: (
    data: TData,
    variables: TVariables,
    context: TContext &
      MutationFunctionContext & { onMutateResult: TOnMutateResult | undefined },
  ) => void | Promise<void>
  onError?: (
    err: TError,
    variables: TVariables,
    context: TContext &
      MutationFunctionContext & { onMutateResult: TOnMutateResult | undefined },
  ) => void | Promise<void>
  onMutate?: (
    variables: TVariables,
    context: TContext & MutationFunctionContext,
  ) => TOnMutateResult | Promise<TOnMutateResult>
  onSettled?: (
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    context: TContext &
      MutationFunctionContext & { onMutateResult: TOnMutateResult | undefined },
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
  RequestSchema extends ZodType | undefined = undefined,
  QuerySchema extends ZodObject | undefined = undefined,
> = MutationArgs<Url, RequestSchema, QuerySchema>

/** @deprecated Use MutationParams instead */
export type BaseMutationParams<
  Config extends AnyEndpointConfig,
  TData = unknown,
  TVariables = RequestArgs<
    Config['url'],
    Config['querySchema'],
    Config['requestSchema'],
    Config['urlParamsSchema']
  >,
  TResponse = z.output<Config['responseSchema']>,
  TContext = unknown,
  UseKey extends boolean = false,
> = MutationParams<Config, TData, TVariables, TResponse, TContext, UseKey>

/** @deprecated Use RequestArgs from @navios/builder instead */
export type BaseMutationArgs<Config extends AnyEndpointConfig> = RequestArgs<
  Config['url'],
  Config['querySchema'],
  Config['requestSchema'],
  Config['urlParamsSchema']
>
