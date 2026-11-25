import { DIError, DIErrorCode } from '../errors/di-error.mjs'

import { inBackground } from './background.mjs'
import { EntryStatus, isLeaving } from './entry.mjs'
import { runHook } from './frame.mjs'
import { unlink } from './links.mjs'
import { isThenable, noop } from './thenable.mjs'

import type { DestroyListener, Entry } from './entry.mjs'
import type { Host } from './host.mjs'

/**
 * One `invalidate()` or `dispose()` call: the entries it destroyed that
 * somebody listens for. The listeners are called when the whole call has
 * finished, so that what they resolve is built against a settled container.
 */
interface Cascade {
  gone: Entry[] | null
}

/**
 * Destroys an entry: its dependents first, then its own destroy listeners,
 * then the transients it owns. Synchronous when nothing involved is async.
 * `onInvalidate` listeners are called last, after everything is destroyed.
 *
 * A dependent that is still being created is not waited for, since it may be
 * waiting for this very destruction. It is destroyed once it is ready.
 */
export function destroyEntry(entry: Entry): void | Promise<void> {
  const cascade: Cascade = { gone: null }
  const result = destroy(entry, cascade)
  if (result !== undefined) {
    return result.then(() => notify(cascade))
  }
  notify(cascade)
}

// Destroys an entry nobody waits for. The disposal of its container does,
// except for a transient that is still being built: it is destroyed once it is
// ready, which may be never.
export function discard(entry: Entry): void {
  if (entry.status === EntryStatus.Creating && entry.store === null) {
    entry.stale = true
    return
  }
  try {
    const result = destroyEntry(entry)
    if (result !== undefined) {
      inBackground(
        entry.host,
        result.catch((error) => reportListenerError(entry, error)),
      )
    }
  } catch (error) {
    reportListenerError(entry, error)
  }
}

function destroy(entry: Entry, cascade: Cascade): void | Promise<void> {
  switch (entry.status) {
    case EntryStatus.Ready:
      break
    case EntryStatus.Leaving:
    case EntryStatus.Destroying:
      return entry.promise ?? undefined
    case EntryStatus.Creating: {
      entry.stale = true
      const settled = (entry.promise ?? Promise.resolve()).then(noop, noop)
      return settled.then(() => (isLeaving(entry) ? (entry.promise ?? undefined) : undefined))
    }
    default:
      return
  }

  entry.status = EntryStatus.Leaving
  if (entry.store !== null) {
    entry.store.destroying++
  }
  let waits: Promise<void>[] | null = null
  if (entry.dependents !== null && entry.dependents.size > 0) {
    for (const dependent of Array.from(entry.dependents)) {
      if (dependent.status === EntryStatus.Creating) {
        dependent.stale = true
        continue
      }
      const result = destroy(dependent, cascade)
      if (result !== undefined) {
        ;(waits ??= []).push(result)
      }
    }
  }

  const result =
    waits === null
      ? teardown(entry, cascade)
      : Promise.all(waits).then(() => teardown(entry, cascade))
  if (result !== undefined) {
    const settled = result.then(noop, noop)
    entry.promise = settled
    return settled
  }
}

function teardown(entry: Entry, cascade: Cascade): void | Promise<void> {
  entry.status = EntryStatus.Destroying
  let waits = runDestroyListeners(entry)
  if (entry.transients !== null) {
    for (const transient of entry.transients) {
      const result = destroy(transient, cascade)
      if (result !== undefined) {
        ;(waits ??= []).push(result)
      }
    }
  }
  if (waits !== null) {
    return Promise.all(waits).then(() => finalize(entry, cascade))
  }
  finalize(entry, cascade)
}

/**
 * Runs the destroy listeners of `entry`, newest first. Returns what is left
 * to wait for.
 */
export function runDestroyListeners(entry: Entry): Promise<unknown>[] | null {
  const listeners = entry.destroyListeners
  if (listeners === null) {
    return null
  }
  entry.destroyListeners = null
  let waits: Promise<unknown>[] | null = null
  for (let i = listeners.length - 1; i >= 0; i--) {
    const result = runDestroyListener(entry, listeners[i])
    if (result !== undefined) {
      ;(waits ??= []).push(result)
    }
  }
  return waits
}

/**
 * Runs one destroy listener. What it throws is reported and does not stop
 * anything else.
 */
export function runDestroyListener(
  entry: Entry,
  listener: DestroyListener,
): Promise<unknown> | undefined {
  try {
    const result = runHook(entry, listener)
    if (isThenable(result)) {
      return Promise.resolve(result).then(noop, (error) => reportHookError(entry, error))
    }
  } catch (error) {
    reportHookError(entry, error)
  }
}

function reportHookError(entry: Entry, error: unknown): void {
  entry.host.root.reportError?.(error, `A destroy hook of ${entry.token} failed`)
}

function finalize(entry: Entry, cascade: Cascade): void {
  entry.status = EntryStatus.Destroyed
  if (entry.store !== null) {
    entry.store.destroying--
    entry.store.delete(entry)
  }
  unlink(entry)
  entry.dependents = null
  entry.transients = null
  entry.promise = null
  if (entry.store !== null && entry.store.hasListeners(entry.token)) {
    ;(cascade.gone ??= []).push(entry)
  }
}

/**
 * Calls the `onInvalidate` listeners of everything the cascade destroyed, in
 * the order of destruction. Every listener runs; the first error is rethrown
 * afterwards. What an asynchronous listener rejects with is reported.
 */
function notify(cascade: Cascade): void {
  const gone = cascade.gone
  if (gone === null) {
    return
  }
  cascade.gone = null
  const failures: unknown[] = []
  for (const entry of gone) {
    const disposing = entry.host.disposed || entry.host.root.disposed
    // A listener that resolves again is refused when a disposal is the reason
    // why it is called. That is not an error of the listener.
    const isRefusal = (error: unknown) =>
      disposing && error instanceof DIError && error.code === DIErrorCode.ContainerDisposed
    for (const listener of entry.store!.listenersFor(entry)) {
      const previous = refusalExpected
      refusalExpected = disposing
      try {
        const result = listener()
        if (isThenable(result)) {
          result.then(undefined, (error) => {
            if (!isRefusal(error)) {
              reportListenerError(entry, error)
            }
          })
        }
      } catch (error) {
        if (!isRefusal(error)) {
          failures.push(error)
        }
      } finally {
        refusalExpected = previous
      }
    }
  }
  if (failures.length > 0) {
    throw failures[0]
  }
}

// Whether a listener runs that is called because of a disposal.
let refusalExpected = false

/**
 * The rejection `get()` returns. A listener that is called because of a
 * disposal, and starts to resolve again without waiting for the result, does
 * not have to handle it.
 */
export function rejectWith(error: unknown): Promise<never> {
  const rejection = Promise.reject(error)
  if (refusalExpected) {
    rejection.catch(noop)
  }
  return rejection
}

function reportListenerError(entry: Entry, error: unknown): void {
  entry.host.root.reportError?.(error, `An onInvalidate listener of ${entry.token} failed`)
}

/**
 * Destroys every entry of a store in reverse creation order, as one cascade:
 * `onInvalidate` listeners are called after the last entry is destroyed.
 */
export function destroyAll(entries: Entry[]): void | Promise<void> {
  if (entries.length === 0) {
    return
  }
  if (entries.length > 1) {
    entries.sort((a, b) => b.seq - a.seq)
  }
  const cascade: Cascade = { gone: null }
  const result = destroyFrom(entries, 0, cascade)
  if (result !== undefined) {
    return result.then(() => notify(cascade))
  }
  notify(cascade)
}

/**
 * Destroys the transients a container has handed out to nobody who would
 * destroy them.
 */
export function destroyLoose(host: Host): void | Promise<void> {
  const loose = host.looseTransients
  if (loose !== null) {
    host.looseTransients = null
    return destroyAll(loose)
  }
}

function destroyFrom(entries: Entry[], start: number, cascade: Cascade): void | Promise<void> {
  for (let i = start; i < entries.length; i++) {
    const result = destroy(entries[i], cascade)
    if (result !== undefined) {
      return result.then(() => destroyFrom(entries, i + 1, cascade))
    }
  }
}
