import type { InjectionToken } from '../token/injection-token.mjs'
import type { ProviderRecord } from '../token/provider.mjs'

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

export type InvalidateListener = () => void

/**
 * Listener key that matches every instance of a token, whatever its args.
 * @internal
 */
export const ANY_ARGS = '*'

/**
 * Entries of one container, addressed by token and, for tokens with args, by
 * args key.
 * @internal
 */
export class Store {
  private readonly plain = new Map<InjectionToken<any, any>, Entry>()
  private keyed: Map<InjectionToken<any, any>, Map<string, Entry>> | null = null
  private byInstance: WeakMap<object, Entry> | null = null
  private listeners: Map<InjectionToken<any, any>, Map<string, Set<InvalidateListener>>> | null =
    null

  get(token: InjectionToken<any, any>, key: string | null): Entry | undefined {
    if (key === null) {
      return this.plain.get(token)
    }
    return this.keyed?.get(token)?.get(key)
  }

  set(token: InjectionToken<any, any>, key: string | null, entry: Entry): void {
    if (key === null) {
      this.plain.set(token, entry)
      return
    }
    this.keyed ??= new Map()
    let byKey = this.keyed.get(token)
    if (!byKey) {
      byKey = new Map()
      this.keyed.set(token, byKey)
    }
    byKey.set(key, entry)
  }

  /** Removes `entry` if it is still the one stored under its address. */
  delete(entry: Entry): void {
    if (entry.key === null) {
      if (this.plain.get(entry.token) === entry) {
        this.plain.delete(entry.token)
      }
      return
    }
    const byKey = this.keyed?.get(entry.token)
    if (byKey?.get(entry.key) === entry) {
      byKey.delete(entry.key)
      if (byKey.size === 0) {
        this.keyed!.delete(entry.token)
      }
    }
  }

  hasToken(token: InjectionToken<any, any>): boolean {
    return this.plain.has(token) || (this.keyed?.has(token) ?? false)
  }

  get size(): number {
    let size = this.plain.size
    if (this.keyed) {
      for (const byKey of this.keyed.values()) {
        size += byKey.size
      }
    }
    return size
  }

  /** Every entry, in no particular order. */
  entries(): Entry[] {
    const all = Array.from(this.plain.values())
    if (this.keyed) {
      for (const byKey of this.keyed.values()) {
        for (const entry of byKey.values()) {
          all.push(entry)
        }
      }
    }
    return all
  }

  trackInstance(entry: Entry): void {
    const instance = entry.instance
    if (instance !== null && (typeof instance === 'object' || typeof instance === 'function')) {
      this.byInstance ??= new WeakMap()
      this.byInstance.set(instance, entry)
    }
  }

  findByInstance(instance: unknown): Entry | undefined {
    if (instance === null || (typeof instance !== 'object' && typeof instance !== 'function')) {
      return undefined
    }
    return this.byInstance?.get(instance)
  }

  addListener(
    token: InjectionToken<any, any>,
    key: string | null,
    listener: InvalidateListener,
  ): () => void {
    this.listeners ??= new Map()
    let byKey = this.listeners.get(token)
    if (!byKey) {
      byKey = new Map()
      this.listeners.set(token, byKey)
    }
    const k = key ?? ''
    let set = byKey.get(k)
    if (!set) {
      set = new Set()
      byKey.set(k, set)
    }
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }

  /** Whether anything listens for instances of `token`, whatever the args. */
  hasListeners(token: InjectionToken<any, any>): boolean {
    return this.listeners?.has(token) ?? false
  }

  /**
   * Calls the listeners for the address of `entry`. A listener that throws
   * does not stop the others; `onError` receives what it threw.
   */
  notifyInvalidated(entry: Entry, onError: (error: unknown) => void): void {
    const byKey = this.listeners?.get(entry.token)
    if (byKey === undefined) {
      return
    }
    for (const key of [entry.key ?? '', ANY_ARGS]) {
      const set = byKey.get(key)
      if (set !== undefined && set.size > 0) {
        for (const listener of Array.from(set)) {
          try {
            listener()
          } catch (error) {
            onError(error)
          }
        }
      }
    }
  }
}
