import type { BaseEndpointOptions, EndpointHandler } from '@navios/builder'
import type {
  MutationFunctionContext,
  UseMutationOptions,
  UseMutationResult,
} from '@tanstack/react-query'

import type { SurfaceOptions } from '../endpoint/surface-options.mjs'
import type {
  EndpointArgs,
  EndpointData,
  EndpointFailure,
  EndpointInputs,
  RequiredKeys,
} from '../endpoint/types.mjs'
import type { AnyQueryObject } from '../query/types.mjs'

import type { OptimisticUpdate, OptimisticUpdater } from './optimistic-update.mjs'

/**
 * Variables passed to `mutate`. Optional when the endpoint requires nothing.
 */
export type MutationVariables<Options extends BaseEndpointOptions> = [
  RequiredKeys<EndpointArgs<Options>>,
] extends [never]
  ? EndpointArgs<Options> | void
  : EndpointArgs<Options>

/**
 * Context handed to every mutation callback: TanStack's own context
 * (`client`, `meta`, `mutationKey`) merged with whatever `useContext` returns.
 */
export type MutationCallbackContext<TContext> = TContext & MutationFunctionContext

/**
 * What to invalidate after a successful mutation.
 *
 * - a query (or infinite query): every cache entry of that endpoint
 * - a function: the key it returns, computed from the mutation's result and
 *   variables — return `undefined` to skip
 */
export type InvalidateTarget<TData, TVariables> =
  | AnyQueryObject
  | ((data: TData, variables: TVariables) => readonly unknown[] | undefined)

/**
 * Options for `client.mutation`: every TanStack `useMutation` option except
 * the ones this library owns, plus `invalidates`, `optimistic` and
 * `useContext`.
 */
export type MutationSettings<
  Options extends BaseEndpointOptions,
  TOnMutateResult = unknown,
  TContext = unknown,
  TData = EndpointData<Options>,
  TError = EndpointFailure<Options>,
  TVariables = MutationVariables<Options>,
  WithResponse extends boolean = boolean,
> = Omit<
  UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  'mutationFn' | 'mutationKey' | 'onMutate' | 'onSuccess' | 'onError' | 'onSettled'
> &
  SurfaceOptions<WithResponse> & {
    /**
     * A hook called inside the mutation hook; its return value is merged
     * into the context of every callback. Use it for other hooks the
     * callbacks need (navigation, toasts). The `QueryClient` is already
     * available as `context.client`.
     */
    useContext?: () => TContext

    /** Queries to invalidate after the mutation succeeds. */
    invalidates?: readonly InvalidateTarget<NoInfer<TData>, NoInfer<TVariables>>[]

    /**
     * Optimistic cache updates applied before the request is sent.
     *
     * The callback receives a function that describes one update against a
     * query; return one description or an array of them.
     *
     * @example
     * ```ts
     * optimistic: (update) =>
     *   update(getUser, {
     *     args: (variables) => ({ urlParams: variables.urlParams }),
     *     update: (current, variables) => current && { ...current, ...variables.data },
     *   }),
     * ```
     */
    optimistic?: (
      update: OptimisticUpdater<TVariables>,
    ) => OptimisticUpdate<TVariables> | readonly OptimisticUpdate<TVariables>[]

    onMutate?: (
      variables: TVariables,
      context: MutationCallbackContext<TContext>,
    ) => TOnMutateResult | Promise<TOnMutateResult>
    onSuccess?: (
      data: NoInfer<TData>,
      variables: TVariables,
      context: MutationCallbackContext<TContext> & { onMutateResult: TOnMutateResult | undefined },
    ) => void | Promise<void>
    onError?: (
      error: NoInfer<TError>,
      variables: TVariables,
      context: MutationCallbackContext<TContext> & { onMutateResult: TOnMutateResult | undefined },
    ) => void | Promise<void>
    onSettled?: (
      data: NoInfer<TData> | undefined,
      error: NoInfer<TError> | null,
      variables: TVariables,
      context: MutationCallbackContext<TContext> & { onMutateResult: TOnMutateResult | undefined },
    ) => void | Promise<void>
  }

/**
 * A mutation bound to one endpoint: a hook with a few helpers attached.
 */
export type MutationObject<
  Options extends BaseEndpointOptions,
  TOnMutateResult = unknown,
  TData = EndpointData<Options>,
  TError = EndpointFailure<Options>,
  TVariables = MutationVariables<Options>,
> = (() => UseMutationResult<TData, TError, TVariables, TOnMutateResult>) & {
  /** Key shared by every mutation of this endpoint: `[...prefix, method, url]`. */
  mutationKey: readonly unknown[]

  /**
   * True while a mutation of this endpoint is in flight. Pass `urlParams` to
   * count only mutations for those params (e.g. one row of a list).
   */
  useIsMutating: (
    match?: EndpointInputs<Options> extends { urlParams: infer P }
      ? { urlParams?: Partial<P> }
      : never,
  ) => boolean

  /** The endpoint this mutation calls. */
  endpoint: EndpointHandler<Options>
}
