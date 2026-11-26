import { initializationError } from '../errors/create.mjs'
import { DIError } from '../errors/di-error.mjs'

import { inBackground } from './background.mjs'
import { discard, runDestroyListeners } from './destruction.mjs'
import { EntryStatus, markReady } from './entry.mjs'
import { unlink } from './links.mjs'

import type { Entry } from './entry.mjs'
import type { Frame } from './frame.mjs'

// Makes `value` the instance of an entry whose build is over. One that went
// stale while it was built is destroyed at once.
export function settleEntry(entry: Entry, value: unknown): void {
  entry.promise = null
  entry.waitingFor = null
  markReady(entry, value)
  if (entry.stale) {
    discard(entry)
  }
}

// Ends the build of `entry` with `error`, and releases what it had acquired.
// Returns what to throw: `error` itself if it is a `DIError`, otherwise an
// `InitializationError` that wraps it. `frame` is the build that failed, if
// any.
export function failEntry(entry: Entry, error: unknown, frame: Frame | null): DIError {
  const wrapped =
    error instanceof DIError ? error : initializationError(entry.token.toString(), error)
  if (entry.status === EntryStatus.Creating) {
    entry.status = EntryStatus.Failed
    entry.promise = null
    entry.waitingFor = null
    entry.store?.delete(entry)
    unlink(entry)
    cleanUpFailed(entry, frame)
  }
  return wrapped
}

/**
 * Releases what a build that failed had acquired: the destroy listeners its
 * factory registered, and its transients, also those of the pass that failed,
 * which no one adopted.
 */
function cleanUpFailed(entry: Entry, frame: Frame | null): void {
  const released = runDestroyListeners(entry)
  if (released !== null) {
    inBackground(entry.host, Promise.all(released))
  }
  entry.transients?.forEach(discard)
  entry.transients = null
  if (frame !== null) {
    frame.used?.forEach(discard)
    frame.reuse?.forEach(discard)
    frame.used = frame.reuse = null
  }
}
