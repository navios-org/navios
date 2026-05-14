import type {
  EndpointOptions,
  RequestArgs,
  Simplify,
  UrlHasParams,
  UrlParams,
} from '@navios/builder'
import type { MutationFunctionContext, UseMutationResult } from '@tanstack/react-query'
import type { ZodObject, ZodType } from 'zod/v4'

import type { MutationHelpers } from '../../mutation/types.mjs'
import type { UnwrapMode } from '../../query/types.mjs'

import type { ComputeResult, EndpointHelper } from './helpers.mjs'

/**
 * Variables shape for a multipart mutation, derived from the synthesised
 * `Options` type. Multipart endpoints do not support `urlParamsSchema`, so
 * variables are derived from URL params + query / request schemas only.
 */
type MultipartVariables<Options extends EndpointOptions> = Simplify<
  RequestArgs<
    Options['url'],
    Options['querySchema'] extends ZodObject ? Options['querySchema'] : undefined,
    Options['requestSchema'] extends ZodType ? Options['requestSchema'] : undefined
  >
>

/**
 * Constraint applied to multipart mutations: HTTP method must be a
 * body-bearing verb and `requestSchema` is required.
 */
type MultipartEndpointOptions = EndpointOptions & {
  method: 'POST' | 'PUT' | 'PATCH'
  requestSchema: ZodType
}

/**
 * Multipart mutation method using a single
 * `Options extends MultipartEndpointOptions` generic (inferred from the
 * literal config via the structural copy `{ [K in keyof Options]: Options[K] }`,
 * which keeps surface-specific fields out of `Options`) plus surface-specific
 * generics (`UseKey`, `Unwrap`, callback context).
 */
export interface ClientMultipartMutationMethods {
  multipartMutation<
    const Options extends MultipartEndpointOptions,
    const UseKey extends boolean = false,
    const Unwrap extends UnwrapMode = 'none',
    const OnMutateResult = unknown,
    const Context = unknown,
  >(
    config: { [K in keyof Options]: Options[K] } & {
      useKey?: UseKey
      /**
       * For endpoints declared with `result: 'envelope'`, controls how the
       * envelope is delivered to the mutation channel. Has no effect on
       * non-envelope endpoints.
       */
      unwrap?: Unwrap
      useContext?: () => Context
      onMutate?: (
        variables: MultipartVariables<Options>,
        context: Context & MutationFunctionContext,
      ) => OnMutateResult | Promise<OnMutateResult>
      onSuccess?: (
        data: NoInfer<ComputeResult<Options, Unwrap>>,
        variables: MultipartVariables<Options>,
        context: Context &
          MutationFunctionContext & {
            onMutateResult: OnMutateResult | undefined
          },
      ) => void | Promise<void>
      onError?: (
        error: Error,
        variables: MultipartVariables<Options>,
        context: Context &
          MutationFunctionContext & {
            onMutateResult: OnMutateResult | undefined
          },
      ) => void | Promise<void>
      onSettled?: (
        data: NoInfer<ComputeResult<Options, Unwrap>> | undefined,
        error: Error | null,
        variables: MultipartVariables<Options>,
        context: Context &
          MutationFunctionContext & {
            onMutateResult: OnMutateResult | undefined
          },
      ) => void | Promise<void>
    },
  ): ((
    ...args: UseKey extends true
      ? UrlHasParams<Options['url']> extends true
        ? [{ urlParams: UrlParams<Options['url']> }]
        : [{}]
      : []
  ) => UseMutationResult<
    ComputeResult<Options, Unwrap>,
    Error,
    MultipartVariables<Options>,
    OnMutateResult
  >) &
    (UseKey extends true ? MutationHelpers<Options['url'], ComputeResult<Options, Unwrap>> : {}) &
    EndpointHelper<Options>
}
