import {
  circularDependency,
  misuse,
  providerNotFound,
  requestScopeFromRoot,
} from '../errors/create.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { validateSync } from '../schema/standard-schema.mjs'

import type { ProviderRecord } from '../provider/provider-record.mjs'
import type {
  AnyInjectableType,
  FactoryInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'

import { keyOf } from './args-key.mjs'
import { trackBuild } from './background.mjs'
import { discard } from './destruction.mjs'
import { createEntry, EntryStatus, isLeaving, markReady } from './entry.mjs'
import {
  current,
  enter,
  framePath,
  hookOwner,
  onStack,
  outside,
  rethrowFailure,
  runHook,
} from './frame.mjs'
import { isDestroying, leavingIn } from './leaving.mjs'
import { addWaitEdge, isIntact, relink, unlink } from './links.mjs'
import { assertLive, disposedError, isDisposed } from './liveness.mjs'
import { baseToken, followAlias, lookupRecord } from './lookup.mjs'
import { normalize, normArgs, normToken } from './normalize.mjs'
import { failEntry, settleEntry } from './outcome.mjs'
import { createFactoryContext } from './resolution.mjs'
import { findStored } from './store.mjs'
import { isThenable, noop } from './thenable.mjs'

import type { Entry } from './entry.mjs'
import type { Frame, Pass } from './frame.mjs'
import type { Host } from './host.mjs'
import type { Store } from './store.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/*
 * Building what a token stands for: finding or creating its entry, and the
 * construction passes of a class or a factory, inside whatever construction
 * asked for it, or as from outside any construction (`resolveTop`).
 */

/**
 * A resolution that cannot proceed until `promise` settles; the caller
 * retries afterwards.
 */
export class Wait {
  constructor(
    public readonly promise: Promise<unknown>,
    /** What is being destroyed, when that is the reason. */
    public readonly leaving: Entry | null = null,
    /** Set when it was built for this request and is already gone. */
    public readonly rebuild = false,
    /** The factory token whose value is being computed, when that is the reason. */
    public readonly factory: FactoryInjectionToken<any, any> | null = null,
    /** What it waits for, if it is an entry. */
    public readonly until: Entry | null = leaving,
  ) {}
}

/**
 * Thrown by `inject()` inside a factory to end a pass that is going to be
 * repeated. Only seen outside the engine by a factory that catches it.
 */
export class DependencyNotReady extends Error {
  constructor(name: string) {
    super(`[Injector] ${name} is not ready yet; the factory runs again once it is`)
    this.name = 'DependencyNotReady'
  }
}

// What the resolution in progress outside any construction was started for:
// an entry that used `asyncInject()`, or the context of a factory.
let startedBy: Entry | null = null

/**
 * Resolves from outside any construction (a `get` call), so the current
 * construction stack, if any, is not treated as the caller. `by` is the entry
 * it is resolved for, if any.
 */
export function resolveTop(
  host: Host,
  raw: AnyInjectableType,
  rawArgs: unknown,
  by: Entry | null,
): Entry | Wait {
  const previous = enter(null)
  const previousStarter = startedBy
  startedBy = by
  try {
    return resolveReference(host, raw, rawArgs)
  } finally {
    startedBy = previousStarter
    enter(previous)
  }
}

function cyclePath(entry: Entry): string[] {
  const path = framePath()
  const name = entry.token.toString()
  const start = path.indexOf(name)
  return [...(start >= 0 ? path.slice(start) : path), name]
}

// A transient is not stored, so one that leads back to itself is only visible
// on the construction stack, and beyond it in what started that construction.
// A stored entry on the way ends such a chain, since it is built once.
function assertNoTransientCycle(token: InjectionToken<any, any>, key: string | null): void {
  let bottom: Entry | null = null
  let endsHere = false
  for (let frame = current; frame !== null; frame = frame.parent) {
    bottom = frame.entry
    if (bottom.store !== null) {
      endsHere = true
    } else if (bottom.token === token && bottom.key === key) {
      throw circularDependency(cyclePath(bottom))
    }
  }
  const first = endsHere ? null : bottom === null ? startedBy : bottom.creator
  for (let entry = first; entry !== null && entry.store === null; entry = entry.creator) {
    if (entry.token === token && entry.key === key) {
      const path = framePath()
      for (let step: Entry = first!; step !== entry; step = step.creator!) {
        path.unshift(step.token.toString())
      }
      throw circularDependency([entry.token.toString(), ...path, token.toString()])
    }
  }
}

// Whether an entry whose dependents are being destroyed may still be handed
// out: to a destroy hook, which runs before the teardown of what its service
// injected, and to anyone while the container is being disposed. Never to a
// construction, which would end up with an instance that is about to go.
function isStillUsable(entry: Entry): boolean {
  return (
    current === null &&
    startedBy?.status !== EntryStatus.Creating &&
    (isDisposed(entry.host) ||
      (hookOwner !== null && isLeaving(hookOwner) && hookOwner.host.root === entry.host.root))
  )
}

/**
 * Resolves a normalised token against `host`. Returns a ready entry, an entry
 * that is still being created (await `entry.promise`), or a `Wait`. An entry
 * in `Leaving` state is returned only to callers that may still use it.
 *
 * Never awaits: everything that can be built synchronously is built before
 * this returns.
 */
export function resolve(
  host: Host,
  token: InjectionToken<any, any>,
  rawArgs: unknown,
): Entry | Wait {
  let args = rawArgs
  if (token.schema !== undefined) {
    args = validateSync(token.schema, rawArgs, token.toString())
  }
  const key = keyOf(args)
  if (current !== null && current.failures !== null) {
    rethrowFailure(current, token, key)
  }

  for (;;) {
    const existing = findStored(host, token, key)
    if (existing !== undefined) {
      switch (existing.status) {
        case EntryStatus.Ready:
          return existing
        case EntryStatus.Creating:
          if (onStack(existing)) {
            throw circularDependency(cyclePath(existing))
          }
          return existing
        case EntryStatus.Leaving:
        case EntryStatus.Destroying:
          if (existing.status === EntryStatus.Leaving && isStillUsable(existing)) {
            return existing
          }
          if (isDisposed(existing.host)) {
            throw disposedError(existing.host)
          }
          return new Wait(existing.promise ?? Promise.resolve(), existing)
        default:
          // A failed or destroyed entry that was not removed; drop it and retry.
          existing.store?.delete(existing)
          continue
      }
    }

    const record = lookupRecord(host, token)
    if (record === undefined) {
      if (token.scope === InjectableScope.Request && !host.isScope) {
        throw requestScopeFromRoot(token.toString(), framePath())
      }
      throw providerNotFound(token.toString(), framePath())
    }
    if (record.kind === 'existing') {
      return resolveAlias(host, token, rawArgs)
    }

    switch (record.scope) {
      case InjectableScope.Singleton:
        assertLive(host.root)
        return build(host.root, host.root.store, record, token, key, args)
      case InjectableScope.Request:
        if (!host.isScope) {
          throw requestScopeFromRoot(token.toString(), framePath())
        }
        assertLive(host)
        return build(host, host.store, record, token, key, args)
      default: {
        assertLive(host)
        const reused = current?.reuse != null ? reuseTransient(current, token, key) : null
        if (reused !== null) {
          return reused
        }
        if (current !== null || startedBy !== null) {
          assertNoTransientCycle(token, key)
        }
        return build(host, null, record, token, key, args)
      }
    }
  }
}

// The transient that a discarded pass of `frame` built for the same request,
// handed back to the pass that repeats it, unless something it injected has
// gone since.
function reuseTransient(
  frame: Frame,
  token: InjectionToken<any, any>,
  key: string | null,
): Entry | null {
  const reuse = frame.reuse!
  const index = reuse.findIndex((candidate) => candidate.token === token && candidate.key === key)
  if (index < 0) {
    return null
  }
  const [reused] = reuse.splice(index, 1)
  if (reused.status === EntryStatus.Ready && isIntact(reused)) {
    relink(reused)
    return reused
  }
  discard(reused)
  return null
}

// Resolves any injectable reference against `host`, as `resolve()` does a
// normalised token. The args of a factory token that are still being
// computed are a `Wait`.
export function resolveReference(
  host: Host,
  raw: AnyInjectableType,
  rawArgs: unknown,
): Entry | Wait {
  const value = normalize(host, raw, rawArgs)
  return value !== null
    ? new Wait(value.promise!, null, false, raw as FactoryInjectionToken<any, any>, value)
    : resolve(host, normToken, normArgs)
}

function resolveAlias(host: Host, alias: InjectionToken<any, any>, rawArgs: unknown): Entry | Wait {
  const target = followAlias(host, alias, (host.root.usedAliases ??= new Set()))
  if (host.root.decorators?.has(alias) === true) {
    throw misuse(`${alias} is an alias of ${String(baseToken(target))}; decorate that instead`)
  }
  return resolveReference(host, target, rawArgs)
}

function build(
  host: Host,
  store: Store | null,
  record: ProviderRecord,
  token: InjectionToken<any, any>,
  key: string | null,
  args: unknown,
): Entry | Wait {
  const creator = store !== null ? null : current !== null ? current.entry : startedBy
  const entry = createEntry(record, token, key, args, host, store, creator)
  store?.set(token, key, entry)
  if (record.kind === 'value') {
    markReady(entry, record.value)
    return entry
  }

  const frame: Frame = {
    entry,
    parent: current,
    requests: record.plan === null ? [] : null,
    pending: null,
    given: 0,
    pass: null,
    used: null,
    reuse: null,
    failures: null,
    stopWhenPending: false,
  }

  let outcome: void | Promise<void>
  try {
    // While something is being destroyed, a dependency this class is known to
    // ask for may be on its way out. Constructing now would only produce a
    // pass that has to be thrown away, so wait for the destruction first.
    const leaving = isDestroying(host) && record.plan !== null ? leavingIn(host, record.plan) : null
    outcome = leaving !== null ? afterDestruction(frame, leaving) : pass(frame)
  } catch (error) {
    throw failEntry(frame.entry, error, frame)
  }
  if (outcome !== undefined) {
    const tracked = outcome.then(undefined, (error) => {
      throw failEntry(frame.entry, error, frame)
    })
    tracked.catch(noop)
    entry.promise = tracked
    if (store === null) {
      trackBuild(host, entry)
    }
  } else if (entry.status !== EntryStatus.Ready) {
    return new Wait(entry.promise ?? Promise.resolve(), null, true)
  }
  return entry
}

// Builds `frame` once the dependencies that were being destroyed are gone,
// so that the first construction pass already sees their replacements.
async function afterDestruction(frame: Frame, first: Entry[]): Promise<void> {
  const { entry } = frame
  const { host } = entry
  let leaving: Entry[] | null = first
  while (leaving !== null) {
    leaving.forEach((dependency) => addWaitEdge(entry, dependency))
    // Without a promise the destruction is in its synchronous part and is
    // over, or has a promise, one microtask later.
    await Promise.all(leaving.map((dependency) => dependency.promise))
    entry.waitingFor = null
    leaving = isDestroying(host) ? leavingIn(host, entry.record.plan!) : null
  }
  await replay(frame, true)
}

function instantiate(frame: Frame): unknown {
  const { record, args } = frame.entry
  frame.stopWhenPending = false
  switch (record.kind) {
    case 'class':
      return args !== undefined ? new record.target!(args) : new record.target!()
    case 'factory': {
      const builder = new record.target!()
      if (frame.pending !== null) {
        return undefined
      }
      if (typeof builder.create !== 'function') {
        throw new Error('Factory does not implement the create method')
      }
      frame.stopWhenPending = true
      return builder.create(createFactoryContext(frame.entry), args)
    }
    default:
      frame.stopWhenPending = true
      return record.fn!(createFactoryContext(frame.entry), args)
  }
}

// Runs the class or factory of `frame` once. When the pass met a dependency
// that is not ready (`frame.pending`), what it produced or threw is worthless,
// and so is the way a factory reacted to being stopped.
function runOnce(frame: Frame): unknown {
  const previous = enter(frame)
  let produced: unknown
  frame.pass = null
  try {
    produced = instantiate(frame)
  } catch (error) {
    // With something pending the pass is repeated anyway, and what it threw
    // may come from using a placeholder. The error of a dependency that has
    // failed does not, and waiting for the others would not change it.
    if (frame.pending === null || frame.failures?.some((failure) => failure.error === error)) {
      throw error
    }
  } finally {
    enter(previous)
  }
  if (frame.pending !== null) {
    frame.given = (frame.entry.deps?.length ?? 0) + (frame.used?.length ?? 0)
    const pass = frame.pass as Pass | null
    if (pass !== null) {
      pass.discarded = true
    }
    // The pass is discarded, so nothing depends on what it was given.
    unlink(frame.entry)
    if (frame.entry.record.kind !== 'class' && isThenable(produced)) {
      // An asynchronous factory reports being stopped, or failing on a
      // placeholder, through a promise that nobody else observes.
      Promise.resolve(produced).then(noop, noop)
    }
  }
  return produced
}

// One construction pass. Returns a promise when the entry cannot become ready
// synchronously.
function pass(frame: Frame): void | Promise<void> {
  const produced = runOnce(frame)
  // With something pending, what the pass produced was built against
  // placeholders and is discarded.
  return frame.pending !== null ? replay(frame, false) : settle(frame, produced)
}

// How often a build is repeated, and how many passes in a row may get no
// further than those before them.
export const MAX_PASSES = 32

async function replay(frame: Frame, planned: boolean): Promise<void> {
  const { entry } = frame
  const missed = new Set<unknown>()
  let mostGiven = 0
  for (let attempt = 0, idle = 0; idle < MAX_PASSES; attempt++) {
    if (!planned || attempt > 0) {
      await pendingOf(frame)
      frame.reuse = frame.used
      frame.requests = entry.record.plan === null ? [] : null
      frame.pending = null
      frame.used = null
    }
    entry.waitingFor = null
    assertLive(entry.host)
    if (entry.stale && entry.store === null) {
      throw misuse(`What ${entry.token} was built for is gone`)
    }

    const produced = runOnce(frame)

    if (frame.reuse !== null) {
      // Transients the discarded pass built that this pass did not ask for.
      frame.reuse.forEach(discard)
      frame.reuse = null
    }

    if (frame.pending === null) {
      return settle(frame, produced)
    }
    // By token: args that differ in every pass are no progress.
    const known = missed.size
    frame.pending.forEach((dependency) => missed.add(baseToken(dependency.token)))
    idle = missed.size > known || frame.given > mostGiven ? 0 : idle + 1
    mostGiven = Math.max(mostGiven, frame.given)
  }
  const pending = frame.pending!
  throw misuse(
    `${entry.token} did not settle: ${MAX_PASSES} construction passes in a row got no further than ` +
      `${pending.map((dependency) => dependency.name).join(', ')}, which was not ready.` +
      (pending.some((dependency) => dependency.key !== null)
        ? ' What has an asynchronous initialiser and args that differ in every pass, such as a ' +
          'function created in the constructor, is built anew each time.'
        : ''),
  )
}

// Waits for what a discarded pass was missing. A dependency that fails ends
// the wait at once: the next pass throws its error where it is injected.
async function pendingOf(frame: Frame): Promise<void> {
  const pending = frame.pending!
  try {
    await Promise.all(pending.map((dependency) => dependency.promise))
  } catch {
    const failed = pending.filter((dependency) => dependency.failed)
    frame.failures = frame.failures === null ? failed : frame.failures.concat(failed)
  }
}

function settle(frame: Frame, produced: unknown): void | Promise<void> {
  const { entry } = frame
  const record = entry.record
  if (record.plan === null && frame.requests !== null) {
    record.plan = frame.requests
  }
  if (frame.used !== null) {
    entry.transients = entry.transients === null ? frame.used : entry.transients.concat(frame.used)
    frame.used = null
  }

  if (record.kind === 'class') {
    const instance = produced as { onServiceInit?: () => unknown }
    if (typeof instance.onServiceInit === 'function') {
      const initialised = runHook(entry, () => instance.onServiceInit!())
      if (isThenable(initialised)) {
        return Promise.resolve(initialised).then(() => complete(entry, instance))
      }
    }
    complete(entry, instance)
    return
  }

  if (isThenable(produced)) {
    return Promise.resolve(produced).then((value) => complete(entry, value))
  }
  complete(entry, produced)
}

function complete(entry: Entry, produced: unknown): void {
  if (entry.status !== EntryStatus.Creating) {
    return
  }
  if (entry.record.kind === 'class') {
    const instance = produced as { onServiceDestroy?: () => void | Promise<void> }
    if (typeof instance.onServiceDestroy === 'function') {
      const listener = () => instance.onServiceDestroy!()
      if (entry.destroyListeners === null) {
        entry.destroyListeners = [listener]
      } else {
        entry.destroyListeners.push(listener)
      }
    }
  }
  let value = produced
  const decorators = entry.host.root.decorators?.get(entry.token)
  if (decorators !== undefined) {
    const info = { token: entry.token, args: entry.args }
    outside(() => {
      for (const decorate of decorators) {
        value = decorate(value, info)
      }
    })
  }
  settleEntry(entry, value)
}
