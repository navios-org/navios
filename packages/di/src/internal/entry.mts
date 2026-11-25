import type { ProviderRecord } from '../provider/provider-record.mjs'
import type { InjectionToken } from '../token/injection-token.mjs'

import type { Store } from './store.mjs'

export const EntryStatus = {
  Creating: 0,
  Ready: 1,
  Failed: 2,
  Destroying: 3,
  Destroyed: 4,
} as const

export type EntryStatusValue = (typeof EntryStatus)[keyof typeof EntryStatus]

export type DestroyListener = () => void | Promise<void>

/**
 * One instance (or instance in the making) held by a container.
 * @internal
 */
export interface Entry<T = any> {
  status: EntryStatusValue
  instance: T | undefined
  error: unknown
  /**
   * While `Creating`: settles when the entry becomes ready (fulfils) or fails
   * (rejects). `null` otherwise.
   */
  promise: Promise<void> | null
  destroyPromise: Promise<void> | null
  readonly record: ProviderRecord
  readonly token: InjectionToken<any, any>
  /** Args key, or `null` when resolved without args. */
  readonly key: string | null
  readonly args: unknown
  /** The store holding this entry; `null` for transients. */
  readonly store: Store | null
  /** Creation order, used to destroy in reverse. */
  readonly seq: number
  deps: Entry[] | null
  dependents: Set<Entry> | null
  /** Transient instances built for this entry; destroyed with it. */
  transients: Entry[] | null
  destroyListeners: DestroyListener[] | null
  /** Entries this one is currently waiting on; used to detect async cycles. */
  waitingFor: Set<Entry> | null
}

let sequence = 0

export function createEntry(
  record: ProviderRecord,
  token: InjectionToken<any, any>,
  key: string | null,
  args: unknown,
  store: Store | null,
): Entry {
  return {
    status: EntryStatus.Creating,
    instance: undefined,
    error: undefined,
    promise: null,
    destroyPromise: null,
    record,
    token,
    key,
    args,
    store,
    seq: ++sequence,
    deps: null,
    dependents: null,
    transients: null,
    destroyListeners: null,
    waitingFor: null,
  }
}
