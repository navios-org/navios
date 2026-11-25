import { useIsMutating, useMutation } from '@tanstack/react-query'

import type { BaseEndpointOptions, EndpointHandler } from '@navios/builder'
import type { MutationFunctionContext } from '@tanstack/react-query'

import { createMutationKey } from '../endpoint/cache-key.mjs'
import { createCaller } from '../endpoint/create-caller.mjs'
import { callOptionsFor } from '../endpoint/http-client.mjs'

import type { MaybeWithResponse } from '../endpoint/create-caller.mjs'
import type { EndpointData, EndpointFailure } from '../endpoint/types.mjs'

import { applyOptimisticUpdate, settleOptimisticUpdate } from './optimistic-registry.mjs'
import { optimisticUpdate } from './optimistic-update.mjs'

import type {
  InvalidateTarget,
  MutationObject,
  MutationSettings,
  MutationVariables,
} from './mutation-object.mjs'
import type { PendingUpdate } from './optimistic-registry.mjs'
import type { OptimisticUpdate } from './optimistic-update.mjs'

function toArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? (value as readonly T[]) : [value as T]
}

/**
 * Creates a {@link MutationObject} for an endpoint.
 *
 * `client.mutation(...)` is the usual entry point; this is the function
 * behind it, exported for use without a client instance.
 *
 * The mutation function calls the throwing form of the endpoint, so
 * `onError` and `mutation.error` receive the endpoint's `EndpointError`.
 */
export function makeMutation<
  const Options extends BaseEndpointOptions,
  TOnMutateResult = unknown,
  TContext = unknown,
  const WithResponse extends boolean = false,
>(
  endpoint: EndpointHandler<Options>,
  settings: MutationSettings<
    Options,
    TOnMutateResult,
    TContext,
    MaybeWithResponse<EndpointData<Options>, WithResponse>,
    EndpointFailure<Options>,
    MutationVariables<Options>,
    WithResponse
  > = {},
): MutationObject<
  Options,
  TOnMutateResult,
  MaybeWithResponse<EndpointData<Options>, WithResponse>
> {
  const {
    useContext,
    invalidates,
    optimistic,
    onMutate,
    onSuccess,
    onError,
    onSettled,
    keyPrefix,
    keySuffix,
    withResponse,
    ...rest
  } = settings as MutationSettings<BaseEndpointOptions, unknown, unknown, unknown, unknown, unknown>

  const mutationKey = createMutationKey(endpoint.config, { keyPrefix, keySuffix })
  const call = createCaller(endpoint as never, withResponse)
  const optimisticSpecs = toArray<OptimisticUpdate<unknown>>(optimistic?.(optimisticUpdate))
  const invalidateTargets = toArray<InvalidateTarget<unknown, unknown>>(invalidates)

  // TanStack creates one context object per mutation execution and hands the
  // same object to every callback, which makes it a reliable handle for the
  // optimistic updates applied in onMutate.
  const applied = new WeakMap<MutationFunctionContext, PendingUpdate[]>()

  const useHook = () => {
    const ownContext = (useContext?.() ?? {}) as object

    return useMutation({
      ...rest,
      mutationKey,
      mutationFn: (variables: unknown, context: MutationFunctionContext) =>
        call(variables ?? undefined, callOptionsFor(context.client)),

      onMutate: async (variables: unknown, context: MutationFunctionContext) => {
        if (optimisticSpecs.length > 0) {
          const updates: PendingUpdate[] = []
          applied.set(context, updates)
          for (const spec of optimisticSpecs) {
            const key = spec.key(variables)
            await context.client.cancelQueries({ queryKey: key })
            updates.push(applyOptimisticUpdate(context.client, key, spec, variables))
          }
        }
        return onMutate?.(variables, { ...ownContext, ...context })
      },

      onSuccess: async (
        data: unknown,
        variables: unknown,
        onMutateResult: unknown,
        context: MutationFunctionContext,
      ) => {
        const invalidations = invalidateTargets.map((target) => {
          // A query object is itself callable, so test for its `key` helper first.
          const queryKey = 'key' in target ? target.key() : target(data, variables)
          return queryKey ? context.client.invalidateQueries({ queryKey }) : undefined
        })
        await Promise.all([
          ...invalidations,
          onSuccess?.(data, variables, { ...ownContext, ...context, onMutateResult }),
        ])
      },

      onError: async (
        error: unknown,
        variables: unknown,
        onMutateResult: unknown,
        context: MutationFunctionContext,
      ) => {
        for (const update of applied.get(context) ?? []) {
          settleOptimisticUpdate(
            context.client,
            update,
            update.spec.rollbackOnError ? 'rollback' : 'commit',
          )
        }
        await onError?.(error, variables, { ...ownContext, ...context, onMutateResult })
      },

      onSettled: async (
        data: unknown,
        error: unknown,
        variables: unknown,
        onMutateResult: unknown,
        context: MutationFunctionContext,
      ) => {
        const updates = applied.get(context) ?? []
        applied.delete(context)
        for (const update of updates) {
          // After a failure this is a no-op: onError already settled it.
          settleOptimisticUpdate(context.client, update, 'commit')
        }
        await Promise.all([
          ...updates
            .filter(({ spec }) => spec.invalidateOnSettled)
            .map(({ key }) => context.client.invalidateQueries({ queryKey: key })),
          onSettled?.(data, error, variables, { ...ownContext, ...context, onMutateResult }),
        ])
      },
    })
  }

  const mutation = useHook as unknown as Record<string, unknown>

  mutation.mutationKey = mutationKey

  mutation.useIsMutating = (match?: { urlParams?: Record<string, unknown> }) => {
    const wanted = match?.urlParams ? Object.entries(match.urlParams) : []
    const count = useIsMutating({
      mutationKey,
      ...(wanted.length > 0
        ? {
            predicate: (running) => {
              const variables = running.state.variables as
                | { urlParams?: Record<string, unknown> }
                | undefined
              return wanted.every(
                ([name, value]) => String(variables?.urlParams?.[name]) === String(value),
              )
            },
          }
        : {}),
    })
    return count > 0
  }

  mutation.endpoint = endpoint

  return mutation as never
}
