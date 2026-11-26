import { EntryStatus } from './entry.mjs'
import { noop } from './thenable.mjs'

import type { Entry } from './entry.mjs'
import type { Host } from './host.mjs'
import type { Store } from './store.mjs'

// Lets the disposal of `host` wait for `work`, which nobody else awaits.
export function inBackground(host: Host, work: PromiseLike<unknown>): void {
  const pending = (host.background ??= new Set())
  const settled: Promise<unknown> = Promise.resolve(work)
    .then(noop, noop)
    .then(() => pending.delete(settled))
  pending.add(settled)
}

// Lets `host` know of a transient in the making. No store lists it.
export function trackBuild(host: Host, entry: Entry): void {
  const building = (host.building ??= new Set())
  const settled = () => building.delete(entry)
  building.add(entry)
  entry.promise!.then(settled, settled)
}

// How long a disposal waits for what is in the making but not stored.
const PATIENCE = 1000

// Not what a test puts in their place.
const { setTimeout, clearTimeout } = globalThis

// Has the transients in the making, and the factory values being computed,
// destroyed as soon as they are ready. Returns what the disposal of `host`
// waits for, if anything: not forever, since they may never be ready.
export function abandonBuilds(host: Host): Promise<void> | undefined {
  if (host !== host.root && (host.building === null || host.building.size === 0)) {
    // A scope, disposed once per request, that builds nothing.
    return undefined
  }
  const builds = [...(host.building ?? [])]
  if (host === host.root) {
    builds.push(...host.root.factoryValues.values())
  }
  const pending: Promise<unknown>[] = []
  for (const entry of builds) {
    if (entry.status === EntryStatus.Creating) {
      entry.stale = true
      pending.push((entry.promise ?? Promise.resolve()).then(noop, noop))
    }
  }
  if (pending.length === 0) {
    return undefined
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, PATIENCE)
    void Promise.all(pending).then(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function creatingIn(store: Store): Promise<unknown>[] {
  const promises: Promise<unknown>[] = []
  for (const entry of store.entries()) {
    if (entry.status === EntryStatus.Creating && entry.promise !== null) {
      promises.push(entry.promise.then(noop, noop))
    }
  }
  return promises
}

/** Waits until no entry of the store is still being created. */
export async function settleStore(store: Store): Promise<void> {
  for (;;) {
    const creating = creatingIn(store)
    if (creating.length === 0) {
      return
    }
    await Promise.all(creating)
  }
}

/** Whether something of `host` is still being created or cleaned up. */
export function isBusy(host: Host): boolean {
  return (
    (host.background !== null && host.background.size > 0) ||
    host.store.entries().some((entry) => entry.status === EntryStatus.Creating)
  )
}

/** Waits until nothing of `host` is being created or cleaned up any more. */
export async function settleHost(host: Host): Promise<void> {
  while (isBusy(host)) {
    await Promise.all([...creatingIn(host.store), ...(host.background ?? [])])
  }
}
