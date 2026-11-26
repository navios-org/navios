import { asyncInitRequired, misuse, notYetDestroyed } from '../errors/create.mjs'

import type { FactoryContext } from '../provider/factory-context.mjs'
import type { AnyInjectableType } from '../token/injection-token.mjs'

import { inBackground } from './background.mjs'
import { MAX_PASSES, resolveTop, Wait } from './construction.mjs'
import { discard, rejectWith, runDestroyListener } from './destruction.mjs'
import { EntryStatus, isLeaving } from './entry.mjs'
import { runHook } from './frame.mjs'
import { addWaitEdge, linkTo } from './links.mjs'
import { disposedError, isDisposed } from './liveness.mjs'
import { baseToken } from './lookup.mjs'
import { findReady } from './stored-values.mjs'

import type { Entry } from './entry.mjs'
import type { Host } from './host.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/*
 * Resolving from outside any construction: `get()`, `getSync()`, the work of
 * `asyncInject()`, and the `inject()` of a factory context.
 */

/** Lets `host` destroy a transient that it handed out to no owner. */
export function keepLoose(host: Host, entry: Entry): void {
  if (
    host.isScope &&
    entry.store === null &&
    (entry.destroyListeners !== null || entry.transients !== null)
  ) {
    ;(host.looseTransients ??= []).push(entry)
  }
}

/**
 * Throws when `entry` became ready only after its container was disposed. A
 * stored entry is left to the disposal.
 */
function assertInTime(entry: Entry): void {
  if (isDisposed(entry.host)) {
    if (entry.store === null) {
      discard(entry)
    }
    throw disposedError(entry.host)
  }
}

/** Fails a request whose result has been invalidated over and over. */
function assertSettles(raw: AnyInjectableType, restarts: number): void {
  if (restarts > MAX_PASSES) {
    throw misuse(
      `${String(baseToken(raw))} was invalidated ${restarts} times in a row while it was being built`,
    )
  }
}

/**
 * Repeats `step` until it comes to an entry that is ready, and returns what
 * `done` makes of that entry. `first` is what a synchronous attempt came to.
 *
 * A `Wait` is waited for, after `onWait` had a look at it, and so is an entry
 * that is still being created: `watch` is told which one, and `null` when the
 * wait is over. What was built for the request and is gone before it could
 * be handed out, as a `Wait` that asks to rebuild or a creation that did not
 * end ready, is a restart; too many in a row fail the request.
 */
async function untilReady<T>(
  raw: AnyInjectableType,
  step: () => Entry | Wait,
  done: (entry: Entry) => T,
  first?: Entry | Wait,
  watch?: (waitingFor: Entry | null) => void,
  onWait?: (wait: Wait) => void,
): Promise<T> {
  let resolved = first ?? step()
  for (let restarts = 0; ; resolved = step()) {
    if (resolved instanceof Wait) {
      onWait?.(resolved)
      if (resolved.rebuild) {
        assertSettles(raw, ++restarts)
      }
      await resolved.promise
      continue
    }
    if (resolved.status !== EntryStatus.Creating) {
      return done(resolved)
    }
    if (watch === undefined) {
      await resolved.promise
    } else {
      watch(resolved)
      try {
        await resolved.promise
      } finally {
        watch(null)
      }
    }
    if ((resolved.status as number) === EntryStatus.Ready) {
      assertInTime(resolved)
      return done(resolved)
    }
    assertSettles(raw, ++restarts)
  }
}

/**
 * Resolves to an entry that is ready. `first` is what a synchronous attempt
 * came to; `watch` is told which entry is being waited for, and `null` when
 * the wait is over.
 */
export function resolveAsync(
  host: Host,
  raw: AnyInjectableType,
  rawArgs: unknown,
  by: Entry | null = null,
  first?: Entry | Wait,
  watch?: (waitingFor: Entry | null) => void,
): Promise<Entry> {
  return untilReady(
    raw,
    () => resolveTop(host, raw, rawArgs, by),
    by === null ? (entry) => keptLoose(host, entry) : sameEntry,
    first,
    watch,
  )
}

function keptLoose(host: Host, entry: Entry): Entry {
  keepLoose(host, entry)
  return entry
}

function sameEntry(entry: Entry): Entry {
  return entry
}

/**
 * What `get()` returns. Resolves in one step when nothing is asynchronous.
 */
export function resolveInstance(
  host: Host,
  raw: AnyInjectableType,
  rawArgs: unknown,
): Promise<unknown> {
  try {
    const ready = findReady(host, raw, rawArgs)
    if (ready !== undefined) {
      return Promise.resolve(ready.instance)
    }
    const first = resolveTop(host, raw, rawArgs, null)
    if (!(first instanceof Wait) && first.status !== EntryStatus.Creating) {
      keepLoose(host, first)
      return Promise.resolve(first.instance)
    }
    return resolveAsync(host, raw, rawArgs, null, first).then(instanceOf)
  } catch (error) {
    return rejectWith(error)
  }
}

function instanceOf(entry: Entry): unknown {
  return entry.instance
}

export function resolveSyncOrThrow(host: Host, raw: AnyInjectableType, rawArgs: unknown): Entry {
  const resolved = resolveTop(host, raw, rawArgs, null)
  if (resolved instanceof Wait) {
    throw resolved.leaving !== null
      ? notYetDestroyed(resolved.leaving.token.toString())
      : asyncInitRequired(String(baseToken(raw)))
  }
  if (resolved.status === EntryStatus.Creating) {
    if (resolved.store === null) {
      // Nobody will receive the transient. A stored one is left to be ready
      // for a later call.
      discard(resolved)
    }
    throw asyncInitRequired(String(baseToken(raw)))
  }
  keepLoose(host, resolved)
  return resolved
}

/** The context handed to a factory: of a provider, or of a factory token. */
export function createFactoryContext(entry: Entry): FactoryContext {
  const { host } = entry
  return {
    inject: (token: any, args?: unknown) => contextInject(entry, token, args),
    container: host,
    addDestroyListener: (listener) => {
      if (entry.status <= EntryStatus.Ready || entry.status === EntryStatus.Leaving) {
        ;(entry.destroyListeners ??= []).push(listener)
        return
      }
      // The teardown is past the listeners, so what this one releases would
      // stay behind.
      const released = runDestroyListener(entry, listener)
      if (released !== undefined) {
        inBackground(host, released)
      }
    },
  }
}

// `ctx.inject()`: resolves for `owner`, which may still be in the making,
// ready, or on its way out.
function contextInject(owner: Entry, raw: AnyInjectableType, rawArgs: unknown): Promise<any> {
  const { host } = owner
  let waitingOn: Entry | null = null
  return untilReady(
    raw,
    () => {
      const by = owner.status === EntryStatus.Creating ? owner : null
      return isLeaving(owner)
        ? runHook(owner, () => resolveTop(host, raw, rawArgs, by))
        : resolveTop(host, raw, rawArgs, by)
    },
    (resolved) => {
      if (resolved.store !== null) {
        linkTo(resolved, owner)
      } else if (owner.status === EntryStatus.Creating) {
        ;(owner.transients ??= []).push(resolved)
      } else if (owner.status === EntryStatus.Failed) {
        discard(resolved)
      } else {
        // Once the owner is built, `inject` may be called any number of times,
        // so the owner does not keep what it hands out. A scope does, as for a
        // `get`.
        keepLoose(host, resolved)
      }
      return resolved.instance
    },
    undefined,
    (entry) => {
      if (entry !== null) {
        addWaitEdge(owner, entry)
        waitingOn = entry
      } else if (waitingOn !== null) {
        owner.waitingFor?.delete(waitingOn)
        waitingOn = null
      }
    },
    (wait) => {
      if (wait.leaving !== null && isLeaving(owner)) {
        throw misuse(
          `${wait.leaving.token} is being destroyed, and ${owner.token} cannot wait for that ` +
            `while it is being destroyed itself`,
        )
      }
    },
  )
}
