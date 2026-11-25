import { EntryStatus } from './entry.mjs'
import { unlink } from './links.mjs'
import { isThenable, noop } from './thenable.mjs'

import type { Entry } from './entry.mjs'
import type { DestroyErrorReporter } from './store.mjs'

/**
 * One `invalidate()` or `dispose()` call: the entries it destroyed that
 * somebody listens for. The listeners are called when the whole call has
 * finished, so that what they resolve is built against a settled container.
 */
interface Cascade {
  gone: Entry[] | null
  /** Told about what a destroy hook threw; taken from the first store met. */
  report: DestroyErrorReporter | null
}

/**
 * Destroys an entry: its dependents first, then its own destroy listeners,
 * then the transients it owns. Synchronous when nothing involved is async.
 * `onInvalidate` listeners are called last, after everything is destroyed.
 * @internal
 */
export function destroyEntry(entry: Entry): void | Promise<void> {
  const cascade: Cascade = { gone: null, report: null }
  const result = destroy(entry, cascade)
  if (result !== undefined) {
    return result.then(() => notify(cascade))
  }
  notify(cascade)
}

function destroy(entry: Entry, cascade: Cascade): void | Promise<void> {
  switch (entry.status) {
    case EntryStatus.Ready:
      break
    case EntryStatus.Destroying:
      return entry.destroyPromise ?? undefined
    case EntryStatus.Creating: {
      const pending = (entry.promise ?? Promise.resolve()).then(noop, noop)
      return pending.then(() => destroy(entry, cascade))
    }
    default:
      return
  }

  entry.status = EntryStatus.Destroying
  if (entry.store !== null) {
    entry.store.destroying++
    cascade.report ??= entry.store.report
  }
  let waits: Promise<void>[] | null = null
  if (entry.dependents !== null && entry.dependents.size > 0) {
    for (const dependent of Array.from(entry.dependents)) {
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
    entry.destroyPromise = settled
    return settled
  }
}

function teardown(entry: Entry, cascade: Cascade): void | Promise<void> {
  let waits: Promise<unknown>[] | null = null
  if (entry.destroyListeners !== null) {
    for (let i = entry.destroyListeners.length - 1; i >= 0; i--) {
      // A failing destroy hook must not stop the rest of the teardown.
      try {
        const result = entry.destroyListeners[i]()
        if (isThenable(result)) {
          ;(waits ??= []).push(
            Promise.resolve(result).then(noop, (error) => cascade.report?.(error, entry)),
          )
        }
      } catch (error) {
        cascade.report?.(error, entry)
      }
    }
  }
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

function finalize(entry: Entry, cascade: Cascade): void {
  entry.status = EntryStatus.Destroyed
  if (entry.store !== null) {
    entry.store.destroying--
    entry.store.delete(entry)
  }
  unlink(entry)
  entry.dependents = null
  entry.transients = null
  entry.destroyListeners = null
  entry.destroyPromise = null
  if (entry.store !== null && entry.store.hasListeners(entry.token)) {
    ;(cascade.gone ??= []).push(entry)
  }
}

/**
 * Calls the `onInvalidate` listeners of everything the cascade destroyed, in
 * the order of destruction. Every listener runs; the first error is rethrown
 * afterwards.
 */
function notify(cascade: Cascade): void {
  const gone = cascade.gone
  if (gone === null) {
    return
  }
  cascade.gone = null
  let failed = false
  let failure: unknown
  const onError = (error: unknown) => {
    if (!failed) {
      failed = true
      failure = error
    }
  }
  for (const entry of gone) {
    entry.store!.notifyInvalidated(entry, onError)
  }
  if (failed) {
    throw failure
  }
}

/**
 * Destroys every entry of a store in reverse creation order, as one cascade:
 * `onInvalidate` listeners are called after the last entry is destroyed.
 * @internal
 */
export function destroyAll(
  entries: Entry[],
  report: DestroyErrorReporter | null = null,
): void | Promise<void> {
  if (entries.length === 0) {
    return
  }
  if (entries.length > 1) {
    entries.sort((a, b) => b.seq - a.seq)
  }
  const cascade: Cascade = { gone: null, report }
  const result = destroyFrom(entries, 0, cascade)
  if (result !== undefined) {
    return result.then(() => notify(cascade))
  }
  notify(cascade)
}

function destroyFrom(entries: Entry[], start: number, cascade: Cascade): void | Promise<void> {
  for (let i = start; i < entries.length; i++) {
    const result = destroy(entries[i], cascade)
    if (result !== undefined) {
      return result.then(() => destroyFrom(entries, i + 1, cascade))
    }
  }
}
