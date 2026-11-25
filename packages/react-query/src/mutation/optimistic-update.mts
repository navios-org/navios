import type { AnyQueryObject } from '../query/types.mjs'

/**
 * One optimistic cache update, produced by the function the `optimistic`
 * option receives.
 */
export interface OptimisticUpdate<TVariables> {
  /** @internal */
  readonly key: (variables: TVariables) => readonly unknown[]
  /** @internal */
  readonly update: (current: unknown, variables: TVariables) => unknown
  readonly rollbackOnError: boolean
  readonly invalidateOnSettled: boolean
}

type OptimisticData<Q> = Q extends { getData: (...args: any[]) => infer D }
  ? Exclude<D, undefined>
  : unknown
type OptimisticArgs<Q> = Q extends {
  setData: (queryClient: any, args: infer A, ...rest: any[]) => any
}
  ? A
  : never

/**
 * `args` selects the cache entry to update. It is required when the query
 * has required inputs, so an update can never land on the bare endpoint key
 * by accident.
 */
type OptimisticArgsField<Q, TVariables> =
  {} extends OptimisticArgs<Q>
    ? { args?: (variables: TVariables) => OptimisticArgs<Q> }
    : { args: (variables: TVariables) => OptimisticArgs<Q> }

/** Description of one optimistic update against query `Q`. */
export type OptimisticUpdateSpec<Q, TVariables> = OptimisticArgsField<Q, TVariables> & {
  /** Returns the new cached value. Return `current` unchanged to skip. */
  update: (
    current: OptimisticData<Q> | undefined,
    variables: TVariables,
  ) => OptimisticData<Q> | undefined
  /** Restore the previous value when the mutation fails. @default true */
  rollbackOnError?: boolean
  /** Invalidate the entry when the mutation settles. @default true */
  invalidateOnSettled?: boolean
}

/** The function handed to the `optimistic` option. */
export type OptimisticUpdater<TVariables> = <Q extends AnyQueryObject>(
  query: Q,
  spec: OptimisticUpdateSpec<Q, TVariables>,
) => OptimisticUpdate<TVariables>

/**
 * Describes an optimistic update of one query's cache entry.
 *
 * This is the function the `optimistic` option of `client.mutation` hands to
 * its callback; inside that callback the variables are typed for you.
 *
 * Before the request is sent, the entry addressed by `args(variables)` is
 * replaced with `update(current, variables)`. If the mutation fails, the
 * previous value is restored; when it settles, the entry is invalidated so
 * the server's state wins.
 *
 * @example
 * ```ts
 * const updateUser = client.mutation(updateUserEndpoint, {
 *   optimistic: (update) =>
 *     update(getUser, {
 *       args: (variables) => ({ urlParams: variables.urlParams }),
 *       update: (current, variables) => current && { ...current, ...variables.data },
 *     }),
 * })
 * ```
 */
export function optimisticUpdate<Q extends AnyQueryObject, TVariables>(
  query: Q,
  spec: OptimisticUpdateSpec<Q, TVariables>,
): OptimisticUpdate<TVariables> {
  return {
    key: (variables) => query.key(spec.args?.(variables)),
    update: spec.update as (current: unknown, variables: TVariables) => unknown,
    rollbackOnError: spec.rollbackOnError ?? true,
    invalidateOnSettled: spec.invalidateOnSettled ?? true,
  }
}
