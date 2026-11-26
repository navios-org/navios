import type { ProviderRecord } from '../provider/provider-record.mjs'
import type { InjectionToken } from '../token/injection-token.mjs'

import type { Host } from './host.mjs'
import type { ScopedLink } from './links.mjs'
import type { Store } from './store.mjs'

export const EntryStatus = {
  Creating: 0,
  Ready: 1,
  Failed: 2,
  /** Its dependents are being destroyed; its own teardown has not started. */
  Leaving: 3,
  /** Its own teardown is running. */
  Destroying: 4,
  Destroyed: 5,
} as const

export type EntryStatusValue = (typeof EntryStatus)[keyof typeof EntryStatus]

export type DestroyListener = () => void | Promise<void>

/**
 * One instance (or instance in the making) held by a container. The args a
 * factory token computes are held the same way.
 */
export interface Entry<T = any> {
  status: EntryStatusValue
  instance: T | undefined
  /**
   * While `Creating`: settles when the entry becomes ready (fulfils) or fails
   * (rejects). While it is being destroyed: fulfils when it is gone. `null`
   * otherwise, and while either is still in its synchronous part.
   */
  promise: Promise<void> | null
  readonly record: ProviderRecord
  readonly token: InjectionToken<any, any>
  /** Args key, or `null` when resolved without args. */
  readonly key: string | null
  readonly args: unknown
  /** The container it was built in. */
  readonly host: Host
  /** The store holding this entry; `null` for transients. */
  readonly store: Store | null
  /** For a transient: the entry it was built for, if any. */
  readonly creator: Entry | null
  /** Creation order, used to destroy in reverse. */
  readonly seq: number
  /** For a stored entry: the order in which entries became ready. */
  readySeq: number
  /**
   * Something it was built from is gone, or nobody wants it any more: it is
   * destroyed as soon as it is ready.
   */
  stale: boolean
  /** The stored entries it injected; for a transient only if it has an owner. */
  deps: Entry[] | null
  /** The entries of its own container that injected it. */
  dependents: Set<Entry> | null
  /** The first link from an entry of another container, a scope, that injected it. */
  scopedDependents: ScopedLink | null
  /** The first of its links to entries of another container, its root. */
  rootLinks: ScopedLink | null
  /** Transient instances built for this entry; destroyed with it. */
  transients: Entry[] | null
  destroyListeners: DestroyListener[] | null
  /** Entries this one is currently waiting on; used to detect async cycles. */
  waitingFor: Set<Entry> | null
}

let sequence = 0
let readySequence = 0

export function createEntry(
  record: ProviderRecord,
  token: InjectionToken<any, any>,
  key: string | null,
  args: unknown,
  host: Host,
  store: Store | null,
  creator: Entry | null,
): Entry {
  return {
    status: EntryStatus.Creating,
    instance: undefined,
    promise: null,
    record,
    token,
    key,
    args,
    host,
    store,
    creator,
    seq: ++sequence,
    readySeq: 0,
    stale: false,
    deps: null,
    dependents: null,
    scopedDependents: null,
    rootLinks: null,
    transients: null,
    destroyListeners: null,
    waitingFor: null,
  }
}

/** Makes `value` the instance of `entry` and the entry available. */
export function markReady(entry: Entry, value: unknown): void {
  entry.instance = value
  entry.status = EntryStatus.Ready
  if (entry.store !== null) {
    entry.readySeq = ++readySequence
    entry.store.trackInstance(entry)
  }
}

/** Whether `entry` is on its way out. */
export function isLeaving(entry: Entry): boolean {
  return entry.status === EntryStatus.Leaving || entry.status === EntryStatus.Destroying
}

/**
 * Whether `entry` holds the container it belongs to: the entry a container
 * keeps of itself for `inject(Container)`, or another way to the same object.
 * It is neither listed among the instances of the container nor destroyed
 * with them.
 */
export function isSelfEntry(entry: Entry): boolean {
  return entry.instance === entry.host
}
