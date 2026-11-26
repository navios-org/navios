import { hashKey } from '@tanstack/react-query'
import { useEffect, useLayoutEffect } from 'react'

import type { Query, QueryClient, QueryKey } from '@tanstack/react-query'

import { normalizeInputPart } from '../endpoint/cache-key.mjs'
import { INPUT_PARTS, mergeSharedInputs } from '../endpoint/key-by.mjs'

import type { KeyRule, SharedInputs } from '../endpoint/key-by.mjs'

/** Shared inputs with the hash that tells them apart. */
interface Sent {
  readonly inputs: SharedInputs
  readonly hash: string
}

/** What one cache entry knows about its shared inputs. */
interface SharedRecord {
  /** The shared inputs sent last. Every request of the entry uses them. */
  sent?: Sent
  /**
   * Hash of the shared inputs behind the entry's data. Set when a request of
   * this client fills the entry; a failed or cancelled request leaves it as
   * it was, as TanStack leaves the data.
   */
  data?: string
  /** The latest request started, while TanStack reports the entry fetching. */
  fetching?: { readonly hash: string }
}

/** What sending shared inputs found. */
export interface SendResult {
  /** The entry's data is not for the shared inputs now sent. */
  readonly stale: boolean
  /** A request for them is already in flight. */
  readonly requesting: boolean
}

/**
 * Kept on TanStack's `Query`, so a record goes away with its entry and each
 * `QueryClient` has its own.
 */
const records = new WeakMap<Query<any, any, any, any>, SharedRecord>()

function hashShared(inputs: SharedInputs): string {
  const normalized: Record<string, unknown> = {}
  for (const part of INPUT_PARTS) {
    const value = normalizeInputPart(part, inputs[part])
    if (value !== undefined) normalized[part] = value
  }
  return hashKey([normalized])
}

const NOTHING_SENT: Sent = { inputs: {}, hash: hashShared({}) }

/** Query options as this module reads them: a key and whatever else. */
type LooseQueryOptions = { queryKey: QueryKey }

/**
 * The entry for these options, created when it does not exist yet. The
 * options are defaulted first, so a custom `queryKeyHashFn` finds the same
 * entry TanStack does.
 */
export function entryOf(
  queryClient: QueryClient,
  options: LooseQueryOptions,
): Query<any, any, any, any> {
  return queryClient
    .getQueryCache()
    .build(queryClient, queryClient.defaultQueryOptions(options as never))
}

function recordOf(query: Query<any, any, any, any>): SharedRecord {
  let record = records.get(query)
  if (!record) {
    record = {}
    records.set(query, record)
  }
  return record
}

/**
 * Sends shared inputs to an entry: they replace the ones sent before, part by
 * part or field by field.
 *
 * Data that no request of this `QueryClient` produced (hydrated, or set by
 * hand) is trusted to be for the first shared inputs sent to it.
 */
export function sendSharedInputs(
  query: Query<any, any, any, any>,
  inputs: SharedInputs,
  rule: KeyRule,
): SendResult {
  const record = recordOf(query)
  const merged = mergeSharedInputs(record.sent?.inputs, inputs, rule)
  const hash = hashShared(merged)
  record.sent = { inputs: merged, hash }
  const inFlight = query.state.fetchStatus === 'idle' ? undefined : record.fetching
  if (record.data === undefined && inFlight === undefined) record.data = hash
  return { stale: record.data !== hash, requesting: inFlight?.hash === hash }
}

/** Whether the entry's data is for the shared inputs sent last. */
export function holdsSentInputs(query: Query<any, any, any, any>): boolean {
  const record = recordOf(query)
  return record.data === (record.sent ?? NOTHING_SENT).hash
}

/**
 * Runs a request of a shared entry with the shared inputs sent last, so it
 * does not matter whose `queryFn` TanStack calls.
 *
 * A request that resolves after the shared inputs changed is made again with
 * the new ones, so the entry never holds a result for inputs nobody holds.
 * That covers TanStack joining a request in flight instead of starting one.
 *
 * @param own - Shared inputs of the caller, used when nothing was sent yet
 *   (the first request of a suspense hook, which runs before any effect)
 */
export async function requestShared<T>(
  query: Query<any, any, any, any>,
  rule: KeyRule,
  own: SharedInputs | undefined,
  signal: AbortSignal,
  request: (inputs: SharedInputs) => Promise<T>,
): Promise<T> {
  const record = recordOf(query)
  if (!record.sent && own) sendSharedInputs(query, own, rule)
  for (;;) {
    const used = record.sent ?? NOTHING_SENT
    const flight = { hash: used.hash }
    record.fetching = flight
    let result: T
    try {
      result = await request(used.inputs)
    } finally {
      if (record.fetching === flight) record.fetching = undefined
    }
    // A cancelled request's result is dropped by TanStack
    if (signal.aborted) return result
    if ((record.sent ?? NOTHING_SENT).hash === used.hash) {
      record.data = used.hash
      return result
    }
  }
}

// A layout effect runs before the passive effect in which TanStack subscribes
// and makes the first request of a mount, so that request already has the
// inputs. It does nothing on the server, where the effect would warn on React 18.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

type Enabled = boolean | ((query: Query<any, any, any, any>) => boolean) | undefined

function noop() {}

/**
 * Sends a hook's shared inputs on mount, whenever they change, and when the
 * hook moves to another entry or becomes enabled. When the entry's data is
 * for other inputs and no request for these is in flight, the entry is
 * fetched with them, cancelling a request for other inputs.
 *
 * A disabled hook sends nothing. `enabled` is resolved during render, so an
 * inline function does not send again on every render.
 *
 * @param suspense - The hook suspends: TanStack runs it enabled, whatever the
 *   options say
 */
export function useSendSharedInputs(
  queryClient: QueryClient,
  options: LooseQueryOptions,
  rule: KeyRule,
  inputs: SharedInputs | undefined,
  suspense: boolean,
): void {
  const defaulted = queryClient.defaultQueryOptions(options as never)
  const keyHash = defaulted.queryHash
  const inputsHash = inputs ? hashShared(inputs) : undefined
  let enabled = true
  if (inputs && !suspense) {
    const option = defaulted.enabled as Enabled
    enabled =
      (typeof option === 'function' ? option(entryOf(queryClient, options)) : option) !== false
  }

  useIsomorphicLayoutEffect(() => {
    if (!inputs || !enabled) return
    const query = entryOf(queryClient, options)
    const { stale, requesting } = sendSharedInputs(query, inputs, rule)
    if (stale && !requesting) {
      // The entry itself, not the observer: in this layout effect the observer
      // still has the options of the previous render, so the previous entry.
      query.fetch(defaulted, { cancelRefetch: true }).catch(noop)
    }
    // `inputs`, `options` and `defaulted` are read through their hashes
  }, [queryClient, keyHash, inputsHash, enabled])
}
