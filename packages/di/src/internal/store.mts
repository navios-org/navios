import type { InjectionToken } from '../token/injection-token.mjs'

import { EntryStatus } from './entry.mjs'

import type { Entry } from './entry.mjs'

export type InvalidateListener = () => unknown

/**
 * Listener key that matches every instance of a token, whatever its args.
 */
export const ANY_ARGS = '*'

/**
 * Entries of one container, addressed by token and, for tokens with args, by
 * args key.
 */
export class Store {
  /** How many of its entries are in `Destroying` state. */
  destroying = 0

  private readonly plain = new Map<InjectionToken<any, any>, Entry>()
  private keyed: Map<InjectionToken<any, any>, Map<string, Entry>> | null = null
  /** Entries by instance. Two tokens may hold the same object. */
  private byInstance: WeakMap<object, Entry | Holders> | null = null
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
      const known = (this.byInstance ??= new WeakMap()).get(instance)
      if (known instanceof Holders) {
        known.add(entry)
      } else {
        this.byInstance.set(instance, known === undefined ? entry : new Holders(known, entry))
      }
    }
  }

  /** The live entries that hold `instance`. */
  findByInstance(instance: unknown): Entry[] {
    if (instance === null || (typeof instance !== 'object' && typeof instance !== 'function')) {
      return none
    }
    const found = this.byInstance?.get(instance)
    if (found === undefined) {
      return none
    }
    return (found instanceof Holders ? found.entries : [found]).filter(isReady)
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
      if (set.delete(listener) && set.size === 0 && byKey.get(k) === set) {
        byKey.delete(k)
        if (byKey.size === 0 && this.listeners!.get(token) === byKey) {
          this.listeners!.delete(token)
        }
      }
    }
  }

  /** Whether anything listens for instances of `token`, whatever the args. */
  hasListeners(token: InjectionToken<any, any>): boolean {
    return this.listeners?.has(token) ?? false
  }

  /** The listeners for the address of `entry`. */
  listenersFor(entry: Entry): InvalidateListener[] {
    const byKey = this.listeners?.get(entry.token)
    return byKey === undefined
      ? []
      : [...(byKey.get(entry.key ?? '') ?? []), ...(byKey.get(ANY_ARGS) ?? [])]
  }
}

const none: Entry[] = []

const isReady = (entry: Entry): boolean => entry.status === EntryStatus.Ready

// The entries that hold one object, and some that no longer do.
class Holders {
  entries: Entry[]
  private limit = 16

  constructor(...entries: Entry[]) {
    this.entries = entries
  }

  add(entry: Entry): void {
    if (this.entries.length >= this.limit) {
      this.entries = this.entries.filter(isReady)
      this.limit = Math.max(16, 2 * this.entries.length)
    }
    this.entries.push(entry)
  }
}
