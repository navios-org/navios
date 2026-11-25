import { DIError } from '../errors/di-error.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { validateSync } from '../schema/standard-schema.mjs'

import type { PlanEntry, ProviderRecord } from '../provider/provider-record.mjs'
import type { AnyInjectableType, InjectionToken } from '../token/injection-token.mjs'

import { argsKey } from './args-key.mjs'
import { destroyEntry } from './destruction.mjs'
import { createEntry, EntryStatus } from './entry.mjs'
import { createFactoryContext } from './inject-impl.mjs'
import { isDestroying, leavingIn } from './leaving.mjs'
import { addWaitEdge, unlink } from './links.mjs'
import { baseToken, lookupRecord, normalize, normArgs, normToken } from './normalize.mjs'
import { isThenable, noop } from './thenable.mjs'

import type { Entry } from './entry.mjs'
import type { Host } from './host.mjs'
import type { Store } from './store.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A resolution that cannot proceed until `promise` settles; the caller
 * retries afterwards.
 * @internal
 */
export class Wait {
  constructor(public readonly promise: Promise<unknown>) {}
}

export interface Frame {
  readonly host: Host
  readonly entry: Entry
  readonly parent: Frame | null
  /** Requests made in the current pass; `null` once the plan is known. */
  requests: PlanEntry[] | null
  /** Set when the current pass met a dependency that is not ready. */
  pending: Promise<unknown>[] | null
  /** Transients built or reused in the current pass. */
  used: Entry[] | null
  /** Transients left over from a discarded pass, handed back on replay. */
  reuse: Entry[] | null
  /**
   * Stop the pass at the first dependency that is not ready instead of
   * handing out a placeholder. Set while a factory runs: unlike a constructor
   * it goes on to use what it injected.
   */
  stopWhenPending: boolean
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

export let current: Frame | null = null

function framePath(): string[] {
  const path: string[] = []
  for (let frame = current; frame !== null; frame = frame.parent) {
    path.unshift(frame.entry.token.toString())
  }
  return path
}

function onStack(entry: Entry): boolean {
  for (let frame = current; frame !== null; frame = frame.parent) {
    if (frame.entry === entry) {
      return true
    }
  }
  return false
}

function cyclePath(entry: Entry): string[] {
  const path = framePath()
  const name = entry.token.toString()
  const start = path.indexOf(name)
  return [...(start >= 0 ? path.slice(start) : path), name]
}

/**
 * Resolves a normalised token against `host`. Returns a ready entry, an entry
 * that is still being created (await `entry.promise`), or a `Wait`.
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
  const key = args === undefined ? null : argsKey(args)

  for (;;) {
    let existing = host.isScope ? host.store.get(token, key) : undefined
    if (existing === undefined) {
      existing = host.root.store.get(token, key)
    }
    if (existing !== undefined) {
      switch (existing.status) {
        case EntryStatus.Ready:
          return existing
        case EntryStatus.Creating:
          if (onStack(existing)) {
            throw DIError.circularDependency(cyclePath(existing))
          }
          return existing
        case EntryStatus.Destroying:
          return new Wait(existing.destroyPromise ?? Promise.resolve())
        default:
          // A failed or destroyed entry that was not removed; drop it and retry.
          existing.store?.delete(existing)
          continue
      }
    }

    const record = lookupRecord(host, token)
    if (record === undefined) {
      if (token.scope === InjectableScope.Request && !host.isScope) {
        throw DIError.requestScopeFromRoot(token.toString(), framePath())
      }
      throw DIError.factoryNotFound(token.toString())
    }

    switch (record.scope) {
      case InjectableScope.Singleton:
        return build(host.root, host.root.store, record, token, key, args)
      case InjectableScope.Request:
        if (!host.isScope) {
          throw DIError.requestScopeFromRoot(token.toString(), framePath())
        }
        assertLive(host, null)
        return build(host, host.store, record, token, key, args)
      default:
        assertLive(host, null)
        // A transient is not stored, so one that leads back to itself is only
        // visible on the construction stack.
        for (let frame = current; frame !== null; frame = frame.parent) {
          const building = frame.entry
          if (building.store === null && building.token === token && building.key === key) {
            throw DIError.circularDependency(cyclePath(building))
          }
        }
        return build(host, null, record, token, key, args)
    }
  }
}

function build(
  host: Host,
  store: Store | null,
  record: ProviderRecord,
  token: InjectionToken<any, any>,
  key: string | null,
  args: unknown,
): Entry {
  const entry = createEntry(record, token, key, args, store)
  if (record.kind === 'value') {
    entry.instance = record.value
    entry.status = EntryStatus.Ready
    store?.set(token, key, entry)
    store?.trackInstance(entry)
    return entry
  }
  store?.set(token, key, entry)

  const frame: Frame = {
    host,
    entry,
    parent: current,
    requests: null,
    pending: null,
    used: null,
    reuse: null,
    stopWhenPending: false,
  }

  let outcome: void | Promise<void>
  try {
    // While something is being destroyed, a dependency this class is known to
    // ask for may be on its way out. Constructing now would only produce a
    // pass that has to be thrown away, so wait for the destruction first.
    const leaving = isDestroying(host) && record.plan !== null ? leavingIn(host, record.plan) : null
    if (leaving !== null) {
      outcome = afterDestruction(frame, leaving)
    } else {
      const waits =
        record.preResolve === true && record.plan !== null ? preResolve(frame, record.plan) : null
      if (waits === null && record.preResolve === true && record.plan !== null) {
        // Everything was ready this time; stop paying for the extra lookups
        // until a pass has to be discarded again.
        record.preResolve = false
      }
      outcome = waits === null ? pass(frame) : waits.then(() => replay(frame, true))
    }
  } catch (error) {
    throw fail(frame, error)
  }
  if (outcome !== undefined) {
    const tracked = outcome.then(undefined, (error) => {
      throw fail(frame, error)
    })
    tracked.catch(noop)
    entry.promise = tracked
  }
  return entry
}

/**
 * Resolves the dependencies a class is known to ask for before constructing
 * it, so that a dependency with an asynchronous initialiser does not force a
 * discarded construction pass. Only used for classes that needed a replay
 * before.
 */
function preResolve(frame: Frame, plan: PlanEntry[]): Promise<unknown> | null {
  let waits: Promise<unknown>[] | null = null
  const previous = current
  current = frame
  try {
    for (const request of plan) {
      const record = lookupRecord(frame.host, request.token)
      if (record === undefined || record.scope === InjectableScope.Transient) {
        continue
      }
      let resolved: Entry | Wait
      try {
        resolved = resolve(frame.host, request.token, undefined)
      } catch {
        // The constructor may not ask for this one this time. If it does, it
        // gets the error itself.
        continue
      }
      if (resolved instanceof Wait) {
        ;(waits ??= []).push(resolved.promise)
      } else if (resolved.status !== EntryStatus.Ready) {
        addWaitEdge(frame.entry, resolved)
        ;(waits ??= []).push(resolved.promise!.then(noop, noop))
      }
    }
  } finally {
    current = previous
  }
  return waits === null ? null : Promise.all(waits)
}

/**
 * Builds `frame` once the dependencies that were being destroyed are gone,
 * so that the first construction pass already sees their replacements.
 */
async function afterDestruction(frame: Frame, first: Promise<unknown>): Promise<void> {
  const { host, entry } = frame
  let leaving: Promise<unknown> | null = first
  while (leaving !== null) {
    await leaving
    leaving = isDestroying(host) ? leavingIn(host, entry.record.plan!) : null
  }
  const record = entry.record
  const waits = record.preResolve === true ? preResolve(frame, record.plan!) : null
  if (waits !== null) {
    await waits
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
      return builder.create(createFactoryContext(frame), args)
    }
    default:
      frame.stopWhenPending = true
      return record.fn!(createFactoryContext(frame), args)
  }
}

/**
 * Runs the class or factory of `frame` once. When the pass met a dependency
 * that is not ready (`frame.pending`), what it produced or threw is worthless,
 * and so is the way a factory reacted to being stopped.
 */
function runOnce(frame: Frame): unknown {
  const previous = current
  current = frame
  let produced: unknown
  try {
    produced = instantiate(frame)
  } catch (error) {
    // With something pending the pass is repeated anyway, and what it threw
    // may come from using a placeholder.
    if (frame.pending === null) {
      throw error
    }
  } finally {
    current = previous
  }
  if (frame.pending !== null && frame.entry.record.kind !== 'class' && isThenable(produced)) {
    // An asynchronous factory reports being stopped, or failing on a
    // placeholder, through a promise that nobody else observes.
    Promise.resolve(produced).then(noop, noop)
  }
  return produced
}

/**
 * One construction pass. Returns a promise when the entry cannot become ready
 * synchronously.
 */
function pass(frame: Frame): void | Promise<void> {
  const record = frame.entry.record
  frame.requests = record.plan === null ? [] : null
  frame.pending = null
  frame.used = null

  const produced = runOnce(frame)

  if (frame.pending !== null) {
    // The pass saw a dependency that is not ready. Whatever it produced was
    // built against placeholders and is discarded.
    record.preResolve = true
    return replay(frame, false)
  }
  return settle(frame, produced)
}

const MAX_PASSES = 32

async function replay(frame: Frame, planned: boolean): Promise<void> {
  const entry = frame.entry
  for (let attempt = 0; attempt < MAX_PASSES; attempt++) {
    if (!planned || attempt > 0) {
      await Promise.all(frame.pending!)
      frame.reuse = frame.used
    }
    entry.waitingFor = null

    const record = entry.record
    frame.requests = record.plan === null ? [] : null
    frame.pending = null
    frame.used = null

    const produced = runOnce(frame)

    if (frame.reuse !== null) {
      // Transients the discarded pass built that this pass did not ask for.
      for (const leftover of frame.reuse) {
        void destroyEntry(leftover)
      }
      frame.reuse = null
    }

    if (frame.pending === null) {
      const settled = settle(frame, produced)
      if (settled !== undefined) {
        await settled
      }
      return
    }
    record.preResolve = true
  }
  throw DIError.unknown(
    `[DI] ${entry.token.toString()} did not settle after ${MAX_PASSES} construction passes`,
  )
}

function settle(frame: Frame, produced: unknown): void | Promise<void> {
  const { entry, host } = frame
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
      const initialised = instance.onServiceInit()
      if (isThenable(initialised)) {
        return Promise.resolve(initialised).then(() => complete(entry, instance, host))
      }
    }
    complete(entry, instance, host)
    return
  }

  if (isThenable(produced)) {
    return Promise.resolve(produced).then((value) => complete(entry, value, host))
  }
  complete(entry, produced, host)
}

function complete(entry: Entry, produced: unknown, host: Host): void {
  if (entry.status !== EntryStatus.Creating) {
    return
  }
  if (entry.record.kind === 'class') {
    const instance = produced as { onServiceDestroy?: () => void | Promise<void> }
    if (typeof instance.onServiceDestroy === 'function') {
      ;(entry.destroyListeners ??= []).push(() => instance.onServiceDestroy!())
    }
  }
  let value = produced
  const decorators = host.root.decorators?.get(entry.token)
  if (decorators !== undefined) {
    const info = { token: entry.token, args: entry.args }
    for (const decorate of decorators) {
      value = decorate(value, info)
    }
  }
  entry.instance = value
  entry.status = EntryStatus.Ready
  entry.promise = null
  entry.waitingFor = null
  entry.store?.trackInstance(entry)
}

function fail(frame: Frame, error: unknown): DIError {
  const entry = frame.entry
  const wrapped =
    error instanceof DIError ? error : DIError.initializationError(entry.token.toString(), error)
  if (entry.status === EntryStatus.Creating) {
    entry.status = EntryStatus.Failed
    entry.error = wrapped
    entry.promise = null
    entry.waitingFor = null
    entry.store?.delete(entry)
    unlink(entry)
    // Also the transients of the pass that failed, which no one adopted.
    for (const transients of [entry.transients, frame.used, frame.reuse]) {
      if (transients !== null) {
        for (const transient of transients) {
          void destroyEntry(transient)
        }
      }
    }
    entry.transients = frame.used = frame.reuse = null
  }
  return wrapped
}

// Throws `ContainerDisposed` when `host` is a scope that has been disposed,
// so that nothing is built into it or handed out of it afterwards. `late` is
// what a resolution that was in flight produced; a transient is destroyed, a
// stored entry is left to the disposal.
export function assertLive(host: Host, late: Entry | null): void {
  if (host.disposed === true) {
    if (late !== null && late.store === null) {
      void destroyEntry(late)
    }
    throw DIError.containerDisposed('ScopedContainer')
  }
}

/**
 * Resolves from outside any construction (a `get` call), so the current
 * construction stack, if any, is not treated as the caller.
 * @internal
 */
export function resolveTop(host: Host, raw: AnyInjectableType, rawArgs: unknown): Entry | Wait {
  const previous = current
  current = null
  try {
    const wait = normalize(host, raw, rawArgs)
    if (wait !== null) {
      return new Wait(wait)
    }
    const resolved = resolve(host, normToken, normArgs)
    if (
      host.isScope &&
      !(resolved instanceof Wait) &&
      resolved.store === null &&
      resolved.status === EntryStatus.Ready &&
      (resolved.destroyListeners !== null || resolved.transients !== null)
    ) {
      ;(host.looseTransients ??= []).push(resolved)
    }
    return resolved
  } finally {
    current = previous
  }
}

/** @internal */
export async function resolveAsync(
  host: Host,
  raw: AnyInjectableType,
  rawArgs: unknown,
  /** Told which entry is being waited for, and `null` when the wait is over. */
  watch?: (waitingFor: Entry | null) => void,
): Promise<Entry> {
  for (;;) {
    const resolved = resolveTop(host, raw, rawArgs)
    if (resolved instanceof Wait) {
      await resolved.promise
      continue
    }
    if (resolved.status === EntryStatus.Ready) {
      assertLive(host, resolved)
      return resolved
    }
    if (resolved.status === EntryStatus.Creating) {
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
        assertLive(host, resolved)
        if (
          host.isScope &&
          resolved.store === null &&
          (resolved.destroyListeners !== null || resolved.transients !== null)
        ) {
          ;(host.looseTransients ??= []).push(resolved)
        }
        return resolved
      }
    }
  }
}

/** @internal */
export function resolveSyncOrThrow(host: Host, raw: AnyInjectableType, rawArgs: unknown): Entry {
  const resolved = resolveTop(host, raw, rawArgs)
  if (resolved instanceof Wait || resolved.status !== EntryStatus.Ready) {
    if (!(resolved instanceof Wait)) {
      // Someone must observe the rejection if the pending work fails.
      resolved.promise?.catch(noop)
    }
    throw DIError.asyncInitRequired(baseToken(raw)?.toString() ?? String(raw))
  }
  return resolved
}
