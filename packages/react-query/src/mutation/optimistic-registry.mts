import { hashKey } from '@tanstack/react-query'

import type { QueryClient } from '@tanstack/react-query'

import type { OptimisticUpdate } from './types.mjs'

/** One optimistic update that is applied to an entry and not yet settled. */
export interface PendingUpdate {
  readonly key: readonly unknown[]
  readonly spec: OptimisticUpdate<unknown>
  readonly variables: unknown
}

interface EntryState {
  /** The entry's value without any pending optimistic update. */
  base: unknown
  /** Updates applied on top of `base`, oldest first. */
  pending: PendingUpdate[]
}

const registries = new WeakMap<QueryClient, Map<string, EntryState>>()

function entriesOf(queryClient: QueryClient): Map<string, EntryState> {
  let entries = registries.get(queryClient)
  if (!entries) {
    entries = new Map()
    registries.set(queryClient, entries)
  }
  return entries
}

/**
 * Applies an optimistic update to a cache entry and remembers it.
 *
 * The state is kept per entry rather than per mutation: the first pending
 * update records the entry's real value as the base, and later ones stack on
 * top. A per-mutation snapshot would capture another mutation's optimistic
 * value and restore it on failure.
 */
export function applyOptimisticUpdate(
  queryClient: QueryClient,
  key: readonly unknown[],
  spec: OptimisticUpdate<unknown>,
  variables: unknown,
): PendingUpdate {
  const entries = entriesOf(queryClient)
  const hash = hashKey(key)
  let entry = entries.get(hash)
  if (!entry) {
    entry = { base: queryClient.getQueryData(key), pending: [] }
    entries.set(hash, entry)
  }
  const update: PendingUpdate = { key, spec, variables }
  entry.pending.push(update)
  queryClient.setQueryData(key, (current: unknown) => spec.update(current, variables))
  return update
}

/**
 * Settles one optimistic update.
 *
 * - `'commit'`: the update becomes part of the base (the mutation succeeded,
 *   or it failed with `rollbackOnError: false`). The cache is left as it is.
 * - `'rollback'`: the update is dropped and the entry is rebuilt from the base
 *   plus the updates that are still pending. An entry that had no data before
 *   any of them goes back to having none.
 */
export function settleOptimisticUpdate(
  queryClient: QueryClient,
  update: PendingUpdate,
  outcome: 'commit' | 'rollback',
): void {
  const entries = entriesOf(queryClient)
  const hash = hashKey(update.key)
  const entry = entries.get(hash)
  if (!entry) return

  const index = entry.pending.indexOf(update)
  if (index === -1) return
  entry.pending.splice(index, 1)

  if (outcome === 'commit') {
    entry.base = update.spec.update(entry.base, update.variables)
  } else {
    const rebuilt = entry.pending.reduce(
      (value, pending) => pending.spec.update(value, pending.variables),
      entry.base,
    )
    if (rebuilt === undefined) {
      // `setQueryData(key, undefined)` is a no-op in TanStack Query, so an
      // entry that should be empty again has to be reset instead.
      void queryClient.resetQueries({ queryKey: update.key, exact: true })
    } else {
      queryClient.setQueryData(update.key, rebuilt)
    }
  }

  if (entry.pending.length === 0) {
    entries.delete(hash)
  }
}
