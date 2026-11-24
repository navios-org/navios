import type { AnyQueryObject } from '../query/types.mjs'

import type { OptimisticUpdate, OptimisticUpdateSpec } from './types.mjs'

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
