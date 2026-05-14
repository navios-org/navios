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
 * Variables shape passed to the mutation hook, derived from the inferred
 * `Options` type alone (URL, query / request / urlParams schemas).
 */
type MutationVariables<Options extends EndpointOptions> = Simplify<
  RequestArgs<
    Options['url'],
    Options['querySchema'] extends ZodObject ? Options['querySchema'] : undefined,
    Options['requestSchema'] extends ZodType ? Options['requestSchema'] : undefined,
    Options['urlParamsSchema'] extends ZodObject ? Options['urlParamsSchema'] : undefined
  >
>

/**
 * Mutation method using a single `Options extends EndpointOptions` generic
 * (inferred from the literal config via the structural copy
 * `{ [K in keyof Options]: Options[K] }`, which keeps surface-specific fields
 * out of `Options`) plus surface-specific generics (`UseKey`, `Unwrap`,
 * callback context). Downstream return-type derivations reference `Options`
 * directly so adding a new endpoint field to `EndpointOptions` propagates
 * automatically.
 */
export interface ClientMutationMethods {
  /**
   * Creates a type-safe mutation with automatic type inference.
   *
   * @example
   * ```ts
   * const createUser = client.mutation({
   *   method: 'POST',
   *   url: '/users',
   *   requestSchema: createUserSchema,
   *   responseSchema: userSchema,
   * })
   *
   * const { mutate } = createUser()
   * mutate({ data: { name: 'John' } })
   * ```
   */
  mutation<
    const Options extends EndpointOptions,
    const UseKey extends boolean = false,
    const Unwrap extends UnwrapMode = 'none',
    const OnMutateResult = unknown,
    const Context = unknown,
  >(
    config: { [K in keyof Options]: Options[K] } & {
      /**
       * For endpoints declared with `result: 'envelope'`, controls how the
       * envelope is delivered to React Query's mutation channel.
       *
       * - `'none'` (default): the `ResponseEnvelope` is returned as-is.
       * - `'throw-on-error'`: on `envelope.ok === false`, the `envelope.error`
       *   is thrown so React Query's `onError` channel fires.
       *
       * Has no effect for non-envelope endpoints.
       */
      unwrap?: Unwrap
      useContext?: () => Context
      useKey?: UseKey
      onMutate?: (
        variables: MutationVariables<Options>,
        context: Context & MutationFunctionContext,
      ) => OnMutateResult | Promise<OnMutateResult>
      onSuccess?: (
        data: NoInfer<ComputeResult<Options, Unwrap>>,
        variables: MutationVariables<Options>,
        context: Context &
          MutationFunctionContext & {
            onMutateResult: OnMutateResult | undefined
          },
      ) => void | Promise<void>
      onError?: (
        error: Error,
        variables: MutationVariables<Options>,
        context: Context &
          MutationFunctionContext & {
            onMutateResult: OnMutateResult | undefined
          },
      ) => void | Promise<void>
      onSettled?: (
        data: NoInfer<ComputeResult<Options, Unwrap>> | undefined,
        error: Error | null,
        variables: MutationVariables<Options>,
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
    MutationVariables<Options>,
    OnMutateResult
  >) &
    (UseKey extends true ? MutationHelpers<Options['url'], ComputeResult<Options, Unwrap>> : {}) &
    EndpointHelper<Options>
}
